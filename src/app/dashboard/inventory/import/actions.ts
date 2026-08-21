"use server";

import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { AuditAction, ItemCondition, ItemStatus, ItemType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireWriteAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export type ImportResult = { errors: string[]; imported: number; previewed: boolean; skipped: number };
const emptyImportResult: ImportResult = { errors: [], imported: 0, previewed: false, skipped: 0 };

type ColumnMap = Record<string, number | undefined>;
type SetupRecord = { id: string; isActive: boolean };

const maximumFileBytes = 10 * 1024 * 1024;
const maximumRows = 1_000;
const maximumColumns = 40;

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
  lastCheckedAt: ["lastcheckedat", "lastchecked", "lastdatechecked"],
  building: ["building"],
  floor: ["floor"],
  status: ["status"],
  condition: ["condition"],
  description: ["description"],
  manufacturer: ["manufacturer", "brand"],
  model: ["model", "productinfo"],
  purchaseDate: ["purchasedate", "datepurchased"],
  notes: ["notes", "remarks"],
  graphics: ["graphics", "gpu"],
  legacyChecked: ["checked"],
  legacyAcquisitionDate: ["knownacquisitiondate"],
  legacyYearEncoded: ["yearencoded"],
  legacyUnit: ["unit"],
  legacyCounter: ["ctr"],
  legacyComments: ["comments"],
};

function cellText(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== null && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("").trim();
    if ("text" in value) return String(value.text ?? "").trim();
  }
  return String(value).trim();
}

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
  if (result.length > maximumLength) throw new Error(`${field} is too long.`);
  return result;
}

function optionalText(value: string, field: string, maximumLength = 2_000) {
  return boundedText(value, field, maximumLength) || null;
}

function parseNumber(value: string, fallback: number | null, field: string, maximum = 1_000_000) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be a non-negative whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new Error(`${field} is outside the allowed range.`);
  return parsed;
}

