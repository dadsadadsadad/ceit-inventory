"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type PickedItem = { assetTag: string | null; id: string; location: string; name: string };

const typingDelayMs = 200;

// type to search equipment, the chosen id goes in a hidden input
export function ItemPicker({
  initial = null,
  label,
  name,
}: {
  initial?: PickedItem | null;
  label: string;
  name: string;
}) {
  const id = useId();
  const listId = `${id}-results`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedItem | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/items?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Search failed");
        }
        const data = (await response.json()) as { items: PickedItem[] };
        setResults(data.items);
        setActive(data.items.length ? 0 : -1);
        setStatus(data.items.length ? "idle" : "empty");
      } catch (error) {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus("error");
        }
        void error;
      }
    }, typingDelayMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function choose(item: PickedItem) {
    setPicked(item);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function clear() {
    setPicked(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div className="item-picker">
      <input
        type="hidden"
        name={name}
        value={picked?.id ?? ""}
        data-preview-label={picked?.name ?? ""}
      />
      {picked ? (
        <div className="item-picker-chosen">
          <span className="text-sm font-semibold">{label}</span>
          <div className="item-picker-chip">
            <span>
              <strong>{picked.name}</strong>
              <small>{[picked.assetTag, picked.location].filter(Boolean).join(" · ")}</small>
            </span>
            <button type="button" onClick={clear} className="accent-link text-sm font-semibold">
              <X size={15} aria-hidden="true" /> Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <label htmlFor={id} className="block text-sm font-semibold">
            {label}
          </label>
          <span className="item-picker-box mt-2">
            <Search size={16} aria-hidden="true" />
            <input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={listId}
              aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
              autoComplete="off"
              required
              value={query}
              maxLength={120}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                if (!event.target.value.trim()) {
                  setResults([]);
                  setStatus("idle");
                }
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKeyDown}
              className="field w-full rounded-lg py-2.5 pr-3 text-sm"
              placeholder="Start typing a name, asset tag, serial number, or room"
            />
          </span>
          {showList ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={`${label} matches`}
              className="item-picker-list"
            >
              {results.map((item, index) => (
                <li
                  key={item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className="item-picker-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <strong>{item.name}</strong>
                  <small>{[item.assetTag, item.location].filter(Boolean).join(" · ")}</small>
                </li>
              ))}
              {status !== "idle" || !results.length ? (
                <li className="item-picker-note" role="presentation">
                  {status === "loading"
                    ? "Searching..."
                    : status === "error"
                      ? "Couldn't search right now. Try again."
                      : "No equipment matches. Try another word."}
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
