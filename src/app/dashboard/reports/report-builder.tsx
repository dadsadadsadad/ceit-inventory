"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  reportKindInfo,
  reportKinds,
  type ReportControl,
  type ReportKind,
} from "@/lib/reports/kinds";

type Option = { label: string; value: string };

export type ReportBuilderOptions = {
  actions: Option[];
  auditViews: Option[];
  borrowingStates: Option[];
  categories: Option[];
  components: Option[];
  conditions: Option[];
  inventoryStatuses: Option[];
  itemTypes: Option[];
  licenses: Option[];
  locations: Option[];
  maintenancePriorities: Option[];
  maintenanceSources: Option[];
  maintenanceStatuses: Option[];
  missingDetails: Option[];
  periods: Option[];
  stockLevels: Option[];
  warranties: Option[];
  windows: Option[];
};

type Props = {
  initial: Record<string, string>;
  options: ReportBuilderOptions;
};

const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";
const label = "muted text-xs font-bold uppercase tracking-wide";

// form fields each control fills in
const controlParams: Partial<Record<ReportControl, string[]>> = {
  dates: ["period", "from", "to"],
  price: ["priceMin", "priceMax"],
  purchased: ["purchasedFrom", "purchasedTo"],
  stockLevel: ["stock"],
  maintenanceSource: ["maintenanceSource"],
};

const dateNotes: Partial<Record<ReportKind, string>> = {
  inventory: "Dates are when the item was added.",
  pcs: "Dates are when the PC was added.",
  borrowing:
    "Dates are when the request was made (or picked up, returned, cancelled for those views).",
  maintenance: "Dates are when the problem was reported.",
  activity: "Dates are when it happened.",
};

