import type { ReactNode } from "react";

import { formatManilaDate } from "@/lib/manila-date";
import type { ReportModel, ReportTable } from "@/lib/reports/model";

function Cell({ text, primary }: { primary?: boolean; text: string }) {
  const [first, ...rest] = text.split("\n");
  return (
    <>
      {primary ? <strong className="report-cell-main">{first}</strong> : <span>{first}</span>}
      {rest.map((line, index) => (
        <small key={index} className="report-cell-line">
          {line}
        </small>
      ))}
    </>
  );
}

// Column widths follow the PDF's proportions, so every table in a report lines up the same way.
function columnShares(table: ReportTable) {
  const total = table.columns.reduce((sum, column) => sum + column.width, 0);
  return table.columns.map((column) => `${((column.width / total) * 100).toFixed(2)}%`);
}

function Table({ table }: { table: ReportTable }) {
  const trimmed = table.rows.length < table.total;
  const shares = columnShares(table);
  return (
    <section className="report-section" aria-label={table.heading}>
      <div className="report-section-head">
        <h3>{table.heading}</h3>
        <span className="muted text-sm">
          {table.total.toLocaleString()} {table.total === 1 ? "row" : "rows"}
        </span>
      </div>
      {table.note ? <p className="muted text-sm">{table.note}</p> : null}
      {table.rows.length ? (
        <div className="report-table-wrap">
          <table className="report-table">
            <colgroup>
              {shares.map((share, index) => (
                <col key={index} style={{ width: share }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th
                    key={column.label}
                    scope="col"
                    className={column.align === "right" ? "text-right" : undefined}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {table.columns.map((column, columnIndex) => (
                    <td
                      key={column.label}
                      data-label={column.label}
                      className={column.align === "right" ? "text-right" : undefined}
                    >
                      <Cell primary={column.primary} text={row[columnIndex] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted report-empty">{table.emptyText}</p>
      )}
      {trimmed ? (
        <p className="report-trimmed" role="note">
          Showing the first {table.rows.length.toLocaleString()} of {table.total.toLocaleString()}{" "}
          rows. The PDF and CSV downloads include them all.
        </p>
      ) : null}
    </section>
  );
}

// The generated report, shown on the page the way the PDF will look.
export function ReportSheet({ actions, report }: { actions: ReactNode; report: ReportModel }) {
  return (
    <article className="report-sheet" aria-label={`${report.title} report`}>
      <header className="report-sheet-head">
        <div>
          <p className="eyebrow">Generated report</p>
          <h2 className="report-title">{report.title}</h2>
          <p className="muted text-sm">
            {report.description} Generated{" "}
            {formatManilaDate(report.generatedAt, { dateStyle: "medium", timeStyle: "short" })}.
          </p>
        </div>
        <div className="report-actions">{actions}</div>
      </header>

      <div className="report-filters" aria-label="Filters used">
        <span className="muted text-xs font-bold uppercase tracking-wide">Filters</span>
        {report.filters.length ? (
          report.filters.map((filter) => (
            <span key={filter} className="report-chip">
              {filter}
            </span>
          ))
        ) : (
          <span className="muted text-sm">None. This report covers everything.</span>
        )}
      </div>

      {report.metrics.length ? (
        <dl className="report-metrics">
          {report.metrics.map((metric) => (
            <div key={metric.label} className="report-metric" data-tone={metric.tone}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              {metric.note ? <small className="muted">{metric.note}</small> : null}
            </div>
          ))}
        </dl>
      ) : null}

      {report.tables.map((table) => (
        <Table key={table.heading} table={table} />
      ))}
    </article>
  );
}
