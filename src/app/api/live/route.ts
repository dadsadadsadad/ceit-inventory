import { getCurrentInventoryUser } from "@/lib/inventory-auth";
import { liveRevision, missingItemRevision } from "@/lib/live-revision";
import { isLiveUpdateScope } from "@/lib/live-update-scope";
import { isInventoryQrCode } from "@/lib/qr-code";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qrCode = url.searchParams.get("qr") ?? undefined;
  const requestedScope = url.searchParams.get("scope") ?? "dashboard";
  if (!isLiveUpdateScope(requestedScope)) {
    return new Response(null, { status: 400 });
  }
  const scope = requestedScope;
  if (qrCode !== undefined && !isInventoryQrCode(qrCode)) {
    return new Response(null, { status: 400 });
  }
  if (!qrCode && !(await getCurrentInventoryUser())) {
    return new Response(null, { status: 401 });
  }
  const headers = { "Cache-Control": "private, no-store, no-transform" };
  // A public subscription is only for a label that exists; a made-up code gets nothing to watch.
  if (qrCode && (await liveRevision(qrCode, scope)) === missingItemRevision) {
    return new Response(null, { status: 404, headers });
  }
  if (url.searchParams.get("mode") === "poll") {
    return Response.json({ revision: await liveRevision(qrCode, scope) }, { headers });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let stop = () => {
    stopped = true;
    clearTimeout(timer);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const started = Date.now();
      let initialTick = true;
      stop = () => {
        if (stopped) {
          return;
        }
        stopped = true;
        clearTimeout(timer);
        request.signal.removeEventListener("abort", stop);
        controller.close();
      };
      request.signal.addEventListener("abort", stop, { once: true });
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      async function tick() {
        try {
          if (request.signal.aborted || Date.now() - started > 25_000) {
            return stop();
          }
          // Recheck access throughout the stream, including account deactivation.
          if (!initialTick && !qrCode && !(await getCurrentInventoryUser())) {
            if (!stopped) {
              controller.enqueue(encoder.encode("event: expired\ndata: {}\n\n"));
            }
            return stop();
          }
          initialTick = false;
          const revision = await liveRevision(qrCode, scope);
          if (stopped) {
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ revision })}\n\n`));
          timer = setTimeout(tick, 5_000);
        } catch {
          // EventSource reconnects; no database details are exposed to the browser.
          stop();
        }
      }
      void tick();
    },
    cancel() {
      stopped = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", stop);
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
