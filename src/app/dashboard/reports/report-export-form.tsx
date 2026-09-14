"use client";
import { useState } from "react";
import Link from "next/link";
import { ItemStatus } from "@prisma/client";
import { inventoryStatusLabel } from "@/lib/inventory-status";
import {
  borrowingReportStates,
  borrowingReportStateLabel,
  exportPeriods,
  type BorrowingReportState,
} from "@/lib/report-export-filters";

type Props = {
  canAdmin: boolean;
  initial: {
    kind: string;
    period: string;
    from: string;
    to: string;
    inventoryStatus: string;
    borrowingState: BorrowingReportState;
    maintenanceSource: string;
    pcOnly: boolean;
  };
};
const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";
const periods = {
  all: "All time",
  today: "Today",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "this-year": "This year",
};
const borrowingDates: Record<BorrowingReportState, string> = {
  all: "request",
  requested: "request",
  declined: "request",
  reserved: "pickup",
  "currently-borrowed": "checkout",
  returned: "return",
  cancelled: "cancellation",
};

// Keep report filters relevant to the selected report.
export function ReportExportForm({ canAdmin, initial }: Props) {
  const [kind, setKind] = useState(initial.kind);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [period, setPeriod] = useState(initial.period);
  const [borrowingState, setBorrowingState] = useState(initial.borrowingState);
  const dateNote =
    kind === "borrowings"
      ? `Filtered by ${borrowingDates[borrowingState]} date.`
      : kind === "maintenance"
        ? "Filtered by report date."
        : kind === "activity"
          ? "Filtered by activity date."
          : "Filtered by date added.";
  return (
    <form
      action="/dashboard/reports/export"
      method="get"
      className="reports-export-form mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end"
    >
      {/* Report type and date filters. */}
      <label>
        <span className="text-sm font-semibold">Report</span>
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={field}
        >
          <option value="inventory">Inventory</option>
          <option value="pcs">PC / Mac register</option>
          <option value="borrowings">Borrowing</option>
          <option value="maintenance">Maintenance requests</option>
          {canAdmin ? <option value="activity">Audit trail</option> : null}
        </select>
      </label>
      <label>
        <span className="text-sm font-semibold">Timeframe</span>
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
          {exportPeriods.map((value) => (
            <option key={value} value={value}>
              {periods[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-sm font-semibold">From</span>
        <input
          type="date"
          name="from"
          value={from}
          max={to || undefined}
          onChange={(event) => {
            setFrom(event.target.value);
            setPeriod("all");
          }}
          className={field}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">To</span>
        <input
          type="date"
          name="to"
          value={to}
          min={from || undefined}
          onChange={(event) => {
            setTo(event.target.value);
            setPeriod("all");
          }}
          className={field}
        />
      </label>
      {/* Inventory-specific filters. */}
      {kind === "inventory" || kind === "pcs" ? (
        <label>
          <span className="text-sm font-semibold">Inventory status</span>
          <select name="inventoryStatus" defaultValue={initial.inventoryStatus} className={field}>
            <option value="">All statuses</option>
            {Object.values(ItemStatus).map((value) => (
              <option key={value} value={value}>
                {inventoryStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {kind === "inventory" ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            name="pcOnly"
            type="checkbox"
            value="1"
            defaultChecked={initial.pcOnly}
            className="h-4 w-4"
          />
          PC / Mac only
        </label>
      ) : null}
      {/* Borrowing status also chooses which date is filtered. */}
      {kind === "borrowings" ? (
        <label>
          <span className="text-sm font-semibold">Borrowing status</span>
          <select
            name="borrowingState"
            value={borrowingState}
            onChange={(event) => setBorrowingState(event.target.value as BorrowingReportState)}
            className={field}
          >
            {borrowingReportStates.map((value) => (
              <option key={value} value={value}>
                {borrowingReportStateLabel(value)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {/* Separate QR issue reports from staff reports. */}
      {kind === "maintenance" ? (
        <label>
          <span className="text-sm font-semibold">Report source</span>
          <select
            name="maintenanceSource"
            defaultValue={initial.maintenanceSource}
            className={field}
          >
            <option value="">All reports</option>
            <option value="QR">QR issue reports</option>
            <option value="STAFF">Staff reports</option>
          </select>
        </label>
      ) : null}
      {/* Download buttons and filter reset. */}
      <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-4">
        <button
          type="submit"
          className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Download CSV
        </button>
        <button
          type="submit"
          formAction="/dashboard/reports/export/pdf"
          className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Download PDF
        </button>
        <Link
          href="/dashboard/reports"
          className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Reset filters
        </Link>
      </div>
      <p className="muted text-xs leading-5 sm:col-span-2 xl:col-span-4">{dateNote}</p>
    </form>
  );
}
