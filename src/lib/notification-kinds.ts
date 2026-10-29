// no server imports here, settings shows these as form fields

export const eventKinds = [
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
    description: "When someone scans an item and reports a problem with it.",
  },
  {
    id: "lowStock",
    label: "Stock running low",
    description: "When a supply drops to its alert level or runs out.",
  },
] as const;

export const summaryKinds = [
  {
    id: "dailyLoans",
    label: "Overdue and due back",
    description: "Late loans and what is due back soon.",
  },
  {
    id: "dailyStock",
    label: "Low stock",
    description: "Supplies that are low or out.",
  },
  {
    id: "dailyUpkeep",
    label: "Upkeep",
    description:
      "Preventive maintenance that's due, warranties or licenses ending soon, and PCs due for replacement.",
  },
] as const;

export const notificationKinds = [...eventKinds, ...summaryKinds];

export type EventKind = (typeof eventKinds)[number]["id"];
export type SummaryKind = (typeof summaryKinds)[number]["id"];
export type NotificationKind = EventKind | SummaryKind;

export function isNotificationKind(value: string): value is NotificationKind {
  return notificationKinds.some((kind) => kind.id === value);
}

export function isEventKind(value: string): value is EventKind {
  return eventKinds.some((kind) => kind.id === value);
}

export const deliveryChoices = [
  { value: "now", label: "Right away" },
  { value: "summary", label: "In my summary" },
  { value: "off", label: "Off" },
] as const;
export type Delivery = (typeof deliveryChoices)[number]["value"];

export const summaryFrequencies = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays only" },
  { value: "weekly", label: "Once a week" },
  { value: "off", label: "Don't send a summary" },
] as const;
export type SummaryFrequency = (typeof summaryFrequencies)[number]["value"];

// vercel cron runs each of these once a day, within the hour
export const summaryTimes = [
  { value: "morning", label: "Morning, around 7 AM" },
  { value: "afternoon", label: "Afternoon, around 4 PM" },
] as const;
export type SummaryTime = (typeof summaryTimes)[number]["value"];

export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isSummaryFrequency(value: string): value is SummaryFrequency {
  return summaryFrequencies.some((entry) => entry.value === value);
}

export function isSummaryTime(value: string): value is SummaryTime {
  return summaryTimes.some((entry) => entry.value === value);
}

export function deliveryOf(kind: EventKind, notifyOn: string[], notifyLater: string[]): Delivery {
  if (!notifyOn.includes(kind)) {
    return "off";
  }
  return notifyLater.includes(kind) ? "summary" : "now";
}

// 0 = Sunday, in Philippine time
export function manilaWeekday(date: Date) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  }).format(date);
  return weekdays.indexOf(name as (typeof weekdays)[number]);
}

export function summaryDueOn(
  settings: { summaryDay: number; summaryFrequency: string },
  date: Date,
) {
  const day = manilaWeekday(date);
  switch (settings.summaryFrequency) {
    case "daily":
      return true;
    case "weekdays":
      return day >= 1 && day <= 5;
    case "weekly":
      return day === settings.summaryDay;
    default:
      return false;
  }
}
