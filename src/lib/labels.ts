/** "FOR_REPAIR" becomes "For Repair": the readable form of any database enum value. */
export function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
