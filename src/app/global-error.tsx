"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("CEIT Inventory global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ alignItems: "center", background: "#0b0b0d", color: "#f8f4ec", display: "grid", fontFamily: "Arial, sans-serif", margin: 0, minHeight: "100vh", padding: "1.25rem", placeItems: "center" }}>
        <main style={{ background: "#151515", border: "1px solid rgba(255,255,255,.12)", borderRadius: "12px", boxShadow: "0 18px 50px rgba(0,0,0,.28)", maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "#f59e0b", fontSize: ".8rem", fontWeight: 700, letterSpacing: ".15em", margin: 0, textTransform: "uppercase" }}>Temporary issue</p>
          <h1 style={{ fontSize: "1.75rem", margin: ".75rem 0 0" }}>CEIT Inventory is temporarily unavailable</h1>
          <p style={{ color: "#b8afa4", lineHeight: 1.6, margin: ".75rem 0 0" }}>Try again in a moment. If this persists, ask the system administrator to check the application logs.</p>
          <button onClick={retry} style={{ background: "#c45a10", border: 0, borderRadius: "8px", color: "white", cursor: "pointer", fontSize: ".9rem", fontWeight: 700, marginTop: "1.5rem", padding: ".7rem 1rem" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
