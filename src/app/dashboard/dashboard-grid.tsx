"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  widgetInfo,
  widgetSizes,
  widgetSpan,
  type WidgetId,
  type WidgetSetting,
  type WidgetSize,
  type WidgetZone,
} from "@/lib/dashboard-layout";

import { resetDashboardLayout, saveDashboardLayout } from "./dashboard-layout-actions";

const spans = widgetSizes.map((size) => size.span);
const sizeForSpan = (span: number) => widgetSizes.find((size) => size.span === span)?.id ?? "full";
const nearestSpan = (span: number) =>
  spans.reduce((best, value) => (Math.abs(value - span) < Math.abs(best - span) ? value : best));
const zoneId = (zone: WidgetZone) => `zone-${zone}`;

type Props = {
  layout: WidgetSetting[];
  defaults: WidgetSetting[];
  nodes: Partial<Record<WidgetId, ReactNode>>;
  editing: boolean;
};

export function DashboardGrid({ layout, defaults, nodes, editing }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(layout);
  const [synced, setSynced] = useState(layout);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "failed">("");
  const [adding, setAdding] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // take the server's copy after a refresh
  if (synced !== layout) {
    setSynced(layout);
    setItems(layout);
  }

  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current);
      }
    },
    [],
  );

  function save(next: WidgetSetting[], refresh = false) {
    setItems(next);
    setStatus("saving");
    if (pending.current) {
      clearTimeout(pending.current);
    }
    pending.current = setTimeout(async () => {
      const data = new FormData();
      data.set("layout", JSON.stringify(next));
      try {
        const result = await saveDashboardLayout(data);
        setStatus(result.error ? "failed" : "saved");
        if (!result.error && refresh) {
          router.refresh();
        }
      } catch {
        setStatus("failed");
      }
    }, 350);
  }

  const shown = items.filter((widget) => widget.visible);
  const main = shown.filter((widget) => widget.zone === "main");
  const side = shown.filter((widget) => widget.zone === "side");
  const hidden = items.filter((widget) => !widget.visible);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const zoneOf = (id: string) =>
    id === zoneId("main")
      ? "main"
      : id === zoneId("side")
        ? "side"
        : items.find((widget) => widget.id === id)?.zone;

  // moving into the other column while dragging
  function dragOver({ active, over }: DragOverEvent) {
    if (!over) {
      return;
    }
    const from = zoneOf(String(active.id));
    const to = zoneOf(String(over.id));
    if (!from || !to || from === to) {
      return;
    }
    setItems((current) => {
      const index = current.findIndex((widget) => widget.id === active.id);
      const moved = { ...current[index], zone: to };
      const rest = current.filter((_, at) => at !== index);
      const overIndex = rest.findIndex((widget) => widget.id === over.id);
      rest.splice(overIndex === -1 ? rest.length : overIndex, 0, moved);
      return rest;
    });
  }

  function dragEnd({ active, over }: DragEndEvent) {
    const from = items.findIndex((widget) => widget.id === active.id);
    const to = over ? items.findIndex((widget) => widget.id === over.id) : -1;
    save(to === -1 || to === from ? [...items] : arrayMove(items, from, to));
  }

  const change = (id: WidgetId, patch: Partial<WidgetSetting>, refresh = false) =>
    save(
      items.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)),
      refresh,
    );

  function add(id: WidgetId) {
    // new cards go to the end of their usual column
    const widget = items.find((entry) => entry.id === id)!;
    save([...items.filter((entry) => entry.id !== id), { ...widget, visible: true }], true);
  }

  async function reset() {
    setItems(defaults);
    setStatus("saving");
    try {
      const result = await resetDashboardLayout();
      setStatus(result.error ? "failed" : "saved");
      router.refresh();
    } catch {
      setStatus("failed");
    }
  }

  const card = (widget: WidgetSetting) =>
    nodes[widget.id] ?? (
      <div className="card glance-card widget-loading rounded-lg">
        <p className="muted text-sm">Loading {widgetInfo(widget.id).label}...</p>
      </div>
    );

  if (!editing) {
    if (!shown.length) {
      return (
        <p className="notice rounded-lg px-5 py-4 text-sm">
          Every card is hidden.{" "}
          <Link href="/dashboard?edit=1" className="accent-link font-semibold">
            Add some cards
          </Link>
        </p>
      );
    }
    return (
      <div className={`dashboard-layout ${side.length && main.length ? "has-rail" : ""}`}>
        {main.length ? (
          <div className="dashboard-cards">
            {main.map((widget) => (
              <div
                key={widget.id}
                className="dashboard-widget"
                data-widget={widget.id}
                data-size={widget.size}
                style={{ "--span": widgetSpan(widget.size) } as CSSProperties}
              >
                {card(widget)}
              </div>
            ))}
          </div>
        ) : null}
        {side.length ? (
          <aside className="dashboard-rail" aria-label="Side cards">
            {side.map((widget) => (
              <div key={widget.id} className="dashboard-widget" data-widget={widget.id}>
                {card(widget)}
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dashboard-editing">
      <div className="edit-bar" role="region" aria-label="Edit dashboard">
        <p>
          <strong>Editing your dashboard.</strong>{" "}
          <span className="muted">
            Drag a card by its handle to move it, drag its right edge to resize it.
          </span>
        </p>
        <div className="edit-bar-actions">
          <span className="muted text-sm" role="status">
            {status === "saving"
              ? "Saving..."
              : status === "saved"
                ? "Saved"
                : status === "failed"
                  ? "Couldn't save, try again"
                  : ""}
          </span>
          <button
            type="button"
            className="secondary-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            aria-expanded={adding}
            onClick={() => setAdding(!adding)}
          >
            <Plus size={16} aria-hidden="true" /> Add cards
          </button>
          <button
            type="button"
            className="secondary-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            onClick={reset}
          >
            <RotateCcw size={16} aria-hidden="true" /> Reset
          </button>
          <Link
            href="/dashboard"
            className="primary-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Done
          </Link>
        </div>
      </div>

      {adding ? (
        <section className="add-cards" aria-label="Cards you can add">
          {hidden.length ? (
            hidden.map((widget) => {
              const info = widgetInfo(widget.id);
              return (
                <button
                  key={widget.id}
                  type="button"
                  className="add-card"
                  onClick={() => add(widget.id)}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>
                    <strong>{info.label}</strong>
                    <small className="muted">{info.description}</small>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="muted text-sm">Every card is already on your dashboard.</p>
          )}
        </section>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={dragOver}
        onDragEnd={dragEnd}
      >
        <div className={`dashboard-layout ${editing ? "has-rail" : ""}`}>
          <Zone zone="main" ids={main.map((widget) => widget.id)}>
            {main.map((widget) => (
              <EditableCard
                key={widget.id}
                widget={widget}
                onRemove={() => change(widget.id, { visible: false })}
                onResize={(size) => change(widget.id, { size })}
              >
                {card(widget)}
              </EditableCard>
            ))}
          </Zone>
          <Zone zone="side" ids={side.map((widget) => widget.id)}>
            {side.map((widget) => (
              <EditableCard
                key={widget.id}
                widget={widget}
                onRemove={() => change(widget.id, { visible: false })}
              >
                {card(widget)}
              </EditableCard>
            ))}
          </Zone>
        </div>
      </DndContext>
    </div>
  );
}

function Zone({ zone, ids, children }: { zone: WidgetZone; ids: string[]; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(zone) });
  return (
    <SortableContext
      items={ids}
      strategy={zone === "main" ? rectSortingStrategy : verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={zone === "main" ? "dashboard-cards edit-zone" : "dashboard-rail edit-zone"}
        data-zone={zone}
        data-over={isOver || undefined}
        aria-label={zone === "main" ? "Main area" : "Side column"}
      >
        {children}
        {ids.length ? null : (
          <p className="edit-empty muted text-sm">
            {zone === "main" ? "Drop cards here" : "Drop cards here for the side column"}
          </p>
        )}
      </div>
    </SortableContext>
  );
}

function EditableCard({
  widget,
  children,
  onRemove,
  onResize,
}: {
  widget: WidgetSetting;
  children: ReactNode;
  onRemove: () => void;
  onResize?: (size: WidgetSize) => void;
}) {
  const info = widgetInfo(widget.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });
  const [liveSpan, setLiveSpan] = useState<number | null>(null);
  const span = liveSpan ?? widgetSpan(widget.size);

  // drag the right edge, snapping to the card sizes
  function startResize(event: PointerEvent<HTMLButtonElement>) {
    const cardElement = event.currentTarget.closest<HTMLElement>(".dashboard-widget");
    const grid = cardElement?.parentElement;
    if (!cardElement || !grid || !onResize) {
      return;
    }
    event.preventDefault();
    const area = grid.getBoundingClientRect();
    const column = area.width / 12;
    const left = cardElement.getBoundingClientRect().left;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let next = widgetSpan(widget.size);
    const move = (moveEvent: globalThis.PointerEvent) => {
      // past the right edge means full width, the card moves to its own row
      next =
        moveEvent.clientX > area.right - column / 2
          ? 12
          : nearestSpan(Math.max(3, Math.min(12, Math.round((moveEvent.clientX - left) / column))));
      setLiveSpan(next);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setLiveSpan(null);
      if (next !== widgetSpan(widget.size)) {
        onResize(sizeForSpan(next));
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function keyResize(event: KeyboardEvent<HTMLButtonElement>) {
    if (!onResize || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    const index = spans.indexOf(widgetSpan(widget.size));
    const next =
      spans[Math.max(0, Math.min(spans.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
    onResize(sizeForSpan(next));
  }

  return (
    <div
      ref={setNodeRef}
      className="dashboard-widget editable-widget"
      data-widget={widget.id}
      data-size={sizeForSpan(span)}
      data-dragging={isDragging || undefined}
      data-resizing={liveSpan !== null || undefined}
      style={
        {
          "--span": span,
          transform: CSS.Translate.toString(transform),
          transition,
        } as CSSProperties
      }
    >
      <div className="edit-chrome">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="edit-handle"
          aria-label={`Move ${info.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
          <span>{info.label}</span>
        </button>
        {onResize ? (
          <span className="edit-size muted">
            {widgetSizes.find((size) => size.span === span)?.label}
          </span>
        ) : null}
        <button
          type="button"
          className="edit-remove"
          aria-label={`Remove ${info.label}`}
          onClick={onRemove}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="edit-body" inert>
        {children}
      </div>
      {onResize ? (
        <button
          type="button"
          className="edit-resize"
          aria-label={`Resize ${info.label}, now ${widgetSizes.find((size) => size.span === span)?.label}. Use left and right arrows.`}
          onPointerDown={startResize}
          onKeyDown={keyResize}
        />
      ) : null}
    </div>
  );
}
