import { loadCalendarMonth } from "@/lib/calendar-queries";
import { isMonthKey } from "@/lib/calendar";
import { getCurrentInventoryUser } from "@/lib/inventory-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One month of the dashboard calendar. Staff only: it lists who has borrowed what.
export async function GET(request: Request) {
  if (!(await getCurrentInventoryUser())) {
    return new Response(null, { status: 401 });
  }
  const month = new URL(request.url).searchParams.get("month");
  if (!isMonthKey(month)) {
    return new Response(null, { status: 400 });
  }
  try {
    return Response.json(
      { month, entries: await loadCalendarMonth(month) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to load the calendar", error);
    return new Response(null, { status: 500 });
  }
}
