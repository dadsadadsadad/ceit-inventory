// match headings ignoring case, spaces and punctuation, with a few aliases per field

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
  // recognized so they don't end up in the notes, but not kept
  networkAddress: ["macaddress", "mac", "macaddr", "ipaddress", "ip"],
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
  networkAddress: "Not kept (MAC or IP address)",
  hardwareDescription: "Hardware notes",
  softwareDescription: "Software notes",
  lastCheckedAt: "Last checked",
  status: "Status",
  condition: "Condition",
  description: "Notes (description)",
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

export function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type HeaderCell = { column: number; text: string };

export type HeaderMatch = {
  // field -> 1-based column
  columns: Partial<Record<ImportField, number>>;
  extra: HeaderCell[];
  matched: { field: ImportField; header: string }[];
  // used to pick the header row and sheet
  score: number;
};

// first one wins on duplicates
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
    // room number can share the location column
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
