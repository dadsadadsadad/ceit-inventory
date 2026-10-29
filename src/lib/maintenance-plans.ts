// preventive maintenance helpers, no server imports so forms can use them too
// days are "YYYY-MM-DD" in manila time, like the calendar

export const intervalChoices = [
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 60, label: "Every 2 months" },
  { days: 90, label: "Every 3 months" },
  { days: 180, label: "Every 6 months" },
  { days: 365, label: "Every year" },
] as const;

export const maxIntervalDays = 730;
// due within this many days shows as coming up
export const dueSoonDays = 7;

export function intervalLabel(days: number) {
  return (
    intervalChoices.find((choice) => choice.days === days)?.label ??
    `Every ${days} ${days === 1 ? "day" : "days"}`
  );
}

export function addDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

export type PlanDue = {
  // overdue and today count as due
  state: "overdue" | "today" | "soon" | "later";
  label: string;
  days: number;
};

export function planDue(nextDueOn: string, today: string): PlanDue {
  const days = daysBetween(today, nextDueOn);
  if (days < 0) {
    const late = -days;
    return { state: "overdue", days, label: `${late} ${late === 1 ? "day" : "days"} overdue` };
  }
  if (days === 0) {
    return { state: "today", days, label: "Due today" };
  }
  if (days <= dueSoonDays) {
    return { state: "soon", days, label: days === 1 ? "Due tomorrow" : `Due in ${days} days` };
  }
  return { state: "later", days, label: `Due ${shortDay(nextDueOn)}` };
}

export function planDueClass(state: PlanDue["state"]) {
  switch (state) {
    case "overdue":
      return "status-pill status-pill-critical";
    case "today":
    case "soon":
      return "status-pill status-pill-pending";
    default:
      return "status-pill status-pill-positive";
  }
}

export function shortDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(day.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: "numeric" }),
  });
}

// "Computer Lab 1 · Desktop computers", or the item name
export function planScopeLabel(plan: {
  category: { name: string } | null;
  location: { name: string } | null;
  item: { name: string } | null;
}) {
  if (plan.item) {
    return plan.item.name;
  }
  const parts = [plan.location?.name, plan.category?.name].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Everything";
}
