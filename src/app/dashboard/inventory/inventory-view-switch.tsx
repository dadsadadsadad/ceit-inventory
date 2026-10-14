"use client";

import Link from "next/link";
import { LayoutGrid, List, Rows3 } from "lucide-react";

import { inventoryViewCookie, type InventoryView } from "./inventory-view";

const views: { value: InventoryView; label: string; Icon: typeof List }[] = [
  { value: "list", label: "List", Icon: List },
  { value: "cards", label: "Cards", Icon: LayoutGrid },
  { value: "compact", label: "Compact", Icon: Rows3 },
];

export function InventoryViewSwitch({
  current,
  hrefFor,
}: {
  current: InventoryView;
  hrefFor: Record<InventoryView, string>;
}) {
  return (
    <nav className="view-switch" aria-label="Inventory view">
      {views.map(({ value, label, Icon }) => (
        <Link
          key={value}
          href={hrefFor[value]}
          scroll={false}
          aria-current={value === current ? "true" : undefined}
          className="view-switch-option"
          onClick={() => {
            document.cookie = `${inventoryViewCookie}=${value}; path=/; max-age=31536000; samesite=lax`;
          }}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
