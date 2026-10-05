"use server";

import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import * as yauzl from "yauzl";
import { AuditAction, ItemCondition, ItemStatus, ItemType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auditActorName, auditEventData } from "@/lib/audit-event";
import { requireWriteAccess, type InventoryUser } from "@/lib/inventory-auth";
import { refreshInventoryViews } from "@/lib/refresh-inventory";
import {
  isInventoryAssetTag,
  nextCategoryAssetTagCode,
  nextInventoryAssetTag,
  nextLocationAssetTagCode,
} from "@/lib/asset-tag";
import { prisma } from "@/prisma";

export type ImportResult = {
  errors: string[];
  imported: number;
  previewed: boolean;
  skipped: number;
};
const emptyImportResult: ImportResult = { errors: [], imported: 0, previewed: false, skipped: 0 };

type ColumnMap = Record<string, number | undefined>;
type SetupRecord = { id: string; isActive: boolean };
type ValueReader = (column: string) => string;

/** A problem with one spreadsheet row that is safe and useful to show to staff. */
class ImportRowError extends Error {}

const maximumFileBytes = 10 * 1024 * 1024;
const maximumRows = 1_000;
const maximumColumns = 40;
const maximumXlsxArchiveEntries = 2_000;
const maximumXlsxUncompressedBytes = 50 * 1024 * 1024;

const columnAliases: Record<string, string[]> = {
  name: ["name", "itemname"],
  category: ["category", "categoryname", "classification"],
  location: ["location", "room", "roomname", "roomnumber"],
  roomNumber: ["roomnumber"],
  assetTag: ["assettag", "assetnumber", "inventorycode"],
  serialNumber: ["serialnumber", "serial"],
  itemType: ["type", "itemtype"],
  quantity: ["quantity", "qty"],
  isComputer: ["iscomputer", "computer", "ispc"],
  operatingSystem: ["operatingsystem", "os"],
  osVersion: ["osversion"],
  processor: ["processor", "cpu"],
  memoryGb: ["memorygb", "ramgb", "ram"],
  storageGb: ["storagegb", "diskgb", "storage"],
  storageType: ["storagetype", "disktype"],
  macAddress: ["macaddress", "mac"],
  ipAddress: ["ipaddress", "ip"],
  hardwareDescription: ["hardwaredescription", "hardwarenotes", "pcdescription"],
  softwareDescription: ["softwaredescription", "softwarenotes", "pcsoftwarenotes"],
  lastCheckedAt: ["lastcheckedat", "lastchecked", "lastdatechecked"],
  status: ["status"],
  condition: ["condition"],
  description: ["description"],
  manufacturer: ["manufacturer", "brand"],
  model: ["model", "productinfo"],
  purchaseDate: ["purchasedate", "datepurchased"],
  purchasePrice: ["purchaseprice", "price", "acquisitionvalue", "acquisitioncost", "cost"],
  notes: ["notes", "remarks"],
  graphics: ["graphics", "gpu"],
  legacyChecked: ["checked"],
  legacyAcquisitionDate: ["knownacquisitiondate"],
  legacyYearEncoded: ["yearencoded"],
  legacyUnit: ["unit"],
  legacyCounter: ["ctr"],
  legacyComments: ["comments"],
};

// Read a spreadsheet cell, including rich text and formula results.
function cellText(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("result" in value && value.result !== null && value.result !== undefined) {
      return cellText(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in value) {
      return String(value.text ?? "").trim();
    }
  }
  return String(value).trim();
}

// Match spreadsheet headings despite punctuation and spacing.
function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function boundedText(value: string, field: string, maximumLength = 2_000) {
  const result = value.trim();
  if (result.length > maximumLength) {
    throw new ImportRowError(`${field} is too long.`);
  }
  return result;
}

function optionalText(value: string, field: string, maximumLength = 2_000) {
  return boundedText(value, field, maximumLength) || null;
}

