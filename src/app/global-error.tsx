"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("CEIT Inventory global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ alignItems: "center", background: "linear-gradient(125deg, rgba(255,146,73,.16), transparent 37%, rgba(180,70,15,.08) 72%, transparent), #0b0c10", color: "#fffaf5", display: "grid", fontFamily: "Inter, Arial, sans-serif", margin: 0, minHeight: "100vh", padding: "1.25rem", placeItems: "center" }}>
        <main style={{ background: "linear-gradient(135deg, rgba(255,255,255,.06), transparent 45%), #17171c", border: "1px solid rgba(255,164,92,.3)", borderRadius: "20px", boxShadow: "0 28px 64px rgba(0,0,0,.38)", maxWidth: "32rem", padding: "2.5rem 2rem", position: "relative", textAlign: "center" }}>
          <div style={{ background: "#ff9b50", borderRadius: "99px", boxShadow: "0 0 0 7px rgba(255,155,80,.15)", height: "9px", left: "calc(50% - 4.5px)", position: "absolute", top: "1.35rem", width: "9px" }} />
          <p style={{ color: "#ffb778", fontSize: ".72rem", fontWeight: 800, letterSpacing: ".17em", margin: "1.1rem 0 0", textTransform: "uppercase" }}>Temporary issue</p>
          <h1 style={{ fontSize: "clamp(1.7rem, 7vw, 2.15rem)", letterSpacing: "-.035em", lineHeight: 1.1, margin: ".85rem 0 0" }}>CEIT Inventory is temporarily unavailable</h1>
          <p style={{ color: "#c9bcb1", lineHeight: 1.65, margin: "1rem 0 0" }}>Try again in a moment. If this persists, ask the system administrator to check the application logs.</p>
          <button onClick={retry} style={{ background: "linear-gradient(135deg, #dd651b, #b9420c)", border: "1px solid rgba(255,203,156,.35)", borderRadius: "11px", boxShadow: "0 10px 22px rgba(164,61,9,.35)", color: "white", cursor: "pointer", fontSize: ".9rem", fontWeight: 800, marginTop: "1.7rem", padding: ".8rem 1.15rem" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
