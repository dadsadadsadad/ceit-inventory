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
import { customFieldsFor, type CustomFieldDefinition } from "@/lib/custom-fields";
import { loadCustomFields } from "@/lib/custom-field-queries";
import {
  fieldLabels,
  matchHeaders,
  normalizeHeader,
  type HeaderCell,
  type HeaderMatch,
  type ImportField,
} from "@/lib/import/columns";
import { importedCustomValues } from "@/lib/import/custom";
import {
  ImportRowError,
  isSummaryName,
  isYes,
  looseCondition,
  looseItemType,
  loosePrice,
  looseSizeGb,
  looseStatus,
  looseWholeNumber,
  optionalDate,
  type Warn,
} from "@/lib/import/values";
import { maximumNewUnits } from "../actions/shared";
import { prisma } from "@/prisma";

export type ImportResult = {
  errors: string[];
  /** Things that were adjusted so a row could still be imported. */
  warnings: string[];
  /** What was done with the file as a whole: sheet used, extra columns, blank rows. */
  notices: string[];
  /** Columns that were understood, as "heading in the file" and the field it fills. */
  matched: { header: string; label: string }[];
  /** Rows read from the file. */
  imported: number;
  /** Records made from those rows (a row of five identical units makes five). */
  records: number;
  previewed: boolean;
  skipped: number;
};
const emptyImportResult: ImportResult = {
  errors: [],
  imported: 0,
  matched: [],
  notices: [],
  previewed: false,
  records: 0,
  skipped: 0,
  warnings: [],
};

type SetupRecord = { id: string; isActive: boolean };
type ValueReader = (column: ImportField) => string;

const maximumFileBytes = 10 * 1024 * 1024;
const maximumRows = 1_000;
// Rows scanned past the heading; a sheet padded with formatting can report far more than it holds.
const maximumScannedRows = 25_000;
const maximumXlsxArchiveEntries = 2_000;
const maximumXlsxUncompressedBytes = 50 * 1024 * 1024;
const maximumReported = 20;
const fallbackCategoryName = "Uncategorized";
const fallbackLocationName = "Unassigned";

// Read a spreadsheet cell, including rich text and formula results.
function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("error" in value) {
      return "";
    }
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

// Map older inspection labels to current status values.
function legacyInspectionState(value: string) {
  switch (normalizeHeader(value)) {
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

// Keep useful details from older spreadsheet columns and from columns we have no field for.
function combinedNotes(primaryNotes: string, values: Array<[string, string]>) {
  const context = values.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return optionalText([primaryNotes, ...context].filter(Boolean).join("\n"), "notes", 5_000);
}

function rowCells(row: ExcelJS.Row): HeaderCell[] {
  const cells: HeaderCell[] = [];
  row.eachCell((cell, column) => {
    const text = cellText(cell.value);
    if (text) {
      cells.push({ column, text });
    }
  });
  return cells;
}

/**
 * The heading row: whichever of the first rows (on any sheet) names the most inventory fields,
 * provided it names the item. Title rows above the table and several sheets are both fine.
 */
function findInventorySheet(workbook: ExcelJS.Workbook) {
  let best: { headerRowNumber: number; match: HeaderMatch; sheet: ExcelJS.Worksheet } | null = null;
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 25); rowNumber += 1) {
      const match = matchHeaders(rowCells(sheet.getRow(rowNumber)));
      if (match.columns.name && (!best || match.score > best.match.score)) {
        best = { headerRowNumber: rowNumber, match, sheet };
      }
    }
  }
  return best;
}

// The headings of the first sheet, to show when nothing in the file looks like an item name.
function foundHeadings(workbook: ExcelJS.Workbook) {
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }
  let widest: HeaderCell[] = [];
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 25); rowNumber += 1) {
    const cells = rowCells(sheet.getRow(rowNumber));
    if (cells.length > widest.length) {
      widest = cells;
    }
  }
  return widest.slice(0, 12).map((cell) => cell.text);
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
  return "could not be imported. Check the data in this row.";
}

