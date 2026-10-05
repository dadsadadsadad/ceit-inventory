import Link from "next/link";

import type { DirectoryPc } from "@/lib/computer-directory";

const visibleCount = 6;

function PcChip({ pc }: { pc: DirectoryPc }) {
  return (
    <Link
      href={`/dashboard/inventory/${pc.id}`}
      className="pc-chip"
      title={pc.assetTag ? `${pc.name} · ${pc.assetTag} · ${pc.room}` : `${pc.name} · ${pc.room}`}
    >
      <span className="pc-chip-name">{pc.name}</span>
      <span className="pc-chip-room">{pc.room}</span>
    </Link>
  );
}

/** The PCs behind a hardware or software entry: a few chips, with the rest one click away. */
export function PcChips({ pcs }: { pcs: DirectoryPc[] }) {
  const shown = pcs.slice(0, visibleCount);
  const rest = pcs.slice(visibleCount);
  return (
    <div className="pc-chips">
      {shown.map((pc) => (
        <PcChip key={pc.id} pc={pc} />
      ))}
      {rest.length ? (
        <details className="pc-chips-more">
          <summary className="pc-chip pc-chip-more">+{rest.length} more</summary>
          <div className="pc-chips mt-2">
            {rest.map((pc) => (
              <PcChip key={pc.id} pc={pc} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