// Validate imported whole-number fields.
function parseNumber(value: string, fallback: number | null, field: string, maximum = 1_000_000) {
  if (!value) {
    return fallback;
  }
  if (!/^\d+$/.test(value)) {
    throw new ImportRowError(`${field} must be a non-negative whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ImportRowError(`${field} is outside the allowed range.`);
  }
  return parsed;
}

// Validate a price from the spreadsheet.
function parsePurchasePrice(value: string) {
  const amount = boundedText(value, "purchase price", 32);
  if (!amount) {
    return null;
  }
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(amount)) {
    throw new ImportRowError(
      "purchase price must be a non-negative Philippine peso amount with up to two decimal places.",
    );
  }
  const [whole, decimal = ""] = amount.split(".");
  return new Prisma.Decimal(`${whole}.${decimal.padEnd(2, "0")}`).toString();
}

// Convert a spreadsheet date into a valid date value.
function parseDate(value: string, field: string) {
  if (!value) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ImportRowError(`${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ImportRowError(`${field} is not a valid date.`);
  }
  return parsed;
}

function enumValue<T extends string>(
  value: string,
  values: readonly T[],
  fallback: T,
  field: string,
) {
  if (!value.trim()) {
    return fallback;
  }
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (values.includes(normalized as T)) {
    return normalized as T;
  }
  throw new ImportRowError(
    `${field} must be one of: ${values.map((entry) => entry.replaceAll("_", " ")).join(", ")}.`,
  );
}

// Map older inspection labels to current status values.
function legacyInspectionState(value: string) {
  switch (normalizedKey(value)) {
    case "defective":
      return { status: ItemStatus.DEFECTIVE, condition: ItemCondition.FOR_REPAIR };
    case "nottested":
      return { status: ItemStatus.NOT_TESTED, condition: ItemCondition.FAIR };
    case "deployed":
      return { status: ItemStatus.DEPLOYED, condition: ItemCondition.GOOD };
    case "working":
      return { status: ItemStatus.WORKING, condition: ItemCondition.GOOD };
    case "ok":
      return { status: ItemStatus.OK, condition: ItemCondition.GOOD };
    default:
      return null;
  }
}

// Keep useful details from older spreadsheet columns.
function legacyNotes(primaryNotes: string, values: Array<[string, string]>) {
  const context = values.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return optionalText([primaryNotes, ...context].filter(Boolean).join("\n"), "notes", 5_000);
}

// Match a header row to supported inventory fields.
function columnMapForRow(row: ExcelJS.Row): ColumnMap {
  const headers = new Map<string, number>();
  row.eachCell((cell, columnNumber) =>
    headers.set(normalizedKey(cellText(cell.value)), columnNumber),
  );
  return Object.fromEntries(
    Object.entries(columnAliases).map(([name, aliases]) => [
      name,
      aliases
        .map(normalizedKey)
        .map((alias) => headers.get(alias))
        .find(Boolean),
    ]),
  );
}

// Find the worksheet with inventory column headings.
function findInventorySheet(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 25); rowNumber += 1) {
      const columns = columnMapForRow(sheet.getRow(rowNumber));
      if (columns.name && columns.category) {
        return { sheet, columns, headerRowNumber: rowNumber };
      }
    }
  }
  return null;
}

function isTrue(value: string) {
  return ["true", "yes", "1", "y"].includes(value.toLowerCase());
}

function isXlsxFile(data: Buffer) {
  return (
    data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04
  );
}

// Check workbook size before unpacking the file.
async function validateXlsxArchive(data: Buffer) {
  const archive = await yauzl.fromBufferPromise(data, {
    lazyEntries: true,
    validateEntrySizes: true,
  });
  try {
    if (archive.entryCount > maximumXlsxArchiveEntries) {
      throw new Error("The Excel workbook contains too many files.");
    }
    let uncompressedBytes = 0;
    for await (const entry of archive.eachEntry()) {
      if (entry.fileName.endsWith("/")) {
        continue;
      }
      uncompressedBytes += entry.uncompressedSize;
      if (uncompressedBytes > maximumXlsxUncompressedBytes) {
        throw new Error("The Excel workbook expands beyond the allowed size.");
      }
    }
  } finally {
    archive.close();
  }
}

