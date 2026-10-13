"use client";

import { useEffect, useState } from "react";

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

/** The current time in the Philippines, kept up to date while the dashboard is open. */
export function DashboardClock({ initial }: { initial: string }) {
  // The shown text only changes once a minute, so checking every second re-renders rarely.
  const [time, setTime] = useState(() => timeFormat.format(new Date(initial)));

  useEffect(() => {
    const tick = () => setTime(timeFormat.format(new Date()));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time className="overview-clock" suppressHydrationWarning>
      {time}
    </time>
  );
}
