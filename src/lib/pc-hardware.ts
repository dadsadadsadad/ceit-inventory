// choices for the pc hardware dropdowns, typed values are still allowed for the text ones

export const memoryOptions = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128];
export const storageOptions = [128, 240, 256, 480, 500, 512, 1000, 2000, 4000];
export const storageTypes = ["NVMe SSD", "SATA SSD", "HDD", "SSD + HDD", "eMMC"];

export const commonProcessors = [
  "Intel Core i3",
  "Intel Core i5",
  "Intel Core i7",
  "Intel Core i9",
  "Intel Core Ultra 5",
  "Intel Core Ultra 7",
  "Intel Pentium",
  "Intel Celeron",
  "AMD Ryzen 3",
  "AMD Ryzen 5",
  "AMD Ryzen 7",
  "AMD Ryzen 9",
  "Apple M1",
  "Apple M2",
  "Apple M3",
];

export const commonGraphics = [
  "Integrated",
  "Intel UHD Graphics",
  "Intel Iris Xe",
  "AMD Radeon Graphics",
  "NVIDIA GeForce GT 1030",
  "NVIDIA GeForce GTX 1650",
  "NVIDIA GeForce RTX 3050",
  "NVIDIA GeForce RTX 3060",
  "NVIDIA GeForce RTX 4060",
];

export const commonSystems = ["Windows 11 Pro", "Windows 10 Pro", "Ubuntu", "macOS"];

export function storageLabel(gb: number) {
  return gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`;
}

// values already in use first, then the common ones
export function withCommon(used: (string | null)[], common: string[]) {
  const seen = new Set<string>();
  return [...used, ...common].filter((value): value is string => {
    const key = value?.trim().toLowerCase();
    if (!value || !key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