// Explain why an import row could not be saved.
function messageForImportError(error: unknown) {
  if (error instanceof ImportRowError) {
    return error.message;
  }
  if (error instanceof Error && /asset-tag/i.test(error.message)) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return "a unique asset tag, serial number, or PC MAC address already exists.";
  }
  return "could not be imported. Check the required fields and data format.";
}

type ParsedRow = {
  categoryName: string;
  computer: Prisma.ComputerCreateWithoutItemInput | null;
  item: Pick<
    Prisma.InventoryItemUncheckedCreateInput,
    | "condition"
    | "description"
    | "isComputer"
    | "itemType"
    | "lastCheckedAt"
    | "manufacturer"
    | "model"
    | "name"
    | "notes"
    | "purchaseDate"
    | "purchasePrice"
    | "quantity"
    | "serialNumber"
    | "status"
  >;
  locationName: string;
  roomNumber: string | null;
  suppliedAssetTag: string | null;
};

// Read and validate one spreadsheet row before anything is written.
function parseImportRow(
  valueAt: ValueReader,
  names: { categoryName: string; locationName: string; locationIsRoomNumber: boolean },
  defaults: { roomNumber: string | null },
): ParsedRow {
  const safeName = boundedText(valueAt("name"), "name", 255);
  const categoryName = boundedText(names.categoryName, "category", 120);
  const locationName = boundedText(names.locationName, "location", 160);
  const roomNumber = names.locationIsRoomNumber
    ? locationName
    : optionalText(valueAt("roomNumber") || defaults.roomNumber || "", "room number", 80);
  const itemType = enumValue(valueAt("itemType"), Object.values(ItemType), ItemType.ASSET, "type");
  const quantity = parseNumber(valueAt("quantity"), 1, "quantity") ?? 1;
  const hasComputerDetails =
    isTrue(valueAt("isComputer")) ||
    [
      "operatingSystem",
      "processor",
      "memoryGb",
      "macAddress",
      "hardwareDescription",
      "softwareDescription",
    ].some((column) => valueAt(column) !== "");
  if (itemType === ItemType.ASSET && quantity !== 1) {
    throw new ImportRowError(
      "each physical equipment asset must use quantity 1 so it can receive its own asset tag and QR code. Import each unit as a separate row, or use a supply record for stock.",
    );
  }
  if (hasComputerDetails && (itemType !== ItemType.ASSET || quantity !== 1)) {
    throw new ImportRowError("a PC must be a single tracked asset, not a supply record.");
  }
  const legacyChecked = valueAt("legacyChecked");
  const legacyState = legacyInspectionState(legacyChecked);
  const explicitStatus = valueAt("status");
  const explicitCondition = valueAt("condition");
  const legacyAcquisitionDate = valueAt("legacyAcquisitionDate");
  const sourcePurchaseDate = valueAt("purchaseDate");
  const purchaseDate = sourcePurchaseDate
    ? parseDate(sourcePurchaseDate, "purchase date")
    : /^\d{4}-\d{2}-\d{2}$/.test(legacyAcquisitionDate)
      ? parseDate(legacyAcquisitionDate, "known acquisition date")
      : null;
  const status = explicitStatus
    ? enumValue(explicitStatus, Object.values(ItemStatus), ItemStatus.OK, "status")
    : (legacyState?.status ?? ItemStatus.OK);
  const condition = explicitCondition
    ? enumValue(explicitCondition, Object.values(ItemCondition), ItemCondition.GOOD, "condition")
    : (legacyState?.condition ?? ItemCondition.GOOD);
  const suppliedAssetTag =
    optionalText(valueAt("assetTag"), "asset tag", 255)?.toUpperCase() ?? null;
  if (itemType === ItemType.ASSET && suppliedAssetTag && !isInventoryAssetTag(suppliedAssetTag)) {
    throw new ImportRowError(
      "asset tags must follow the established INV-CAT-ST-ROOM-0001 format, or leave the field blank to generate the next compatible tag.",
    );
  }
  const lastCheckedAt = parseDate(valueAt("lastCheckedAt"), "last checked date") ?? new Date();
  const notes = legacyNotes(valueAt("notes"), [
    ["Original unit", valueAt("legacyUnit")],
    ["Legacy counter", valueAt("legacyCounter")],
    ["Original checked value", legacyChecked],
    ["Known acquisition", legacyAcquisitionDate && !purchaseDate ? legacyAcquisitionDate : ""],
    ["Year encoded", valueAt("legacyYearEncoded")],
    ["Comments", valueAt("legacyComments")],
  ]);

  return {
    categoryName,
    locationName,
    roomNumber,
    suppliedAssetTag,
    item: {
      name: safeName,
      serialNumber:
        optionalText(valueAt("serialNumber"), "serial number", 255)?.toUpperCase() ?? null,
      description: optionalText(valueAt("description"), "description", 5_000),
      manufacturer: optionalText(valueAt("manufacturer"), "manufacturer", 255),
      model: optionalText(valueAt("model"), "model", 255),
      notes,
      purchaseDate,
      purchasePrice: parsePurchasePrice(valueAt("purchasePrice")),
      itemType,
      isComputer: hasComputerDetails,
      quantity,
      status,
      condition,
      lastCheckedAt,
    },
    computer: hasComputerDetails
      ? {
          operatingSystem: optionalText(valueAt("operatingSystem"), "operating system", 255),
          osVersion: optionalText(valueAt("osVersion"), "OS version", 255),
          processor: optionalText(valueAt("processor"), "processor", 255),
          memoryGb: parseNumber(valueAt("memoryGb"), null, "memory (GB)", 16_384),
          storageGb: parseNumber(valueAt("storageGb"), null, "storage (GB)"),
          storageType: optionalText(valueAt("storageType"), "storage type", 255),
          graphics: optionalText(valueAt("graphics"), "graphics", 255),
          macAddress:
            optionalText(valueAt("macAddress"), "MAC address", 255)?.toUpperCase() ?? null,
          ipAddress: optionalText(valueAt("ipAddress"), "IP address", 255),
          hardwareDescription: optionalText(
            valueAt("hardwareDescription"),
            "hardware description",
            5_000,
          ),
          softwareDescription: optionalText(
            valueAt("softwareDescription"),
            "software description",
            5_000,
          ),
          lastCheckedAt,
        }
      : null,
  };
}

