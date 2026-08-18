"use client";

export function PrintLabel() {
  return <button type="button" onClick={() => window.print()} className="primary-button no-print rounded-lg px-4 py-2.5 text-sm font-semibold">Print this label</button>;
}
