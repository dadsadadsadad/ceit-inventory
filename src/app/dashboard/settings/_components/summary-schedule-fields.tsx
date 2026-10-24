"use client";

import { useState } from "react";

import { summaryFrequencies, summaryTimes, weekdays } from "@/lib/notification-kinds";

const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

export function SummaryScheduleFields({
  day,
  frequency,
  time,
}: {
  day: number;
  frequency: string;
  time: string;
}) {
  const [often, setOften] = useState(frequency);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label>
        <span className="text-sm font-semibold">How often</span>
        <select
          name="summaryFrequency"
          value={often}
          onChange={(event) => setOften(event.target.value)}
          className={field}
        >
          {summaryFrequencies.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {often === "weekly" ? (
        <label>
          <span className="text-sm font-semibold">Day</span>
          <select name="summaryDay" defaultValue={String(day)} className={field}>
            {weekdays.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="summaryDay" value={day} />
      )}
      {often === "off" ? (
        <input type="hidden" name="summaryTime" value={time} />
      ) : (
        <label>
          <span className="text-sm font-semibold">Time</span>
          <select name="summaryTime" defaultValue={time} className={field}>
            {summaryTimes.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