function missingSetupMessage(kind: "category" | "location", name: string) {
  return `${kind} “${name}” does not exist. Enable setup creation or add it in Settings first.`;
}

function inactiveSetupMessage(kind: "category" | "location", name: string) {
  return `${kind} “${name}” is inactive. Reactivate it in Settings first.`;
}

// Find the category, creating it only when the import is allowed to.
async function resolveCategory(
  transaction: Prisma.TransactionClient,
  name: string,
  actor: InventoryUser,
  allowCreate: boolean,
): Promise<SetupRecord> {
  let category: SetupRecord | null = await transaction.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, isActive: true },
  });
  if (!category) {
    if (!allowCreate) {
      throw new ImportRowError(missingSetupMessage("category", name));
    }
    const codes = await transaction.category.findMany({ select: { assetTagCode: true } });
    category = await transaction.category.create({
      data: {
        name,
        assetTagCode: nextCategoryAssetTagCode(
          name,
          codes.map((entry) => entry.assetTagCode),
        ),
      },
      select: { id: true, isActive: true },
    });
    await transaction.inventoryAudit.create({
      data: auditEventData({
        action: "CREATED",
        actor,
        entity: { id: category.id, label: name, type: "category" },
        metadata: { activityKind: "configuration", source: "import" },
        summary: "Category created while importing inventory.",
      }),
    });
  }
  if (!category.isActive) {
    throw new ImportRowError(inactiveSetupMessage("category", name));
  }
  return category;
}

