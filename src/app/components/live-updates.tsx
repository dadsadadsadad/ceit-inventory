"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { liveUpdateScope } from "@/lib/live-update-scope";

type Connection = "connecting" | "live" | "reconnecting" | "offline";

export function LiveUpdates() {
  const pathname = usePathname();
  const router = useRouter();
  const [connection, setConnection] = useState<Connection>("connecting");
  const [waiting, setWaiting] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const scope = liveUpdateScope(pathname);
  const dashboard = scope !== null;
  const qr = pathname.match(/^\/scan\/([^/]+)$/)?.[1];
  const enabled = dashboard || Boolean(qr);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let source: EventSource | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let revision: string | undefined;
    let queued = false;
    let disposed = false;
    let lastRefresh = Date.now();
    const readyAt = Date.now() + 3_000;
    let generation = 0;
    const endpoint = `/api/live?${qr ? `qr=${encodeURIComponent(qr)}` : `scope=${scope}`}`;
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel("ceit-inventory-updates");

    function flush() {
      if (!queued || disposed || document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }
      // A server refresh must not advance concurrency tokens underneath unfinished edits.
      const editing = document.querySelector('form[data-dirty="true"], form[data-saving="true"]');
      if (editing) {
        setWaiting(true);
        return;
      }
      if (Date.now() < readyAt || Date.now() - lastRefresh < 1_000) {
        return;
      }
      queued = false;
      lastRefresh = Date.now();
      setWaiting(false);
      startTransition(() => router.refresh());
    }
    function changed() {
      queued = true;
      flush();
    }
    function receive(next: string, reconcileInitial = false) {
      setConnection("live");
      if (revision !== next) {
        const initial = revision === undefined;
        revision = next;
        // The navigation already rendered fresh data. Seed the subscription
        // without fetching that entire page again immediately after it opens.
        // A delayed polling fallback may have missed changes while connecting.
        if (!initial || reconcileInitial) {
          changed();
        }
      }
    }
    async function poll() {
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }
      controller = new AbortController();
      const currentGeneration = generation;
      try {
        const response = await fetch(`${endpoint}&mode=poll`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.refresh();
          return;
        }
        if (!response.ok) {
          throw new Error("Unavailable");
        }
        const data = await response.json();
        if (!disposed && currentGeneration === generation && typeof data.revision === "string") {
          receive(data.revision, true);
        }
      } catch {
        if (!disposed && currentGeneration === generation) {
          setConnection(navigator.onLine ? "reconnecting" : "offline");
        }
      } finally {
        if (!disposed && currentGeneration === generation) {
          fallback = setTimeout(poll, 10_000);
        }
      }
    }
    function close() {
      generation += 1;
      source?.close();
      source = undefined;
      clearTimeout(fallback);
      controller?.abort();
    }
    function connect() {
      close();
      if (!navigator.onLine) {
        setConnection("offline");
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      setConnection("connecting");
      if (typeof EventSource === "undefined") {
        void poll();
        return;
      }
      source = new EventSource(endpoint);
      source.onmessage = (event) => {
        clearTimeout(fallback);
        fallback = undefined;
        try {
          const data = JSON.parse(event.data);
          if (typeof data.revision === "string") {
            receive(data.revision);
          }
        } catch {
          /* Ignore malformed intermediaries; the next heartbeat retries. */
        }
      };
      source.addEventListener("expired", () => {
        close();
        router.refresh();
      });
      source.onerror = () => {
        setConnection(navigator.onLine ? "reconnecting" : "offline");
        // Keep EventSource's reconnect behavior; support proxies that buffer streams.
        // Repeated reconnect failures must not keep postponing the fallback.
        fallback ??= setTimeout(poll, 5_000);
      };
      fallback = setTimeout(poll, 10_000);
    }
    function visibility() {
      connect();
      flush();
    }
    function mutation(event: Event) {
      if ((event as CustomEvent).detail?.success) {
        channel?.postMessage("changed");
        changed();
      } else {
        flush();
      }
    }
    if (channel) {
      channel.onmessage = changed;
    }
    const timer = setInterval(() => {
      // Reconcile time-based states and any change between render and subscribe.
      if (Date.now() - lastRefresh > 60_000) {
        queued = true;
      }
      flush();
    }, 1_000);
    connect();
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("ceit:mutation", mutation);
    return () => {
      disposed = true;
      close();
      channel?.close();
      clearInterval(timer);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("ceit:mutation", mutation);
    };
  }, [enabled, qr, scope, pathname, router]);

  if (!enabled) {
    return null;
  }
  const label =
    connection === "offline"
      ? "Offline · reconnecting automatically"
      : waiting
        ? "Updates waiting · finish saving your edits"
        : connection === "reconnecting"
          ? "Reconnecting to live updates…"
          : connection === "connecting"
            ? "Connecting to live updates…"
            : refreshing
              ? "Updating…"
              : "Live updates on";
  return (
    <div
      className={`live-updates ${dashboard ? "live-updates-dashboard" : ""}`}
      data-connection={connection}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="live-update-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
