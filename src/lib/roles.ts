/** The two kinds of account: an administrator, and faculty staff who can do everything else. */
export const accountRoles = [
  {
    value: "ADMINISTRATOR",
    label: "Administrator",
    description: "Everything faculty staff can do, plus adding and managing accounts.",
  },
  {
    value: "STAFF",
    label: "Faculty staff",
    description: "Everything except adding or managing accounts.",
  },
] as const;

export function roleLabel(role: string) {
  return role.toUpperCase() === "ADMINISTRATOR" ? "Administrator" : "Faculty staff";
}