function parseDate(value: string, field: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} is not a valid date.`);
  return parsed;
}

function enumValue<T extends string>(value: string, values: readonly T[], fallback: T) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return values.includes(normalized as T) ? (normalized as T) : fallback;
}

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

function legacyNotes(primaryNotes: string, values: Array<[string, string]>) {
  const context = values.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return optionalText([primaryNotes, ...context].filter(Boolean).join("\n"), "notes", 5_000);
}

function columnMapForRow(row: ExcelJS.Row): ColumnMap {
  const headers = new Map<string, number>();
  row.eachCell((cell, columnNumber) => headers.set(normalizedKey(cellText(cell.value)), columnNumber));
  return Object.fromEntries(
    Object.entries(columnAliases).map(([name, aliases]) => [name, aliases.map(normalizedKey).map((alias) => headers.get(alias)).find(Boolean)]),
  );
}

function findInventorySheet(workbook: ExcelJS.Workbook) {
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 25); rowNumber += 1) {
      const columns = columnMapForRow(sheet.getRow(rowNumber));
      if (columns.name && columns.category) return { sheet, columns, headerRowNumber: rowNumber };
    }
  }
  return null;
}

function isTrue(value: string) {
  return ["true", "yes", "1", "y"].includes(value.toLowerCase());
}

function isXlsxFile(data: Buffer) {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

function messageForImportError(error: unknown) {
  if (error instanceof Error && /required|must|too long|active|single tracked|different building/i.test(error.message)) return error.message;
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return "a unique asset tag, serial number, or PC MAC address already exists.";
  }
  return "could not be imported. Check the required fields and data format.";
}

export async function importInventory(_previousState: ImportResult, formData: FormData): Promise<ImportResult> {
  const actor = await requireWriteAccess();
  const file = formData.get("file");
  const allowCreateSetup = formData.get("createMissingSetup") === "on";
  const previewOnly = formData.get("previewOnly") === "on";
  let defaultLocationName: string | null;
  let defaultBuilding: string | null;
  let defaultRoomNumber: string | null;
  let defaultFloor: string | null;
  try {
    defaultLocationName = optionalText(formText(formData, "defaultLocation"), "default location", 160);
    defaultBuilding = optionalText(formText(formData, "defaultBuilding"), "default building", 120);
    defaultRoomNumber = optionalText(formText(formData, "defaultRoomNumber"), "default room number", 80);
    defaultFloor = optionalText(formText(formData, "defaultFloor"), "default floor", 80);
  } catch (error) {
    return { ...emptyImportResult, errors: [messageForImportError(error)] };
  }
  if (!(file instanceof File) || !file.size) return { ...emptyImportResult, errors: ["Choose a non-empty CSV or Excel file."] };
  if (file.size > maximumFileBytes) return { ...emptyImportResult, errors: ["The import file must be 10 MB or smaller."] };

  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") return { ...emptyImportResult, errors: ["Only .csv and .xlsx files are supported."] };

  let workbook: ExcelJS.Workbook;
  try {
    const data = Buffer.from(await file.arrayBuffer());
    if (extension === "xlsx" && !isXlsxFile(data)) return { ...emptyImportResult, errors: ["The selected file is not a valid Excel workbook."] };
    if (extension === "csv" && data.includes(0)) return { ...emptyImportResult, errors: ["The selected CSV file contains unsupported binary data."] };
    workbook = new ExcelJS.Workbook();
    if (extension === "csv") await workbook.csv.read(Readable.from([data]));
    else await workbook.xlsx.load(data as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return { ...emptyImportResult, errors: ["The spreadsheet could not be read. Save it again as a CSV or .xlsx file and retry."] };
  }

  const source = findInventorySheet(workbook);
  if (!source || source.sheet.actualRowCount < 2) {
    return { ...emptyImportResult, errors: ["The file needs a row with name/item name and category/classification headers, plus at least one inventory row."] };
  }
  const { sheet, columns, headerRowNumber } = source;
  if (sheet.actualRowCount > maximumRows + 1) return { ...emptyImportResult, errors: [`Import up to ${maximumRows.toLocaleString()} inventory rows at a time.`] };
  if (sheet.actualColumnCount > maximumColumns) return { ...emptyImportResult, errors: [`The file has too many columns. Keep it to ${maximumColumns} columns or fewer.`] };

  const missing = ["name", "category"].filter((column) => !columns[column]);
  if (!columns.location && !defaultLocationName) missing.push("location (or a default location below)");
  if (missing.length) return { ...emptyImportResult, errors: [`Missing required column(s): ${missing.join(", ")}.`] };

  const valueAt = (row: ExcelJS.Row, column: string) => {
    const columnNumber = columns[column];
    return columnNumber ? cellText(row.getCell(columnNumber).value) : "";
  };
  const categoryCache = new Map<string, SetupRecord>();
  const locationCache = new Map<string, SetupRecord>();
  const errors: string[] = [];
  const previewIdentifiers = new Set<string>();
  let imported = 0;
  let skipped = 0;

  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = valueAt(row, "name");
    const categoryName = valueAt(row, "category");
    const sourceLocationName = valueAt(row, "location");
    if (!name && !categoryName && !sourceLocationName) continue;
    const locationName = sourceLocationName || defaultLocationName || "";
    if (!name || !categoryName || !locationName) {
      skipped += 1;
      errors.push(`Row ${rowNumber}: name, category, and location are required.`);
      continue;
    }

    try {
      const safeName = boundedText(name, "name", 255);
      const safeCategoryName = boundedText(categoryName, "category", 120);
      const safeLocationName = boundedText(locationName, "location", 160);
      const building = optionalText(valueAt(row, "building") || defaultBuilding || "", "building", 120);
      const locationColumnIsRoomNumber = columns.location !== undefined && columns.location === columns.roomNumber;
      const roomNumber = locationColumnIsRoomNumber
        ? safeLocationName
        : optionalText(valueAt(row, "roomNumber") || defaultRoomNumber || "", "room number", 80);
      const floor = optionalText(valueAt(row, "floor") || defaultFloor || "", "floor", 80);
      const categoryKey = normalizedValue(safeCategoryName);
      const locationKey = [safeLocationName, building ?? "", roomNumber ?? ""].map(normalizedValue).join("|");
      const itemType = enumValue(valueAt(row, "itemType"), Object.values(ItemType), ItemType.ASSET);
      const quantity = parseNumber(valueAt(row, "quantity"), 1, "quantity") ?? 1;
      const hasComputerDetails = isTrue(valueAt(row, "isComputer")) || ["operatingSystem", "processor", "memoryGb", "macAddress"].some((column) => valueAt(row, column) !== "");
      if (hasComputerDetails && (itemType !== ItemType.ASSET || quantity !== 1)) throw new Error("a PC must be a single tracked asset, not a supply record.");
      const legacyChecked = valueAt(row, "legacyChecked");
      const legacyState = legacyInspectionState(legacyChecked);
      const explicitStatus = valueAt(row, "status");
      const explicitCondition = valueAt(row, "condition");
      const legacyAcquisitionDate = valueAt(row, "legacyAcquisitionDate");
      const sourcePurchaseDate = valueAt(row, "purchaseDate");
      const purchaseDate = sourcePurchaseDate
        ? parseDate(sourcePurchaseDate, "purchase date")
        : /^\d{4}-\d{2}-\d{2}$/.test(legacyAcquisitionDate)
          ? parseDate(legacyAcquisitionDate, "known acquisition date")
          : null;
      const notes = legacyNotes(valueAt(row, "notes"), [
        ["Original unit", valueAt(row, "legacyUnit")],
        ["Legacy counter", valueAt(row, "legacyCounter")],
        ["Original checked value", legacyChecked],
        ["Known acquisition", legacyAcquisitionDate && !purchaseDate ? legacyAcquisitionDate : ""],
        ["Year encoded", valueAt(row, "legacyYearEncoded")],
        ["Comments", valueAt(row, "legacyComments")],
      ]);

      if (previewOnly) {
        const identifiers = [
          optionalText(valueAt(row, "assetTag"), "asset tag", 255)?.toUpperCase(),
          optionalText(valueAt(row, "serialNumber"), "serial number", 255)?.toUpperCase(),
          hasComputerDetails ? optionalText(valueAt(row, "macAddress"), "MAC address", 255)?.toUpperCase() : null,
        ].filter(Boolean) as string[];
        if (identifiers.some((identifier) => previewIdentifiers.has(identifier))) throw new Error("a repeated asset tag, serial number, or PC MAC address appears in this file.");
        identifiers.forEach((identifier) => previewIdentifiers.add(identifier));
        imported += 1;
        continue;
      }

      const cachedCategory = categoryCache.get(categoryKey);
      const cachedLocation = locationCache.get(locationKey);
      if (cachedCategory && cachedLocation) {
        await prisma.inventoryItem.create({
          data: {
            name: safeName,
            assetTag: optionalText(valueAt(row, "assetTag"), "asset tag", 255)?.toUpperCase() ?? null,
            serialNumber: optionalText(valueAt(row, "serialNumber"), "serial number", 255)?.toUpperCase() ?? null,
            description: optionalText(valueAt(row, "description"), "description", 5_000),
            manufacturer: optionalText(valueAt(row, "manufacturer"), "manufacturer", 255),
            model: optionalText(valueAt(row, "model"), "model", 255),
            notes,
            purchaseDate,
            itemType,
            quantity,
            status: explicitStatus
              ? enumValue(explicitStatus, Object.values(ItemStatus), ItemStatus.OK)
              : legacyState?.status ?? ItemStatus.OK,
            condition: explicitCondition
              ? enumValue(explicitCondition, Object.values(ItemCondition), ItemCondition.GOOD)
              : legacyState?.condition ?? ItemCondition.GOOD,
            categoryId: cachedCategory.id,
            locationId: cachedLocation.id,
            computer: hasComputerDetails
              ? {
                  create: {
                    operatingSystem: optionalText(valueAt(row, "operatingSystem"), "operating system", 255),
                    osVersion: optionalText(valueAt(row, "osVersion"), "OS version", 255),
                    processor: optionalText(valueAt(row, "processor"), "processor", 255),
                    memoryGb: parseNumber(valueAt(row, "memoryGb"), null, "memory (GB)", 16_384),
                    storageGb: parseNumber(valueAt(row, "storageGb"), null, "storage (GB)"),
                    storageType: optionalText(valueAt(row, "storageType"), "storage type", 255),
                    graphics: optionalText(valueAt(row, "graphics"), "graphics", 255),
                    macAddress: optionalText(valueAt(row, "macAddress"), "MAC address", 255)?.toUpperCase() ?? null,
                    ipAddress: optionalText(valueAt(row, "ipAddress"), "IP address", 255),
                    lastCheckedAt: parseDate(valueAt(row, "lastCheckedAt"), "last checked date") ?? new Date(),
                  },
                }
              : undefined,
            auditEvents: {
              create: {
                action: AuditAction.CREATED,
                summary: "Inventory item imported from file.",
                actorId: actor.id,
                actorName: actor.email,
                metadata: { source: "import", sheet: sheet.name, row: rowNumber },
              },
            },
          },
        });
        imported += 1;
        continue;
      }

      const result = await prisma.$transaction(async (transaction) => {
        let category = categoryCache.get(categoryKey);
        if (!category) {
          const existingCategory = await transaction.category.findFirst({ where: { name: { equals: safeCategoryName, mode: "insensitive" } }, select: { id: true, isActive: true } });
          if (existingCategory) category = existingCategory;
          else if (allowCreateSetup) category = await transaction.category.create({ data: { name: safeCategoryName }, select: { id: true, isActive: true } });
          else throw new Error(`category “${safeCategoryName}” does not exist. Enable setup creation or add it in Settings first.`);
        }
        if (!category.isActive) throw new Error(`category “${safeCategoryName}” is inactive. Reactivate it in Settings first.`);

        let location = locationCache.get(locationKey);
        if (!location) {
          const namedLocations = await transaction.location.findMany({ where: { name: { equals: safeLocationName, mode: "insensitive" } }, select: { id: true, isActive: true, building: true, roomNumber: true } });
          location = namedLocations.find((candidate) => normalizedValue(candidate.building ?? "") === normalizedValue(building ?? "") && normalizedValue(candidate.roomNumber ?? "") === normalizedValue(roomNumber ?? ""));
          if (!location && namedLocations.length) throw new Error(`location “${safeLocationName}” already exists with a different building or room number.`);
          if (!location && allowCreateSetup) {
            location = await transaction.location.create({ data: { name: safeLocationName, building, roomNumber, floor }, select: { id: true, isActive: true } });
          }
          if (!location) throw new Error(`location “${safeLocationName}” does not exist. Enable setup creation or add it in Settings first.`);
        }
        if (!location.isActive) throw new Error(`location “${safeLocationName}” is inactive. Reactivate it in Settings first.`);

        await transaction.inventoryItem.create({
          data: {
            name: safeName,
            assetTag: optionalText(valueAt(row, "assetTag"), "asset tag", 255)?.toUpperCase() ?? null,
            serialNumber: optionalText(valueAt(row, "serialNumber"), "serial number", 255)?.toUpperCase() ?? null,
            description: optionalText(valueAt(row, "description"), "description", 5_000),
            manufacturer: optionalText(valueAt(row, "manufacturer"), "manufacturer", 255),
            model: optionalText(valueAt(row, "model"), "model", 255),
            notes,
            purchaseDate,
            itemType,
            quantity,
            status: explicitStatus
              ? enumValue(explicitStatus, Object.values(ItemStatus), ItemStatus.OK)
              : legacyState?.status ?? ItemStatus.OK,
            condition: explicitCondition
              ? enumValue(explicitCondition, Object.values(ItemCondition), ItemCondition.GOOD)
              : legacyState?.condition ?? ItemCondition.GOOD,
            categoryId: category.id,
            locationId: location.id,
            computer: hasComputerDetails
              ? {
                  create: {
                    operatingSystem: optionalText(valueAt(row, "operatingSystem"), "operating system", 255),
                    osVersion: optionalText(valueAt(row, "osVersion"), "OS version", 255),
                    processor: optionalText(valueAt(row, "processor"), "processor", 255),
                    memoryGb: parseNumber(valueAt(row, "memoryGb"), null, "memory (GB)", 16_384),
                    storageGb: parseNumber(valueAt(row, "storageGb"), null, "storage (GB)"),
                    storageType: optionalText(valueAt(row, "storageType"), "storage type", 255),
                    graphics: optionalText(valueAt(row, "graphics"), "graphics", 255),
                    macAddress: optionalText(valueAt(row, "macAddress"), "MAC address", 255)?.toUpperCase() ?? null,
                    ipAddress: optionalText(valueAt(row, "ipAddress"), "IP address", 255),
                    lastCheckedAt: parseDate(valueAt(row, "lastCheckedAt"), "last checked date") ?? new Date(),
                  },
                }
              : undefined,
            auditEvents: {
              create: {
                action: AuditAction.CREATED,
                summary: "Inventory item imported from file.",
                actorId: actor.id,
                actorName: actor.email,
                metadata: { source: "import", sheet: sheet.name, row: rowNumber },
              },
            },
          },
        });
        return { category, location };
      });

      categoryCache.set(categoryKey, result.category);
      locationCache.set(locationKey, result.location);
      imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`Row ${rowNumber}: ${messageForImportError(error)}`);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/settings");
  return { imported, skipped, errors: errors.slice(0, 20), previewed: previewOnly };
}
