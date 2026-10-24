// "FOR_REPAIR" -> "For repair"
export function humanizeEnum(value: string) {
  const text = value.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
