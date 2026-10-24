import { timingSafeEqual } from "node:crypto";

import { isSummaryTime } from "@/lib/notification-kinds";
import { mailConfigured } from "@/lib/notifications";
import { sendSummaries } from "@/lib/summary-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// vercel cron sends the CRON_SECRET as a bearer token
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    Boolean(secret) &&
    sent.length === expected.length &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ time: string }> }) {
  if (!authorized(request)) {
    return new Response(null, { status: 401 });
  }
  const { time } = await params;
  if (!isSummaryTime(time)) {
    return new Response(null, { status: 404 });
  }
  if (!mailConfigured()) {
    return Response.json({ sent: 0, reason: "mail not set up" });
  }
  return Response.json({ sent: await sendSummaries(time) });
}
