/**
 * Working out which spreadsheet column holds what. Headings come from people, so they are matched
 * after dropping case, spaces and punctuation ("Serial No." and "serial_number" are the same), and
 * several common names are accepted for each field. Anything not understood is reported back, not
 * rejected.
 */

export const fieldAliases = {
  name: [
    "name",
    "itemname",
    "item",
    "items",
    "equipment",
    "equipmentname",
    "assetname",
    "productname",
    "particulars",
    "article",
  ],
  category: ["category", "categoryname", "classification", "class", "group"],
  location: [
    "location",
    "room",
    "roomname",
    "roomnumber",
    "roomno",
    "office",
    "place",
    "area",
    "lab",
    "laboratory",
  ],
  roomNumber: ["roomnumber", "roomno"],
  assetTag: [
    "assettag",
    "assetnumber",
    "assetno",
    "assetcode",
    "inventorycode",
    "inventorytag",
    "inventorynumber",
    "inventoryno",
    "propertynumber",
    "propertyno",
    "propertytag",
    "propertycode",
    "tag",
    "tagnumber",
  ],
  serialNumber: ["serialnumber", "serial", "serialno", "serialnum", "serialcode", "sn"],
  itemType: ["type", "itemtype", "recordtype"],
  quantity: ["quantity", "qty", "count", "units", "stock", "onhand", "quantityonhand", "totalqty"],
  lowStockThreshold: [
    "lowstock",
    "lowstocklevel",
    "lowstockalert",
    "lowstockthreshold",
    "reorderlevel",
    "reorderpoint",
    "minimumstock",
    "minstock",
    "minimumquantity",
    "minqty",
  ],
  warrantyEndsAt: [
    "warrantyend",
    "warrantyends",
    "warrantyendsat",
    "warrantyenddate",
    "warrantyexpiry",
    "warrantyexpires",
    "warrantyexpiration",
    "warrantyexpirydate",
    "warrantyuntil",
    "warranty",
  ],
  isComputer: ["iscomputer", "computer", "ispc"],
  operatingSystem: ["operatingsystem", "os"],
  osVersion: ["osversion"],
  processor: ["processor", "cpu"],
  memoryGb: ["memorygb", "ramgb", "ram", "memory"],
  storageGb: ["storagegb", "diskgb", "storage"],
  storageType: ["storagetype", "disktype"],
  macAddress: ["macaddress", "mac", "macaddr"],
  ipAddress: ["ipaddress", "ip"],
  hardwareDescription: ["hardwaredescription", "hardwarenotes", "pcdescription"],
  softwareDescription: ["softwaredescription", "softwarenotes", "pcsoftwarenotes"],
  lastCheckedAt: ["lastcheckedat", "lastchecked", "lastdatechecked"],
  status: ["status"],
  condition: ["condition"],
  description: ["description", "itemdescription", "details"],
  manufacturer: ["manufacturer", "brand", "make"],
  model: ["model", "modelnumber", "modelno", "productinfo"],
  purchaseDate: [
    "purchasedate",
    "datepurchased",
    "dateofpurchase",
    "dateacquired",
    "acquisitiondate",
  ],
  purchasePrice: [
    "purchaseprice",
    "price",
    "acquisitionvalue",
    "acquisitioncost",
    "cost",
    "unitcost",
    "unitprice",
  ],
  notes: ["notes", "note", "remarks"],
  graphics: ["graphics", "gpu"],
  legacyChecked: ["checked"],
  legacyAcquisitionDate: ["knownacquisitiondate"],
  legacyYearEncoded: ["yearencoded"],
  legacyUnit: ["unit"],
  legacyCounter: ["ctr"],
  legacyComments: ["comments"],
} as const;

export type ImportField = keyof typeof fieldAliases;

/** How each field is named when we tell staff what was understood. */
export const fieldLabels: Record<ImportField, string> = {
  name: "Item name",
  category: "Category",
  location: "Location",
  roomNumber: "Room number",
  assetTag: "Asset tag",
  serialNumber: "Serial number",
  itemType: "Type",
  quantity: "Quantity",
  lowStockThreshold: "Low stock level",
  warrantyEndsAt: "Warranty ends",
  isComputer: "Is a computer",
  operatingSystem: "Operating system",
  osVersion: "OS version",
  processor: "Processor",
  memoryGb: "Memory (GB)",
  storageGb: "Storage (GB)",
  storageType: "Storage type",
  macAddress: "MAC address",
  ipAddress: "IP address",
  hardwareDescription: "Hardware description",
  softwareDescription: "Software description",
  lastCheckedAt: "Last checked",
  status: "Status",
  condition: "Condition",
  description: "Description",
  manufacturer: "Manufacturer",
  model: "Model",
  purchaseDate: "Purchase date",
  purchasePrice: "Purchase price",
  notes: "Notes",
  graphics: "Graphics",
  legacyChecked: "Checked (older sheets)",
  legacyAcquisitionDate: "Known acquisition date",
  legacyYearEncoded: "Year encoded",
  legacyUnit: "Unit (older sheets)",
  legacyCounter: "Counter (older sheets)",
  legacyComments: "Comments (older sheets)",
};

/** Match headings despite punctuation, spacing and capitals. */
export function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type HeaderCell = { column: number; text: string };

export type HeaderMatch = {
  /** Field to the 1-based column that holds it. */
  columns: Partial<Record<ImportField, number>>;
  /** Headings that are in the file but are not an inventory field. */
  extra: HeaderCell[];
  matched: { field: ImportField; header: string }[];
  /** How many fields were recognised, used to pick the right row and sheet. */
  score: number;
};

/** Match one row of cells to inventory fields. The first of two repeated headings wins. */
export function matchHeaders(cells: HeaderCell[]): HeaderMatch {
  const byKey = new Map<string, HeaderCell>();
  for (const cell of cells) {
    const key = normalizeHeader(cell.text);
    if (key && !byKey.has(key)) {
      byKey.set(key, cell);
    }
  }
  const columns: Partial<Record<ImportField, number>> = {};
  const matched: HeaderMatch["matched"] = [];
  const claimed = new Set<number>();
  for (const [field, aliases] of Object.entries(fieldAliases) as [
    ImportField,
    readonly string[],
  ][]) {
    const cell = aliases.map((alias) => byKey.get(alias)).find(Boolean);
    if (!cell) {
      continue;
    }
    columns[field] = cell.column;
    // The room number may share its column with the location heading; list it once.
    if (!claimed.has(cell.column)) {
      matched.push({ field, header: cell.text.trim() });
    }
    claimed.add(cell.column);
  }
  const seen = new Set<string>();
  const extra = cells.filter((cell) => {
    const key = normalizeHeader(cell.text);
    if (!key || claimed.has(cell.column) || seen.has(`${key}:${cell.column}`)) {
      return false;
    }
    seen.add(`${key}:${cell.column}`);
    return true;
  });
  return { columns, extra, matched, score: Object.keys(columns).length };
}
