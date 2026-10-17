// no server imports here, settings shows these as checkboxes

export const notificationKinds = [
  {
    id: "borrowRequests",
    label: "New borrow requests",
    description: "When a student asks to borrow or reserve something.",
  },
  {
    id: "returns",
    label: "Returns to confirm",
    description: "When a student says they returned an item.",
  },
  {
    id: "repairs",
    label: "Reported problems",
    description: "When someone reports a problem with a QR code.",
  },
  {
    id: "dailyLoans",
    label: "Daily: overdue and due today",
    description: "A morning email listing late loans and what is due back.",
  },
  {
    id: "dailyStock",
    label: "Daily: low stock",
    description: "A morning email listing supplies that are low or out.",
  },
  {
    id: "dailyUpkeep",
    label: "Daily: warranties, licenses and old PCs",
    description:
      "A morning email when warranties or licenses end soon or PCs are due for replacement.",
  },
] as const;

export type NotificationKind = (typeof notificationKinds)[number]["id"];

export function isNotificationKind(value: string): value is NotificationKind {
  return notificationKinds.some((kind) => kind.id === value);
}
