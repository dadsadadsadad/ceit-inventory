"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import {
  calendarKinds,
  dayHeading,
  dayNumber,
  entriesByDay,
  monthGrid,
  monthOfDay,
  monthTitle,
  shiftMonth,
  type CalendarEntry,
  type CalendarKind,
} from "@/lib/calendar";

import { createCalendarEvent, deleteCalendarEvent } from "./calendar-actions";

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const legend: CalendarKind[] = ["return", "pickup", "event", "license", "warranty"];

function dotClass(entry: CalendarEntry) {
  return entry.late ? "cal-dot-late" : `cal-dot-${entry.kind}`;
}

function countText(count: number) {
  return count === 0 ? "nothing planned" : `${count} ${count === 1 ? "thing" : "things"}`;
}

/**
 * A month of what is coming up: loans due back, reservations to hand over, licenses and
 * warranties that end, and events staff add themselves. The current month arrives with the page;
 * other months are fetched when they are opened.
 */
export function DashboardCalendar({
  canEdit,
  initialEntries,
  initialMonth,
  today,
}: {
  canEdit: boolean;
  initialEntries: CalendarEntry[];
  initialMonth: string;
  today: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState(today);
  const [fetched, setFetched] = useState<{ entries: CalendarEntry[]; month: string } | null>(null);
  const [failedMonth, setFailedMonth] = useState<string | null>(null);
  // Bumped after a successful save, so a month fetched earlier is read again.
  const [version, setVersion] = useState(0);

  const visibleFromPage = month === initialMonth;
  const entries = visibleFromPage
    ? initialEntries
    : fetched?.month === month
      ? fetched.entries
      : [];
  const loading = !visibleFromPage && fetched?.month !== month && failedMonth !== month;
  const failed = !visibleFromPage && failedMonth === month;

  useEffect(() => {
    if (visibleFromPage) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/calendar?month=${month}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: { entries: CalendarEntry[] }) => {
        setFetched({ entries: data.entries, month });
        setFailedMonth(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedMonth(month);
        }
      });
    return () => controller.abort();
  }, [month, version, visibleFromPage]);

  useEffect(() => {
    function saved(event: Event) {
      if ((event as CustomEvent).detail?.success) {
        setVersion((value) => value + 1);
      }
    }
    window.addEventListener("ceit:mutation", saved);
    return () => window.removeEventListener("ceit:mutation", saved);
  }, []);

  function open(next: string) {
    setMonth(next);
    setSelected(monthOfDay(today) === next ? today : `${next}-01`);
  }

  const byDay = entriesByDay(entries);
  const activeDay = monthOfDay(selected) === month ? selected : `${month}-01`;
  const dayEntries = byDay.get(activeDay) ?? [];
  const cells = monthGrid(month);

  return (
    <section className="card dashboard-calendar rounded-lg" aria-labelledby="calendar-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Coming up</p>
          <h2 id="calendar-heading" className="mt-1">
            Calendar
          </h2>
        </div>
        <div className="cal-nav">
          <button
            type="button"
            className="cal-nav-button"
            aria-label="Previous month"
            onClick={() => open(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cal-today"
            onClick={() => {
              setMonth(monthOfDay(today));
              setSelected(today);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="cal-nav-button"
            aria-label="Next month"
            onClick={() => open(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="cal-month" aria-live="polite">
        {monthTitle(month)}
        {loading ? <span className="muted"> · loading…</span> : null}
        {failed ? (
          <span className="cal-error">
            {" "}
            · could not load.{" "}
            <button type="button" className="accent-link" onClick={() => setVersion((v) => v + 1)}>
              Try again
            </button>
          </span>
        ) : null}
      </p>

      <div className="cal-grid" role="group" aria-label={`${monthTitle(month)}, choose a day`}>
        {weekdays.map((name) => (
          <span key={name} className="cal-weekday" aria-hidden="true">
            {name}
          </span>
        ))}
        {cells.map(({ day, inMonth }) => {
          const list = inMonth ? (byDay.get(day) ?? []) : [];
          const kinds = [...new Set(list.map(dotClass))].slice(0, 4);
          return (
            <button
              key={day}
              type="button"
              disabled={!inMonth}
              className={`cal-day ${day === today ? "is-today" : ""} ${day === activeDay ? "is-selected" : ""}`}
              aria-pressed={inMonth ? day === activeDay : undefined}
              aria-label={inMonth ? `${dayHeading(day)}, ${countText(list.length)}` : undefined}
              aria-hidden={inMonth ? undefined : true}
              tabIndex={inMonth ? undefined : -1}
              onClick={() => setSelected(day)}
            >
              <span className="cal-day-number">{dayNumber(day)}</span>
              <span className="cal-dots" aria-hidden="true">
                {kinds.map((kind) => (
                  <i key={kind} className={`cal-dot ${kind}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="cal-legend" aria-label="What the dots mean">
        {legend.map((kind) => (
          <li key={kind}>
            <i className={`cal-dot cal-dot-${kind}`} aria-hidden="true" />
            {calendarKinds[kind].plural}
          </li>
        ))}
      </ul>

      <div className="cal-day-detail" aria-live="polite">
        <h3 className="cal-day-title">{dayHeading(activeDay)}</h3>
        {dayEntries.length ? (
          <ul className="cal-entries">
            {dayEntries.map((entry) => (
              <li key={entry.id} className="cal-entry">
                <i className={`cal-dot ${dotClass(entry)}`} aria-hidden="true" />
                <div className="cal-entry-text">
                  <span className="cal-entry-kind">
                    {entry.late ? "Overdue return" : calendarKinds[entry.kind].label}
                  </span>
                  {entry.href ? (
                    <Link href={entry.href} className="cal-entry-title accent-link">
                      {entry.title}
                    </Link>
                  ) : (
                    <strong className="cal-entry-title">{entry.title}</strong>
                  )}
                  {entry.detail ? <small>{entry.detail}</small> : null}
                </div>
                {entry.eventId && canEdit ? (
                  <FeedbackForm action={deleteCalendarEvent} successMessage="Event removed.">
                    <input type="hidden" name="id" value={entry.eventId} />
                    <button
                      className="cal-remove"
                      aria-label={`Remove the event ${entry.title}`}
                      title="Remove this event"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </FeedbackForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted cal-empty">Nothing planned for this day.</p>
        )}

        {canEdit ? (
          <FeedbackForm
            action={createCalendarEvent}
            successMessage="Event added."
            className="cal-add"
          >
            <input type="hidden" name="day" value={activeDay} />
            <label className="sr-only" htmlFor="calendar-event-title">
              New event for {dayHeading(activeDay)}
            </label>
            <input
              id="calendar-event-title"
              name="title"
              required
              maxLength={120}
              className="field w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Add an event, such as a lab check"
            />
            <label className="sr-only" htmlFor="calendar-event-notes">
              Note (optional)
            </label>
            <input
              id="calendar-event-notes"
              name="notes"
              maxLength={500}
              className="field w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder="Note (optional)"
            />
            <SubmitButton
              pendingLabel="Adding…"
              className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Add to {monthTitle(month).split(" ")[0]} {dayNumber(activeDay)}
            </SubmitButton>
          </FeedbackForm>
        ) : null}
      </div>
    </section>
  );
}
