import Link from "next/link";

const views = [
  { key: "inventory", label: "Inventory", href: "/dashboard/inventory" },
  { key: "hardware", label: "Hardware", href: "/dashboard/inventory/hardware" },
  { key: "software", label: "Software", href: "/dashboard/inventory/software" },
] as const;

export type InventoryView = (typeof views)[number]["key"];

/** Switches between the equipment list and the hardware and software directories. */
export function InventoryTabs({ current }: { current: InventoryView }) {
  return (
    <nav className="view-tabs" aria-label="Inventory views">
      {views.map((view) => (
        <Link
          key={view.key}
          href={view.href}
          className="view-tab"
          aria-current={view.key === current ? "page" : undefined}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