export function ReportBuilder({ initial, options }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<ReportKind>(
    (reportKinds as readonly string[]).includes(initial.kind)
      ? (initial.kind as ReportKind)
      : "overview",
  );
  const [period, setPeriod] = useState(initial.period ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [changed, setChanged] = useState(false);
  const controls = reportKindInfo[kind].controls;
  const more = reportKindInfo[kind].more ?? [];
  const has = (control: ReportControl) => controls.includes(control);
  const inMain = (control: ReportControl) => has(control) && !more.includes(control);
  const inMore = (control: ReportControl) => more.includes(control);
  // open when one of the extra filters is already set
  const moreSet = more.some((control) =>
    (controlParams[control] ?? [control]).some((name) => initial[name]),
  );

  function collect(form: HTMLFormElement) {
    const data = new FormData(form);
    const values: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim()) {
        values[key] = value.trim();
      }
    }
    return values;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = collect(event.currentTarget);
    const query = new URLSearchParams({ ...values, generate: "1" });
    setChanged(false);
    router.push(`/dashboard/reports?${query.toString()}`);
  }

  function select(name: string, title: string, choices: Option[], any: string) {
    return (
      <label>
        <span className={label}>{title}</span>
        <select name={name} defaultValue={initial[name] ?? ""} className={field}>
          <option value="">{any}</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function check(name: string, text: string) {
    return (
      <label className="filter-check flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={initial[name] === "1"}
          className="h-4 w-4"
        />
        {text}
      </label>
    );
  }

  function fields(has: (control: ReportControl) => boolean) {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
          {has("search") ? (
            <label className="sm:col-span-2">
              <span className={label}>Search</span>
              <input
                type="search"
                name="q"
                defaultValue={initial.q ?? ""}
                maxLength={120}
                placeholder="Search"
                className={field}
              />
            </label>
          ) : null}
          {has("inventoryStatus")
            ? select("inventoryStatus", "Status", options.inventoryStatuses, "Any status")
            : null}
          {has("condition")
            ? select("condition", "Condition", options.conditions, "Any condition")
            : null}
          {has("category")
            ? select("category", "Category", options.categories, "All categories")
            : null}
          {has("location") ? select("location", "Room", options.locations, "All rooms") : null}
          {has("stockLevel")
            ? select("stock", "Stock level", options.stockLevels, "Any level")
            : null}
          {has("warranty")
            ? select("warranty", "Warranty", options.warranties, "Any warranty")
            : null}
          {has("itemType")
            ? select("itemType", "Kind of record", options.itemTypes, "Everything")
            : null}
          {has("component")
            ? select("component", "Hardware part", options.components, "All parts")
            : null}
          {has("license") ? select("license", "License", options.licenses, "Any license") : null}
          {has("within")
            ? select(
                "within",
                kind === "software"
                  ? "License ends within"
                  : kind === "checks"
                    ? "Checked within"
                    : "Warranty ends within",
                options.windows,
                kind === "checks" ? "Last 30 days" : "Any time",
              )
            : null}
          {has("missing")
            ? select(
                "missing",
                "Missing",
                options.missingDetails,
                // record health defaults to every missing detail
                kind === "health" ? "Anything missing" : "Any record",
              )
            : null}
          {has("price") ? (
            <>
              <label>
                <span className={label}>Price from (₱)</span>
                <input
                  name="priceMin"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={initial.priceMin ?? ""}
                  placeholder="0"
                  className={field}
                />
              </label>
              <label>
                <span className={label}>Price to (₱)</span>
                <input
                  name="priceMax"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={initial.priceMax ?? ""}
                  placeholder="Any"
                  className={field}
                />
              </label>
            </>
          ) : null}
          {has("purchased") ? (
            <>
              <label>
                <span className={label}>Bought from</span>
                <input
                  name="purchasedFrom"
                  type="date"
                  defaultValue={initial.purchasedFrom ?? ""}
                  className={field}
                />
              </label>
              <label>
                <span className={label}>Bought to</span>
                <input
                  name="purchasedTo"
                  type="date"
                  defaultValue={initial.purchasedTo ?? ""}
                  className={field}
                />
              </label>
            </>
          ) : null}
          {has("borrowingState")
            ? select("borrowingState", "Show", options.borrowingStates, "All requests")
            : null}
          {has("maintenanceStatus")
            ? select("maintenanceStatus", "Status", options.maintenanceStatuses, "Any status")
            : null}
          {has("maintenancePriority")
            ? select(
                "maintenancePriority",
                "Priority",
                options.maintenancePriorities,
                "Any priority",
              )
            : null}
          {has("maintenanceSource")
            ? select(
                "maintenanceSource",
                "Reported through",
                options.maintenanceSources,
                "Anywhere",
              )
            : null}
          {has("auditView") ? (
            <label>
              <span className={label}>Kind of activity</span>
              <select name="view" defaultValue={initial.view ?? "important"} className={field}>
                {options.auditViews.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {has("action") ? select("action", "Type of event", options.actions, "Any type") : null}
          {has("actor") ? (
            <label>
              <span className={label}>Person</span>
              <input
                name="actor"
                defaultValue={initial.actor ?? ""}
                maxLength={120}
                placeholder="Name or email"
                className={field}
              />
            </label>
          ) : null}
          {has("dates") ? (
            <>
              <label>
                <span className={label}>Timeframe</span>
                <select
                  name="period"
                  value={period}
                  onChange={(event) => {
                    setPeriod(event.target.value);
                    setFrom("");
                    setTo("");
                  }}
                  className={field}
                >
                  {options.periods.map((choice) => (
                    <option key={choice.value} value={choice.value === "all" ? "" : choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>From</span>
                <input
                  type="date"
                  name="from"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPeriod("");
                  }}
                  className={field}
                />
              </label>
              <label>
                <span className={label}>To</span>
                <input
                  type="date"
                  name="to"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPeriod("");
                  }}
                  className={field}
                />
              </label>
            </>
          ) : null}
        </div>
        {has("pcOnly") || has("attention") || has("incomplete") || has("retired") ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {has("pcOnly") ? check("pcOnly", "PCs and Macs only") : null}
            {has("attention") ? check("attention", "Needs attention only") : null}
            {has("incomplete") ? check("incomplete", "Only PCs missing hardware details") : null}
            {has("retired") ? check("retired", "Include retired and lost PCs") : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <form
      aria-label="Report builder"
      onSubmit={submit}
      onChange={() => setChanged(true)}
      className="card space-y-5 rounded-lg p-4 sm:p-6"
    >
      <fieldset className="report-kinds">
        <legend className={label}>Report</legend>
        <div className="filter-chips mt-3">
          {reportKinds.map((value) => (
            <label key={value} className="filter-chip">
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              <span>{reportKindInfo[value].label}</span>
            </label>
          ))}
        </div>
        <p className="muted mt-3 text-sm">{reportKindInfo[kind].description}</p>
      </fieldset>

      {controls.length ? fields(inMain) : null}

      {more.length ? (
        <details className="filter-disclosure" open={moreSet}>
          <summary className="cursor-pointer text-sm font-semibold">More filters</summary>
          <div className="mt-4 space-y-5">{fields(inMore)}</div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="primary-button rounded-lg px-5 py-2.5 text-sm font-semibold"
        >
          Generate report
        </button>
        <button
          type="button"
          className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          onClick={() => router.push(`/dashboard/reports?kind=${kind}`)}
        >
          Clear filters
        </button>
        {changed ? (
          <span className="muted text-sm" role="status">
            Filters changed. Generate again to update.
          </span>
        ) : null}
      </div>
      {has("dates") && dateNotes[kind] ? (
        <p className="muted text-xs leading-5">{dateNotes[kind]}</p>
      ) : null}
    </form>
  );
}
