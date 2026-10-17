import Link from "next/link";

// small charts for the dashboard, values also live in each mark's label

type Segment = { label: string; value: number; color: string; href: string };

export function Donut({ segments, unit }: { segments: Segment[]; unit: string }) {
  const shown = segments.filter((segment) => segment.value > 0);
  const total = shown.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 15.9155;
  // small gap between slices, none for a single slice
  const gap = shown.length > 1 ? 1.2 : 0;
  const starts = shown.map((_, index) =>
    shown.slice(0, index).reduce((sum, segment) => sum + (segment.value / total) * 100, 0),
  );
  return (
    <div className="viz-donut-wrap">
      <figure className="viz-donut" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <circle className="viz-donut-track" cx="21" cy="21" r={radius} />
          {shown.map((segment, index) => {
            const length = Math.max(0, (segment.value / total) * 100 - gap);
            return (
              <circle
                key={segment.label}
                cx="21"
                cy="21"
                r={radius}
                stroke={segment.color}
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={25 - starts[index]}
              >
                <title>{`${segment.label}: ${segment.value.toLocaleString()} ${unit}`}</title>
              </circle>
            );
          })}
        </svg>
        <figcaption>
          <strong>{total.toLocaleString()}</strong> <span>{unit}</span>
        </figcaption>
      </figure>
      <ul className="viz-legend">
        {shown.map((segment) => (
          <li key={segment.label}>
            <Link href={segment.href} aria-label={`${segment.label} ${segment.value}`}>
              <i style={{ background: segment.color }} aria-hidden="true" />
              <span>{segment.label}</span>
              <b>{segment.value.toLocaleString()}</b>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Columns({
  data,
  unit,
}: {
  data: { label: string; value: number }[];
  unit: string;
}) {
  const max = Math.max(1, ...data.map((entry) => entry.value));
  return (
    <ol className="viz-columns">
      {data.map((entry) => {
        const tip = `${entry.label}: ${entry.value.toLocaleString()} ${unit}`;
        return (
          <li key={entry.label} data-tip={tip} aria-label={tip}>
            <span className="viz-column-group" aria-hidden="true">
              <span
                className="viz-column"
                style={{ height: `${entry.value ? Math.max(4, (entry.value / max) * 100) : 0}%` }}
              />
            </span>
            <span className="viz-column-label" aria-hidden="true">
              {entry.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Bar = { id: string; label: string; value: number; href: string };

// labelled horizontal bars, longest first
export function Bars({
  bars,
  unit,
  empty,
  format = (value: number) => value.toLocaleString(),
}: {
  bars: Bar[];
  unit: string;
  empty: string;
  format?: (value: number) => string;
}) {
  if (!bars.length) {
    return <p className="muted text-sm">{empty}</p>;
  }
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <ul className="viz-bars">
      {bars.map((bar) => (
        <li key={bar.id}>
          <Link
            href={bar.href}
            className="viz-bar"
            aria-label={`${bar.label}: ${format(bar.value)} ${unit}`}
          >
            <span className="viz-bar-label">{bar.label}</span>
            <b>{format(bar.value)}</b>
            <span className="viz-bar-track" aria-hidden="true">
              <span style={{ width: `${bar.value ? Math.max(3, (bar.value / max) * 100) : 0}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
