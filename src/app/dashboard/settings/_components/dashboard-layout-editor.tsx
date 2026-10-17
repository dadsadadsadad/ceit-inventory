"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import {
  widgetInfo,
  widgetSizes,
  widgetSpan,
  type WidgetSetting,
  type WidgetSize,
  type WidgetZone,
} from "@/lib/dashboard-layout";

import { resetDashboardLayout, saveDashboardLayout } from "../dashboard-layout-actions";

export function DashboardLayoutEditor({
  initial,
  defaults,
}: {
  initial: WidgetSetting[];
  defaults: WidgetSetting[];
}) {
  const [layout, setLayout] = useState(initial);

  const change = (index: number, patch: Partial<WidgetSetting>) =>
    setLayout((current) =>
      current.map((widget, at) => (at === index ? { ...widget, ...patch } : widget)),
    );
  const move = (index: number, by: number) =>
    setLayout((current) => {
      const next = [...current];
      const [widget] = next.splice(index, 1);
      next.splice(index + by, 0, widget);
      return next;
    });
  const shown = layout.filter((widget) => widget.visible);
  const main = shown.filter((widget) => widget.zone === "main");
  const side = shown.filter((widget) => widget.zone === "side");

  return (
    <div className="layout-editor mt-5">
      <ol className="layout-list" aria-label="Dashboard cards, in order">
        {layout.map((widget, index) => {
          const info = widgetInfo(widget.id);
          return (
            <li key={widget.id} className="layout-row" data-hidden={!widget.visible || undefined}>
              <label className="layout-show">
                <input
                  type="checkbox"
                  checked={widget.visible}
                  onChange={(event) => change(index, { visible: event.target.checked })}
                />
                <span>
                  <strong>{info.label}</strong>
                  <small className="muted">{info.description}</small>
                </span>
              </label>
              <div className="layout-controls">
                <label>
                  <span className="sr-only">Where {info.label} goes</span>
                  <select
                    value={widget.zone}
                    disabled={!widget.visible}
                    onChange={(event) => change(index, { zone: event.target.value as WidgetZone })}
                    className="field rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="main">Main area</option>
                    <option value="side">Side column</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Width of {info.label}</span>
                  <select
                    value={widget.size}
                    disabled={!widget.visible || widget.zone === "side"}
                    onChange={(event) => change(index, { size: event.target.value as WidgetSize })}
                    className="field rounded-lg px-2 py-1.5 text-sm"
                  >
                    {widgetSizes.map((size) => (
                      <option key={size.id} value={size.id}>
                        {size.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="layout-move"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${info.label} up`}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="layout-move"
                  disabled={index === layout.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${info.label} down`}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="layout-preview-wrap">
        <p className="muted text-sm font-semibold">Preview</p>
        <div
          className={`layout-preview ${side.length && main.length ? "has-side" : ""}`}
          aria-hidden="true"
        >
          {main.length ? (
            <div className="layout-preview-main">
              {main.map((widget) => (
                <span
                  key={widget.id}
                  style={{ "--span": widgetSpan(widget.size) } as CSSProperties}
                >
                  {widgetInfo(widget.id).label}
                </span>
              ))}
            </div>
          ) : null}
          {side.length ? (
            <div className="layout-preview-side">
              {side.map((widget) => (
                <span key={widget.id}>{widgetInfo(widget.id).label}</span>
              ))}
            </div>
          ) : null}
          {shown.length ? null : <p className="muted text-sm">Nothing shown.</p>}
        </div>
        <p className="muted text-sm">
          On smaller screens cards stack, and the side column moves below the main area.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3 lg:col-span-2">
        <FeedbackForm
          action={saveDashboardLayout}
          resetOnSuccess={false}
          successMessage="Dashboard layout saved."
        >
          <input type="hidden" name="layout" value={JSON.stringify(layout)} />
          <SubmitButton
            pendingLabel="Saving..."
            className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Save layout
          </SubmitButton>
        </FeedbackForm>
        {/* show the default right away, the server clears the saved one */}
        <div onClickCapture={() => setLayout(defaults)}>
          <FeedbackForm action={resetDashboardLayout} successMessage="Back to the default layout.">
            <SubmitButton
              pendingLabel="Resetting..."
              className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Reset to default
            </SubmitButton>
          </FeedbackForm>
        </div>
      </div>
    </div>
  );
}
