"use client";

import { createContext, useContext, useOptimistic, useRef, type ReactNode } from "react";
import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { borrowStatusLabel } from "@/lib/borrow-status";
import type { BorrowStatus } from "@prisma/client";

type Values = Record<string, string>;
type Patch = { entity: string; values: Values };
export type OptimisticChange = { entity: string; values?: Values; fields?: Record<string, string> };
const empty: Record<string, Values> = {};
const Context = createContext<{
  values: Record<string, Values>;
  begin: (patch: Patch) => boolean;
  end: (entity: string) => void;
} | null>(null);

export function OptimisticProvider({ children }: { children: ReactNode }) {
  const [values, update] = useOptimistic(empty, (state, patch: Patch) => ({
    ...state,
    [patch.entity]: { ...state[patch.entity], ...patch.values },
  }));
  const inFlight = useRef(new Set<string>());
  function begin(patch: Patch) {
    if (inFlight.current.has(patch.entity)) {
      return false;
    }
    inFlight.current.add(patch.entity);
    update(patch);
    return true;
  }
  return (
    <Context
      value={{
        values,
        begin,
        end: (entity) => {
          inFlight.current.delete(entity);
        },
      }}
    >
      {children}
    </Context>
  );
}

export function useOptimisticChanges() {
  const context = useContext(Context);
  if (!context) {
    throw new Error("OptimisticProvider is required.");
  }
  return context;
}

export function OptimisticText({
  entity,
  field,
  children,
}: {
  entity: string;
  field: string;
  children: ReactNode;
}) {
  const { values } = useOptimisticChanges();
  return (
    <span data-optimistic={values[entity]?.[field] !== undefined || undefined}>
      {values[entity]?.[field] ?? children}
    </span>
  );
}

export function OptimisticStatus({
  entity,
  value,
  kind = "inventory",
}: {
  entity: string;
  value: string;
  kind?: "inventory" | "borrowing" | "maintenance";
}) {
  const { values } = useOptimisticChanges();
  const status = values[entity]?.status ?? value;
  const pending = values[entity] !== undefined;
  const label =
    kind === "borrowing"
      ? borrowStatusLabel(status as BorrowStatus)
      : kind === "maintenance"
        ? status === "OPEN"
          ? "Needs attention"
          : "Resolved"
        : inventoryStatusLabel(status);
  const tone =
    kind === "inventory"
      ? inventoryStatusClass(status)
      : `status-pill status-pill-${
          ["RETURNED", "RESOLVED"].includes(status)
            ? "positive"
            : ["CANCELLED", "DECLINED"].includes(status)
              ? "critical"
              : ["BORROWED", "RESERVED"].includes(status)
                ? "deployed"
                : "pending"
        }`;
  return (
    <span
      className={`${tone} rounded-md px-2.5 py-1 text-xs font-semibold`}
      data-optimistic={pending || undefined}
      aria-live="polite"
    >
      {label}
      {pending && <span className="optimistic-saving"> · Saving…</span>}
    </span>
  );
}
