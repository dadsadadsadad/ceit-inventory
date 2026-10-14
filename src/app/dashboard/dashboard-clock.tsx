"use client";

import { useEffect, useState } from "react";

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function DashboardClock({ initial }: { initial: string }) {
  // text only changes per minute so this rarely re-renders
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
