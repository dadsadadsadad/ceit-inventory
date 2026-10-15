"use client";

import { Check, Monitor, Package } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export type LabelGridItem = {
  assetTag: string | null;
  category: string;
  id: string;
  isComputer: boolean;
  photoId: string | null;
  location: string;
  name: string;
};

// selected ids are kept in the url (ids=) so they survive paging and reloads
export function LabelItemGrid({
  items,
  matchingIds,
  max,
  selected,
  totalMatching,
}: {
  items: LabelGridItem[];
  // only set when the matches fit in one batch
  matchingIds: string[] | null;
  max: number;
  selected: string[];
  totalMatching: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const parameters = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState(selected);
  const [message, setMessage] = useState("");
  // new selection from the server replaces the local one
  const selectedKey = selected.join(",");
  const [savedKey, setSavedKey] = useState(selectedKey);
  if (selectedKey !== savedKey) {
    setSavedKey(selectedKey);
    setPicked(selected);
  }

  const pickedSet = new Set(picked);
  const pageIds = items.map((item) => item.id);
  const allOnPagePicked = pageIds.length > 0 && pageIds.every((id) => pickedSet.has(id));
  const allMatchingPicked =
    matchingIds !== null && matchingIds.length > 0 && matchingIds.every((id) => pickedSet.has(id));

  function commit(next: string[]) {
    if (next.length > max) {
      setMessage(`One batch holds up to ${max} labels at a time.`);
      return;
    }
    setMessage("");
    setPicked(next);
    const query = new URLSearchParams(parameters.toString());
    if (next.length) {
      query.set("ids", next.join(","));
    } else {
      query.delete("ids");
    }
    const search = query.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  }

  function toggle(id: string) {
    commit(pickedSet.has(id) ? picked.filter((entry) => entry !== id) : [...picked, id]);
  }

  function addAll(ids: string[]) {
    commit([...picked, ...ids.filter((id) => !pickedSet.has(id))]);
  }

  function removeAll(ids: string[]) {
    const remove = new Set(ids);
    commit(picked.filter((id) => !remove.has(id)));
  }

  return (
    <div className="label-grid-block" aria-busy={pending || undefined}>
      <div className="label-grid-toolbar">
        <p className="text-sm">
          <strong>{picked.length}</strong> selected
          <span className="muted">
            {" "}
            · {totalMatching.toLocaleString()} item{totalMatching === 1 ? "" : "s"} shown
          </span>
        </p>
        <div className="label-grid-actions">
          {items.length ? (
            <button
              type="button"
              className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
              onClick={() => (allOnPagePicked ? removeAll(pageIds) : addAll(pageIds))}
            >
              {allOnPagePicked ? "Deselect this page" : "Select this page"}
            </button>
          ) : null}
          {matchingIds && matchingIds.length > items.length ? (
            <button
              type="button"
              className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
              onClick={() => (allMatchingPicked ? removeAll(matchingIds) : addAll(matchingIds))}
            >
              {allMatchingPicked
                ? `Deselect all ${matchingIds.length}`
                : `Select all ${matchingIds.length}`}
            </button>
          ) : null}
          {picked.length ? (
            <button
              type="button"
              className="accent-link px-1 text-sm font-semibold"
              onClick={() => commit([])}
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </div>
      {message ? (
        <p className="notice rounded-lg px-4 py-3 text-sm" role="alert">
          {message}
        </p>
      ) : null}
      {matchingIds === null && totalMatching > max ? (
        <p className="muted text-sm">
          More than {max} items match. Narrow the filters to select all.
        </p>
      ) : null}

      {items.length ? (
        <ul className="label-grid" aria-label="Items to print labels for">
          {items.map((item) => {
            const isPicked = pickedSet.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="label-tile"
                  aria-pressed={isPicked}
                  onClick={() => toggle(item.id)}
                >
                  <span className="label-tile-check" aria-hidden="true">
                    {isPicked ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                  <span className="label-tile-symbol" aria-hidden="true">
                    {item.photoId ? (
                      <img
                        src={`/dashboard/inventory/${item.id}/photos/${item.photoId}?size=thumb`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : item.isComputer ? (
                      <Monitor size={18} />
                    ) : (
                      <Package size={18} />
                    )}
                  </span>
                  <span className="label-tile-name">{item.name}</span>
                  <span className="label-tile-tag">{item.assetTag ?? "No asset tag"}</span>
                  <span className="label-tile-meta">
                    {item.location} · {item.category}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