// Find the location, creating it only when the import is allowed to.
async function resolveLocation(
  transaction: Prisma.TransactionClient,
  name: string,
  roomNumber: string | null,
  actor: InventoryUser,
  allowCreate: boolean,
): Promise<SetupRecord> {
  let location: SetupRecord | null = await transaction.location.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, isActive: true },
  });
  if (!location) {
    if (!allowCreate) {
      throw new ImportRowError(missingSetupMessage("location", name));
    }
    const codes = await transaction.location.findMany({ select: { assetTagCode: true } });
    location = await transaction.location.create({
      data: {
        name,
        assetTagCode: nextLocationAssetTagCode(codes.map((entry) => entry.assetTagCode)),
        roomNumber,
      },
      select: { id: true, isActive: true },
    });
    await transaction.inventoryAudit.create({
      data: auditEventData({
        action: "CREATED",
        actor,
        entity: { id: location.id, label: name, type: "location" },
        metadata: { activityKind: "configuration", source: "import" },
        summary: "Location created while importing inventory.",
      }),
    });
  }
  if (!location.isActive) {
    throw new ImportRowError(inactiveSetupMessage("location", name));
  }
  return location;
}

// Save one validated row with its generated tag, computer profile, and audit entry.
async function saveImportedRow(
  client: Prisma.TransactionClient,
  row: ParsedRow,
  category: SetupRecord,
  location: SetupRecord,
  source: { actor: InventoryUser; rowNumber: number; sheetName: string },
) {
  const assetTag =
    row.item.itemType === ItemType.ASSET
      ? (row.suppliedAssetTag ??
        (await nextInventoryAssetTag(client, {
          categoryId: category.id,
          locationId: location.id,
          status: row.item.status ?? ItemStatus.OK,
        })))
      : row.suppliedAssetTag;
  await client.inventoryItem.create({
    data: {
      ...row.item,
      assetTag,
      categoryId: category.id,
      locationId: location.id,
      computer: row.computer ? { create: row.computer } : undefined,
      auditEvents: {
        create: {
          action: AuditAction.CREATED,
          summary: "Inventory item imported from file.",
          actorId: source.actor.id,
          actorName: auditActorName(source.actor),
          metadata: {
            source: "import",
            sheet: source.sheetName,
            row: source.rowNumber,
            activityKind: "record-create",
          },
        },
      },
    },
  });
}

type PreviewRow = {
  assetTag: string | null;
  macAddress: string | null;
  rowNumber: number;
  serialNumber: string | null;
};

// Compare validated preview rows with records that already exist.
async function existingIdentifierProblems(rows: PreviewRow[]) {
  const assetTags = rows.flatMap((row) => (row.assetTag ? [row.assetTag] : []));
  const serials = rows.flatMap((row) => (row.serialNumber ? [row.serialNumber] : []));
  const macs = rows.flatMap((row) => (row.macAddress ? [row.macAddress] : []));
  const [items, computers] = await Promise.all([
    assetTags.length || serials.length
      ? prisma.inventoryItem.findMany({
          where: {
            OR: [
              ...(assetTags.length ? [{ assetTag: { in: assetTags } }] : []),
              ...(serials.length ? [{ serialNumber: { in: serials } }] : []),
            ],
          },
          select: { assetTag: true, serialNumber: true },
        })
      : Promise.resolve([]),
    macs.length
      ? prisma.computer.findMany({
          where: { macAddress: { in: macs } },
          select: { macAddress: true },
        })
      : Promise.resolve([]),
  ]);
  const knownTags = new Set(items.flatMap((item) => (item.assetTag ? [item.assetTag] : [])));
  const knownSerials = new Set(
    items.flatMap((item) => (item.serialNumber ? [item.serialNumber] : [])),
  );
  const knownMacs = new Set(
    computers.flatMap((computer) => (computer.macAddress ? [computer.macAddress] : [])),
  );
  const problems = new Map<number, string>();
  for (const row of rows) {
    if (row.assetTag && knownTags.has(row.assetTag)) {
      problems.set(row.rowNumber, `asset tag ${row.assetTag} is already assigned to a record.`);
    } else if (row.serialNumber && knownSerials.has(row.serialNumber)) {
      problems.set(
        row.rowNumber,
        `serial number ${row.serialNumber} is already assigned to a record.`,
      );
    } else if (row.macAddress && knownMacs.has(row.macAddress)) {
      problems.set(row.rowNumber, `MAC address ${row.macAddress} is already assigned to a PC.`);
    }
  }
  return problems;
}

const maximumReportedProblems = 20;

