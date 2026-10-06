"use client";

import { Printer } from "lucide-react";

// Open the browser's print dialog for the page. Print rules in the stylesheet hide everything
// except what should be on paper.
export function PrintButton({
  className = "secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold",
  label = "Print",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
