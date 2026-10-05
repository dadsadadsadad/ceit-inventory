import Link from "next/link";
import type { CSSProperties } from "react";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import type { ItemStatus } from "@prisma/client";

export function InventoryMix({ counts }: { counts: { status: ItemStatus; count: number }[] }) {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  const order: ItemStatus[] = [
    "OK",
    "WORKING",
    "DEPLOYED",
    "NOT_TESTED",
    "DEFECTIVE",
    "LOST",
    "RETIRED",
  ];
  const entries = counts
    .filter((entry) => entry.count > 0)
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className="inventory-mix" aria-labelledby="inventory-mix-title">
      <div className="mix-heading">
        <h2 id="inventory-mix-title">Your inventory, at a glance</h2>
        <span className="muted">{total.toLocaleString()} records</span>
      </div>
      {total ? (
        <>
          <div className="mix-track" aria-hidden="true">
            {entries.map(({ status, count }) => (
              <span
                key={status}
                className={`mix-segment mix-${status.toLowerCase()}`}
                style={{ "--share": count / total } as CSSProperties}
              />
            ))}
          </div>
          <ul className="mix-legend">
            {entries.map(({ status, count }) => (
              <li key={status}>
                <Link href={`/dashboard/inventory?status=${status}`}>
                  <span className={`mix-dot mix-${status.toLowerCase()}`} aria-hidden="true" />
                  {inventoryStatusLabel(status)} <b>{count.toLocaleString()}</b>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">Add equipment to see its status breakdown here.</p>
      )}
    </section>
  );
}
