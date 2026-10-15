export const accountRoles = [
  {
    value: "ADMINISTRATOR",
    label: "Administrator",
    description: "Full access, including accounts.",
  },
  {
    value: "STAFF",
    label: "Faculty staff",
    description: "Everything except accounts.",
  },
] as const;

export function roleLabel(role: string) {
  return role.toUpperCase() === "ADMINISTRATOR" ? "Administrator" : "Faculty staff";
}