type ParsedRow = {
  categoryName: string;
  computer: Prisma.ComputerCreateWithoutItemInput | null;
  customValues: Record<string, string | number | boolean>;
  item: Pick<
    Prisma.InventoryItemUncheckedCreateInput,
    | "condition"
    | "description"
    | "isComputer"
    | "itemType"
    | "lastCheckedAt"
    | "lowStockThreshold"
    | "manufacturer"
    | "model"
    | "name"
    | "notes"
    | "purchaseDate"
    | "purchasePrice"
    | "quantity"
    | "serialNumber"
    | "status"
    | "warrantyEndsAt"
  >;
  locationName: string;
  roomNumber: string | null;
  suppliedAssetTag: string | null;
  /** How many identical tracked units this row makes. */
  units: number;
};

type RowSettings = {
  customColumns: { column: number; field: CustomFieldDefinition }[];
  defaultCategory: string | null;
  defaultLocation: string | null;
  defaultRoomNumber: string | null;
  keptColumns: { column: number; header: string }[];
  locationIsRoomNumber: boolean;
};

// Read one spreadsheet row. Only the item name is required; everything else has a sensible default.
function parseImportRow(
  valueAt: ValueReader,
  cellAt: (column: number) => string,
  settings: RowSettings,
  warn: Warn,
  fallbacks: { category: number; location: number },
): ParsedRow {
  const name = boundedText(valueAt("name"), "Item name", 255);
  const categoryCell = valueAt("category");
  const locationCell = valueAt("location");
  if (!categoryCell && !settings.defaultCategory) {
    fallbacks.category += 1;
  }
  if (!locationCell && !settings.defaultLocation) {
    fallbacks.location += 1;
  }
  const categoryName = boundedText(
    categoryCell || settings.defaultCategory || fallbackCategoryName,
    "Category",
    120,
  );
  const locationName = boundedText(
    locationCell || settings.defaultLocation || fallbackLocationName,
    "Location",
    160,
  );
  const roomNumber = settings.locationIsRoomNumber
    ? locationName
    : optionalText(valueAt("roomNumber") || settings.defaultRoomNumber || "", "Room number", 80);

  const itemType = looseItemType(valueAt("itemType"), warn);
  const hasComputerDetails =
    isYes(valueAt("isComputer")) ||
    (
      [
        "operatingSystem",
        "processor",
        "memoryGb",
        "macAddress",
        "hardwareDescription",
        "softwareDescription",
      ] as const
    ).some((column) => valueAt(column) !== "");

  let quantity = looseWholeNumber(valueAt("quantity"), 1, "Quantity", warn) ?? 1;
  let units = 1;
  if (itemType === ItemType.ASSET) {
    if (quantity === 0) {
      warn("Quantity 0 was changed to 1 because equipment is tracked one unit at a time.");
    }
    units = Math.max(quantity, 1);
    quantity = 1;
    if (units > maximumNewUnits) {
      throw new ImportRowError(
        `a quantity above ${maximumNewUnits} is too many tracked units for one row. Split it into several rows, or mark the row as stock.`,
      );
    }
  }
  const suppliedAssetTagText =
    optionalText(valueAt("assetTag"), "Asset tag", 255)?.toUpperCase() ?? null;
  const serialNumber =
    optionalText(valueAt("serialNumber"), "Serial number", 255)?.toUpperCase() ?? null;
  const macAddress = hasComputerDetails
    ? (optionalText(valueAt("macAddress"), "MAC address", 255)?.toUpperCase() ?? null)
    : null;
  if (units > 1 && (suppliedAssetTagText || serialNumber || macAddress)) {
    throw new ImportRowError(
      `has quantity ${units} but only one asset tag, serial number, or MAC address. Each unit needs its own, so use one row per unit, or leave them blank to generate tags.`,
    );
  }
  if (units > 1 && hasComputerDetails) {
    throw new ImportRowError("a PC must be one row per computer, not a quantity.");
  }
  if (hasComputerDetails && itemType !== ItemType.ASSET) {
    throw new ImportRowError("a PC must be a tracked equipment item, not stock.");
  }

  const legacyChecked = valueAt("legacyChecked");
  const legacyState = legacyInspectionState(legacyChecked);
  const status = valueAt("status")
    ? looseStatus(valueAt("status"), legacyState?.status ?? ItemStatus.OK, warn)
    : (legacyState?.status ?? ItemStatus.OK);
  const condition = valueAt("condition")
    ? looseCondition(valueAt("condition"), legacyState?.condition ?? ItemCondition.GOOD, warn)
    : (legacyState?.condition ?? ItemCondition.GOOD);

  const legacyAcquisition = valueAt("legacyAcquisitionDate");
  const purchaseDate =
    optionalDate(valueAt("purchaseDate"), "Purchase date", warn) ??
    optionalDate(legacyAcquisition, "Known acquisition date", warn);
  const lastCheckedAt =
    optionalDate(valueAt("lastCheckedAt"), "Last checked date", warn) ?? new Date();

  // A tag that does not follow this system's format is replaced by a generated one; the original
  // is kept in the notes so nothing is lost.
  let suppliedAssetTag = suppliedAssetTagText;
  let originalTag = "";
  if (itemType === ItemType.ASSET && suppliedAssetTag && !isInventoryAssetTag(suppliedAssetTag)) {
    warn(
      `Asset tag “${suppliedAssetTag.slice(0, 40)}” is not in the INV-… format, so a new tag was generated and the old one was kept in the notes.`,
    );
    originalTag = suppliedAssetTag;
    suppliedAssetTag = null;
  }

  const customValues = importedCustomValues(
    settings.customColumns.map(({ column, field }) => ({ field, raw: cellAt(column) })),
    warn,
  );
  const notes = combinedNotes(valueAt("notes"), [
    ["Original asset tag", originalTag],
    ["Original unit", valueAt("legacyUnit")],
    ["Legacy counter", valueAt("legacyCounter")],
    ["Original checked value", legacyChecked],
    ["Known acquisition", legacyAcquisition && !purchaseDate ? legacyAcquisition : ""],
    ["Year encoded", valueAt("legacyYearEncoded")],
    ["Comments", valueAt("legacyComments")],
    ...settings.keptColumns.map(({ column, header }): [string, string] => [header, cellAt(column)]),
  ]);

  return {
    categoryName,
    locationName,
    roomNumber,
    suppliedAssetTag,
    units,
    customValues,
    item: {
      name,
      serialNumber,
      description: optionalText(valueAt("description"), "Description", 5_000),
      manufacturer: optionalText(valueAt("manufacturer"), "Manufacturer", 255),
      model: optionalText(valueAt("model"), "Model", 255),
      notes,
      purchaseDate,
      purchasePrice: loosePrice(valueAt("purchasePrice"), warn),
      warrantyEndsAt: optionalDate(valueAt("warrantyEndsAt"), "Warranty end date", warn),
      itemType,
      isComputer: hasComputerDetails,
      quantity,
      lowStockThreshold:
        itemType === ItemType.SUPPLY
          ? looseWholeNumber(valueAt("lowStockThreshold"), null, "Low stock level", warn, 100_000)
          : null,
      status,
      condition,
      lastCheckedAt,
    },
    computer: hasComputerDetails
      ? {
          operatingSystem: optionalText(valueAt("operatingSystem"), "Operating system", 255),
          osVersion: optionalText(valueAt("osVersion"), "OS version", 255),
          processor: optionalText(valueAt("processor"), "Processor", 255),
          memoryGb: looseSizeGb(valueAt("memoryGb"), "Memory", warn, 16_384),
          storageGb: looseSizeGb(valueAt("storageGb"), "Storage", warn),
          storageType: optionalText(valueAt("storageType"), "Storage type", 255),
          graphics: optionalText(valueAt("graphics"), "Graphics", 255),
          macAddress,
          ipAddress: optionalText(valueAt("ipAddress"), "IP address", 255),
          hardwareDescription: optionalText(
            valueAt("hardwareDescription"),
            "Hardware description",
            5_000,
          ),
          softwareDescription: optionalText(
            valueAt("softwareDescription"),
            "Software description",
            5_000,
          ),
          lastCheckedAt,
        }
      : null,
  };
}