// Validate the file before writing records.
export async function importInventory(
  _previousState: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const actor = await requireWriteAccess();
  const file = formData.get("file");
  const allowCreateSetup = formData.get("createMissingSetup") === "on";
  const previewOnly = formData.get("previewOnly") === "on";
  let defaultLocationName: string | null;
  let defaultRoomNumber: string | null;
  try {
    defaultLocationName = optionalText(
      formText(formData, "defaultLocation"),
      "default location",
      160,
    );
    defaultRoomNumber = optionalText(
      formText(formData, "defaultRoomNumber"),
      "default room number",
      80,
    );
  } catch (error) {
    return { ...emptyImportResult, errors: [messageForImportError(error)] };
  }
  if (!(file instanceof File) || !file.size) {
    return { ...emptyImportResult, errors: ["Choose a non-empty CSV or Excel file."] };
  }
  if (file.size > maximumFileBytes) {
    return { ...emptyImportResult, errors: ["The import file must be 10 MB or smaller."] };
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    return { ...emptyImportResult, errors: ["Only .csv and .xlsx files are supported."] };
  }

  let workbook: ExcelJS.Workbook;
  try {
    const data = Buffer.from(await file.arrayBuffer());
    if (extension === "xlsx" && !isXlsxFile(data)) {
      return { ...emptyImportResult, errors: ["The selected file is not a valid Excel workbook."] };
    }
    if (extension === "csv" && data.includes(0)) {
      return {
        ...emptyImportResult,
        errors: ["The selected CSV file contains unsupported binary data."],
      };
    }
    if (extension === "xlsx") {
      await validateXlsxArchive(data);
    }
    workbook = new ExcelJS.Workbook();
    if (extension === "csv") {
      await workbook.csv.read(Readable.from([data]));
    } else {
      await workbook.xlsx.load(data as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ...emptyImportResult,
      errors: [
        message.includes("allowed") || message.includes("too many")
          ? message
          : "The spreadsheet could not be read. Save it again as a CSV or .xlsx file and retry.",
      ],
    };
  }

  const source = findInventorySheet(workbook);
  if (!source || source.sheet.actualRowCount < 2) {
    return {
      ...emptyImportResult,
      errors: [
        "The file needs a row with name/item name and category/classification headers, plus at least one inventory row.",
      ],
    };
  }
  const { sheet, columns, headerRowNumber } = source;
  if (sheet.actualRowCount > maximumRows + 1) {
    return {
      ...emptyImportResult,
      errors: [`Import up to ${maximumRows.toLocaleString()} inventory rows at a time.`],
    };
  }
  if (sheet.actualColumnCount > maximumColumns) {
    return {
      ...emptyImportResult,
      errors: [`The file has too many columns. Keep it to ${maximumColumns} columns or fewer.`],
    };
  }

  const missing = ["name", "category"].filter((column) => !columns[column]);
  if (!columns.location && !defaultLocationName) {
    missing.push("location (or a default location below)");
  }
  if (missing.length) {
    return { ...emptyImportResult, errors: [`Missing required column(s): ${missing.join(", ")}.`] };
  }

  const categoryCache = new Map<string, SetupRecord>();
  const locationCache = new Map<string, SetupRecord>();
  // A preview reads setup records once so every row is checked against Settings.
  const [knownCategories, knownLocations] = previewOnly
    ? await Promise.all([
        prisma.category.findMany({ select: { name: true, isActive: true } }),
        prisma.location.findMany({ select: { name: true, isActive: true } }),
      ])
    : [[], []];
  const categoryStatus = new Map(
    knownCategories.map((entry) => [normalizedValue(entry.name), entry.isActive]),
  );
  const locationStatus = new Map(
    knownLocations.map((entry) => [normalizedValue(entry.name), entry.isActive]),
  );
  const problems: { message: string; rowNumber: number }[] = [];
  const previewIdentifiers = new Set<string>();
  const previewRows: PreviewRow[] = [];
  let imported = 0;
  let skipped = 0;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const valueAt: ValueReader = (column) => {
      const columnNumber = columns[column];
      return columnNumber ? cellText(row.getCell(columnNumber).value) : "";
    };
    const name = valueAt("name");
    const categoryName = valueAt("category");
    const sourceLocationName = valueAt("location");
    if (!name && !categoryName && !sourceLocationName) {
      continue;
    }
    const locationName = sourceLocationName || defaultLocationName || "";
    if (!name || !categoryName || !locationName) {
      skipped += 1;
      problems.push({ rowNumber, message: "name, category, and location are required." });
      continue;
    }

    try {
      const parsed = parseImportRow(
        valueAt,
        {
          categoryName,
          locationName,
          locationIsRoomNumber:
            columns.location !== undefined && columns.location === columns.roomNumber,
        },
        { roomNumber: defaultRoomNumber },
      );
      const categoryKey = normalizedValue(parsed.categoryName);
      const locationKey = normalizedValue(parsed.locationName);

      if (previewOnly) {
        const categoryActive = categoryStatus.get(categoryKey);
        if (categoryActive === undefined && !allowCreateSetup) {
          throw new ImportRowError(missingSetupMessage("category", parsed.categoryName));
        }
        if (categoryActive === false) {
          throw new ImportRowError(inactiveSetupMessage("category", parsed.categoryName));
        }
        const locationActive = locationStatus.get(locationKey);
        if (locationActive === undefined && !allowCreateSetup) {
          throw new ImportRowError(missingSetupMessage("location", parsed.locationName));
        }
        if (locationActive === false) {
          throw new ImportRowError(inactiveSetupMessage("location", parsed.locationName));
        }
        const identifiers = [
          parsed.suppliedAssetTag,
          parsed.item.serialNumber,
          parsed.computer?.macAddress,
        ].filter(Boolean) as string[];
        if (identifiers.some((identifier) => previewIdentifiers.has(identifier))) {
          throw new ImportRowError(
            "a repeated asset tag, serial number, or PC MAC address appears in this file.",
          );
        }
        identifiers.forEach((identifier) => previewIdentifiers.add(identifier));
        previewRows.push({
          rowNumber,
          assetTag: parsed.suppliedAssetTag,
          serialNumber: parsed.item.serialNumber ?? null,
          macAddress: parsed.computer?.macAddress ?? null,
        });
        imported += 1;
        continue;
      }

      const savedSource = { actor, rowNumber, sheetName: sheet.name };
      const cachedCategory = categoryCache.get(categoryKey);
      const cachedLocation = locationCache.get(locationKey);
      if (cachedCategory && cachedLocation) {
        await saveImportedRow(prisma, parsed, cachedCategory, cachedLocation, savedSource);
        imported += 1;
        continue;
      }

      const result = await prisma.$transaction(async (transaction) => {
        const category =
          categoryCache.get(categoryKey) ??
          (await resolveCategory(transaction, parsed.categoryName, actor, allowCreateSetup));
        const location =
          locationCache.get(locationKey) ??
          (await resolveLocation(
            transaction,
            parsed.locationName,
            parsed.roomNumber,
            actor,
            allowCreateSetup,
          ));
        await saveImportedRow(transaction, parsed, category, location, savedSource);
        return { category, location };
      });

      categoryCache.set(categoryKey, result.category);
      locationCache.set(locationKey, result.location);
      imported += 1;
    } catch (error) {
      skipped += 1;
      problems.push({ rowNumber, message: messageForImportError(error) });
    }
  }

  if (previewOnly && previewRows.length) {
    const conflicts = await existingIdentifierProblems(previewRows);
    for (const [rowNumber, message] of conflicts) {
      imported -= 1;
      skipped += 1;
      problems.push({ rowNumber, message });
    }
  }

  if (!previewOnly) {
    refreshInventoryViews();
    revalidatePath("/dashboard/settings");
  }
  problems.sort((left, right) => left.rowNumber - right.rowNumber);
  const errors = problems
    .slice(0, maximumReportedProblems)
    .map((problem) => `Row ${problem.rowNumber}: ${problem.message}`);
  if (problems.length > maximumReportedProblems) {
    errors.push(
      `…and ${problems.length - maximumReportedProblems} more rows need correction. Fix these first, then validate again.`,
    );
  }
  return { imported, skipped, errors, previewed: previewOnly };
}
