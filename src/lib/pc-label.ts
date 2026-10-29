// spec label stuck on a pc case: hardware, software and a qr code

export const pcLabelSizes = {
  small: { name: "Small 9 cm, 2 across" },
  standard: { name: "Standard 13 cm" },
  large: { name: "Large 19 cm" },
} as const;

export type PcLabelSize = keyof typeof pcLabelSizes;

export const defaultPcLabelSize: PcLabelSize = "standard";

export function pcLabelSizeOf(value: string | null | undefined): PcLabelSize {
  return value && Object.hasOwn(pcLabelSizes, value) ? (value as PcLabelSize) : defaultPcLabelSize;
}

type PcLabelItem = {
  assetTag: string | null;
  manufacturer: string | null;
  model: string | null;
  name: string;
  serialNumber: string | null;
  location: { name: string };
  computer: {
    graphics: string | null;
    memoryGb: number | null;
    operatingSystem: string | null;
    osVersion: string | null;
    processor: string | null;
    storageGb: number | null;
    storageType: string | null;
  } | null;
};

// name and room always show, the rest only when recorded
export function pcHardwareRows(item: PcLabelItem): [string, string][] {
  const pc = item.computer;
  const rows: [string, string | null | undefined][] = [
    ["PC name", item.name],
    ["Room", item.location.name],
    ["Brand", item.manufacturer],
    ["Model", item.model],
    ["CPU", pc?.processor],
    ["RAM", pc?.memoryGb != null ? `${pc.memoryGb} GB` : null],
    ["GPU", pc?.graphics],
    [
      "Storage",
      pc?.storageGb != null
        ? `${pc.storageGb} GB${pc.storageType ? ` ${pc.storageType}` : ""}`
        : null,
    ],
    ["OS", [pc?.operatingSystem, pc?.osVersion].filter(Boolean).join(" ") || null],
    ["Serial", item.serialNumber],
  ];
  return rows
    .filter((row, index) => index < 2 || Boolean(row[1]))
    .map(([label, value]) => [label, value ?? ""]);
}

// long software lists go into two columns so the label doesn't get too tall
export const pcSoftwareSplitAt = 14;

export function pcLabelLayout(hardwareRows: number, softwareCount: number) {
  const softwareColumns = softwareCount > pcSoftwareSplitAt ? 2 : 1;
  const rows = Math.max(hardwareRows, Math.ceil(Math.max(1, softwareCount) / softwareColumns));
  return { rows, softwareColumns };
}