function missingSetupMessage(kind: "category" | "location", name: string) {
  return `${kind} “${name}” does not exist. Tick “Create missing categories and locations”, or add it in Settings first.`;
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

// Save one validated row (one record, or several identical units) with generated tags and audit entries.
async function saveImportedRow(
  client: Prisma.TransactionClient,
  row: ParsedRow,
  category: SetupRecord,
  location: SetupRecord,
  customDefinitions: CustomFieldDefinition[],
  source: { actor: InventoryUser; rowNumber: number; sheetName: string },
) {
  const applicable = new Set(
    customFieldsFor(customDefinitions, {
      categoryId: category.id,
      itemType: row.item.itemType as ItemType,
    }).map((field) => field.id),
  );
  const customFields = Object.fromEntries(
    Object.entries(row.customValues).filter(([id]) => applicable.has(id)),
  );
  for (let unit = 1; unit <= row.units; unit += 1) {
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
        name: row.units > 1 ? `${row.item.name} #${unit}`.slice(0, 255) : row.item.name,
        assetTag,
        categoryId: category.id,
        locationId: location.id,
        customFields: Object.keys(customFields).length ? customFields : undefined,
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
              ...(row.units > 1 ? { unit, units: row.units } : {}),
            },
          },
        },
      },
    });
  }
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

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function listed(values: string[], limit = 6) {
  const shown = values.slice(0, limit).map((value) => `“${value}”`);
  return values.length > limit
    ? `${shown.join(", ")} and ${values.length - limit} more`
    : shown.join(", ");
}

