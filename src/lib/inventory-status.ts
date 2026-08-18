export function inventoryStatusLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function inventoryStatusClass(value: string) {
  switch (value) {
    case "OK":
    case "WORKING":
      return "status-pill status-pill-positive";
    case "DEPLOYED":
      return "status-pill status-pill-deployed";
    case "DEFECTIVE":
    case "LOST":
      return "status-pill status-pill-critical";
    case "NOT_TESTED":
      return "status-pill status-pill-pending";
    case "RETIRED":
      return "status-pill status-pill-retired";
    default:
      return "status-pill";
  }
}
