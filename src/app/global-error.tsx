"use client";

import { useEffect } from "react";

// Fallback when the app shell cannot load. The stylesheet may not have loaded either, so every
// style here is inline and uses the same paper-and-ink palette as the rest of the app.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("CEIT Inventory global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#f2ede1",
          color: "#1e1a14",
          display: "grid",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
          margin: 0,
          minHeight: "100vh",
          padding: "1.25rem",
          placeItems: "center",
        }}
      >
        <main
          style={{
            background: "#fbf8f1",
            border: "1px solid rgba(30,26,20,.15)",
            borderRadius: "12px",
            boxShadow: "0 10px 24px -14px rgba(30,26,20,.35)",
            maxWidth: "32rem",
            padding: "2.5rem 2rem",
            position: "relative",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "#b83f0b",
              height: "9px",
              left: "calc(50% - 4.5px)",
              position: "absolute",
              top: "1.35rem",
              transform: "rotate(45deg)",
              width: "9px",
            }}
          />
          <p
            style={{
              color: "#665e50",
              fontFamily: "Consolas, 'SFMono-Regular', monospace",
              fontSize: ".875rem",
              letterSpacing: ".1em",
              margin: "1.1rem 0 0",
              textTransform: "uppercase",
            }}
          >
            Temporary issue
          </p>
          <h1
            style={{
              fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
              fontSize: "clamp(1.7rem, 7vw, 2.15rem)",
              fontWeight: 600,
              letterSpacing: "-.02em",
              lineHeight: 1.1,
              margin: ".85rem 0 0",
            }}
          >
            CEIT Inventory is temporarily unavailable
          </h1>
          <p style={{ color: "#665e50", lineHeight: 1.65, margin: "1rem 0 0" }}>
            Try again in a moment. If this persists, ask the system administrator to check the
            application logs.
          </p>
          {/* Retry loading the app. */}
          <button
            onClick={retry}
            style={{
              background: "#b83f0b",
              border: "1px solid #8f2f06",
              borderRadius: "8px",
              boxShadow: "inset 0 -2px 0 rgba(0,0,0,.16)",
              color: "white",
              cursor: "pointer",
              fontSize: ".9375rem",
              fontWeight: 700,
              marginTop: "1.7rem",
              minHeight: "2.75rem",
              padding: ".7rem 1.25rem",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