// Read the file and import (or just check) every row that can be understood.
export async function importInventory(
  _previousState: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const actor = await requireWriteAccess();
  const file = formData.get("file");
  const allowCreateSetup = formData.get("createMissingSetup") === "on";
  const keepExtraColumns = formData.get("keepExtraColumns") === "on";
  const previewOnly = formData.get("intent") === "check" || formData.get("previewOnly") === "on";
  const fail = (message: string): ImportResult => ({ ...emptyImportResult, errors: [message] });
  let defaultCategoryName: string | null;
  let defaultLocationName: string | null;
  let defaultRoomNumber: string | null;
  try {
    defaultCategoryName = optionalText(
      formText(formData, "defaultCategory"),
      "default category",
      120,
    );
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
    return fail(messageForImportError(error));
  }
  if (!(file instanceof File) || !file.size) {
    return fail("Choose a non-empty CSV or Excel file.");
  }
  if (file.size > maximumFileBytes) {
    return fail("The import file must be 10 MB or smaller.");
  }

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    return fail("Only .csv and .xlsx files are supported. In Excel, use Save As and pick one.");
  }

  let workbook: ExcelJS.Workbook;
  try {
    const data = Buffer.from(await file.arrayBuffer());
    if (extension === "xlsx" && !isXlsxFile(data)) {
      return fail("The selected file is not a valid Excel workbook.");
    }
    if (extension === "csv" && data.includes(0)) {
      return fail("The selected CSV file contains unsupported binary data.");
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
    return fail(
      message.includes("allowed") || message.includes("too many")
        ? message
        : "The spreadsheet could not be read. Save it again as a CSV or .xlsx file and retry.",
    );
  }

  const source = findInventorySheet(workbook);
  if (!source) {
    const headings = foundHeadings(workbook);
    return fail(
      headings.length
        ? `I could not find a column for the item name. The headings I can see are ${listed(headings, 12)}. Add or rename one to “Name” (“Item”, “Item name”, or “Equipment” also work) and try again.`
        : "The file looks empty. It needs a heading row with at least an item name column, then one row per item.",
    );
  }
  const { sheet, headerRowNumber, match } = source;
  const { columns } = match;

  // Extra columns: one that matches a field from Settings fills it, the rest are kept in the
  // notes (or ignored if staff prefer).
  const customDefinitions = await loadCustomFields();
  const customByHeader = new Map(
    customDefinitions.map((field) => [normalizeHeader(field.label), field]),
  );
  const customColumns: RowSettings["customColumns"] = [];
  const keptColumns: RowSettings["keptColumns"] = [];
  const ignoredColumns: string[] = [];
  for (const cell of match.extra) {
    const field = customByHeader.get(normalizeHeader(cell.text));
    if (field && !customColumns.some((entry) => entry.field.id === field.id)) {
      customColumns.push({ column: cell.column, field });
    } else if (keepExtraColumns) {
      keptColumns.push({ column: cell.column, header: cell.text });
    } else {
      ignoredColumns.push(cell.text);
    }
  }

  const settings: RowSettings = {
    customColumns,
    defaultCategory: defaultCategoryName,
    defaultLocation: defaultLocationName,
    defaultRoomNumber,
    keptColumns,
    locationIsRoomNumber: columns.location !== undefined && columns.location === columns.roomNumber,
  };

  const categoryCache = new Map<string, SetupRecord>();
  const locationCache = new Map<string, SetupRecord>();
  // A check reads setup records once so every row is compared with Settings.
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
  const warnings: { message: string; rowNumber: number }[] = [];
  const previewIdentifiers = new Set<string>();
  const previewRows: PreviewRow[] = [];
  const fallbacks = { category: 0, location: 0 };
  const nameHeading = normalizeHeader(
    cellText(sheet.getRow(headerRowNumber).getCell(columns.name ?? 1).value),
  );
  let imported = 0;
  let records = 0;
  let skipped = 0;
  let blankRows = 0;
  let ignoredRows = 0;
  let dataRows = 0;
  let cutOff = false;

  const lastRow = Math.min(sheet.rowCount, headerRowNumber + maximumScannedRows);
  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cellAt = (column: number) => cellText(row.getCell(column).value);
    const valueAt: ValueReader = (field) => {
      const columnNumber = columns[field];
      return columnNumber ? cellAt(columnNumber) : "";
    };
    const name = valueAt("name");
    const hasData =
      (Object.keys(columns) as ImportField[]).some((field) => valueAt(field)) ||
      [...customColumns, ...keptColumns].some(({ column }) => cellAt(column));
    if (!hasData) {
      blankRows += 1;
      continue;
    }
    if (!name) {
      skipped += 1;
      problems.push({ rowNumber, message: "has no item name, so it was skipped." });
      continue;
    }
    if (isSummaryName(name) || normalizeHeader(name) === nameHeading) {
      ignoredRows += 1;
      continue;
    }
    dataRows += 1;
    if (dataRows > maximumRows) {
      cutOff = true;
      break;
    }

    const warn: Warn = (message) => warnings.push({ rowNumber, message });
    try {
      const parsed = parseImportRow(valueAt, cellAt, settings, warn, fallbacks);
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
        records += parsed.units;
        continue;
      }

      const savedSource = { actor, rowNumber, sheetName: sheet.name };
      const cachedCategory = categoryCache.get(categoryKey);
      const cachedLocation = locationCache.get(locationKey);
      if (cachedCategory && cachedLocation && parsed.units === 1) {
        await saveImportedRow(
          prisma,
          parsed,
          cachedCategory,
          cachedLocation,
          customDefinitions,
          savedSource,
        );
        imported += 1;
        records += 1;
        continue;
      }

      const result = await prisma.$transaction(
        async (transaction) => {
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
          await saveImportedRow(
            transaction,
            parsed,
            category,
            location,
            customDefinitions,
            savedSource,
          );
          return { category, location };
        },
        { timeout: 20_000 },
      );

      categoryCache.set(categoryKey, result.category);
      locationCache.set(locationKey, result.location);
      imported += 1;
      records += parsed.units;
    } catch (error) {
      skipped += 1;
      // Warnings from a row that did not import would only confuse.
      for (
        let index = warnings.length - 1;
        index >= 0 && warnings[index].rowNumber === rowNumber;
        index -= 1
      ) {
        warnings.pop();
      }
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

  const notices: string[] = [];
  notices.push(
    workbook.worksheets.length > 1
      ? `Read the “${sheet.name}” sheet (heading on row ${headerRowNumber}).`
      : `Heading found on row ${headerRowNumber}.`,
  );
  if (fallbacks.category) {
    notices.push(
      `${plural(fallbacks.category, "row")} had no category and ${fallbacks.category === 1 ? "was" : "were"} filed under “${fallbackCategoryName}”. Add a Category column or a default category to avoid this.`,
    );
  }
  if (fallbacks.location) {
    notices.push(
      `${plural(fallbacks.location, "row")} had no location and ${fallbacks.location === 1 ? "was" : "were"} placed in “${fallbackLocationName}”. Add a Location column or a default location to avoid this.`,
    );
  }
  if (customColumns.length) {
    notices.push(
      `Filled the extra fields ${listed(customColumns.map((entry) => entry.field.label))} from matching columns.`,
    );
  }
  if (keptColumns.length) {
    notices.push(
      `Columns with no matching field (${listed(keptColumns.map((entry) => entry.header))}) were saved in each item's notes.`,
    );
  }
  if (ignoredColumns.length) {
    notices.push(`Ignored columns with no matching field: ${listed(ignoredColumns)}.`);
  }
  if (blankRows) {
    notices.push(`Skipped ${plural(blankRows, "empty row")}.`);
  }
  if (ignoredRows) {
    notices.push(`Skipped ${plural(ignoredRows, "total or repeated heading row")}.`);
  }
  if (cutOff) {
    notices.push(
      `Only the first ${maximumRows.toLocaleString()} rows are read at a time. Put the remaining rows in a second file and import that next.`,
    );
  }
  if (!dataRows && !skipped) {
    return {
      ...emptyImportResult,
      errors: ["There are no item rows under the headings. Add one row per item and try again."],
      matched: match.matched.map((entry) => ({
        header: entry.header,
        label: fieldLabels[entry.field],
      })),
      notices,
    };
  }

  problems.sort((left, right) => left.rowNumber - right.rowNumber);
  warnings.sort((left, right) => left.rowNumber - right.rowNumber);
  const errors = problems
    .slice(0, maximumReported)
    .map((problem) => `Row ${problem.rowNumber}: ${problem.message}`);
  if (problems.length > maximumReported) {
    errors.push(
      `…and ${problems.length - maximumReported} more rows need correction. Fix these first, then check again.`,
    );
  }
  const warningLines = warnings
    .slice(0, maximumReported)
    .map((warning) => `Row ${warning.rowNumber}: ${warning.message}`);
  if (warnings.length > maximumReported) {
    warningLines.push(
      `…and ${warnings.length - maximumReported} more adjustments of the same kind.`,
    );
  }
  return {
    errors,
    imported,
    matched: match.matched.map((entry) => ({
      header: entry.header,
      label: fieldLabels[entry.field],
    })),
    notices,
    previewed: previewOnly,
    records,
    skipped,
    warnings: warningLines,
  };
}
