import { ClearFiltersButton, FilterForm } from "@/app/components/filter-form";
import {
  auditActionLabel,
  auditActions,
  auditViewDescription,
  auditViewLabel,
  auditViews,
  exportPeriods,
  type AuditTrailFilters,
} from "@/lib/audit-trail";

const periodLabels: Record<(typeof exportPeriods)[number], string> = {
  all: "All time",
  today: "Today",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "this-year": "This year",
};

// Search, quick views, and the less common filters for the audit trail.
export function AuditFilters({ filters }: { filters: AuditTrailFilters }) {
  const advancedOpen = Boolean(
    filters.actor || filters.action || filters.from || filters.to || filters.period !== "all",
  );

  return (
    <FilterForm label="Audit trail filters" className="card space-y-4 rounded-lg p-4 sm:p-5">
      <label className="block">
        <span className="sr-only">Search the audit trail</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.query ?? ""}
          maxLength={120}
          className="field w-full rounded-lg px-3 py-2.5 text-sm"
          placeholder="Search events, people, items, or asset tags…"
        />
      </label>

      <fieldset className="filter-chips" aria-label="Kind of activity">
        <legend className="sr-only">Kind of activity</legend>
        {auditViews.map((view) => (
          <label key={view} className="filter-chip" title={auditViewDescription(view)}>
            <input type="radio" name="view" value={view} defaultChecked={filters.view === view} />
            <span>{auditViewLabel(view)}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted mt-2 text-sm">{auditViewDescription(filters.view)}</p>

      <details className="filter-disclosure" open={advancedOpen}>
        <summary className="cursor-pointer text-sm font-semibold">More filters</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Person</span>
            <input
              name="actor"
              defaultValue={filters.actor ?? ""}
              maxLength={120}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Name or email"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Type of event</span>
            <select
              name="action"
              defaultValue={filters.action ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Any type</option>
              {auditActions.map((action) => (
                <option key={action} value={action}>
                  {auditActionLabel(action)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">Timeframe</span>
            <select
              name="period"
              defaultValue={filters.period}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              {exportPeriods.map((period) => (
                <option key={period} value={period}>
                  {periodLabels[period]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">From</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="muted text-xs font-bold uppercase tracking-wide">To</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ""}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
        </div>
      </details>

      <div>
        <ClearFiltersButton className="accent-link text-sm font-semibold">
          Clear all filters
        </ClearFiltersButton>
      </div>
    </FilterForm>
  );
}
