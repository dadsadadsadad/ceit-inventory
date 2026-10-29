"use client";

import { useState } from "react";

import { ItemPicker, type PickedItem } from "@/app/components/item-picker";
import { intervalChoices, maxIntervalDays } from "@/lib/maintenance-plans";

type Option = { id: string; name: string };

export type PlanValues = {
  title: string;
  notes: string | null;
  intervalDays: number;
  nextDue: string;
  categoryId: string | null;
  locationId: string | null;
  item: PickedItem | null;
};

const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

// same fields for adding and editing a schedule
export function PlanFields({
  categories,
  locations,
  plan,
  today,
}: {
  categories: Option[];
  locations: Option[];
  plan?: PlanValues;
  today: string;
}) {
  const preset = intervalChoices.some((choice) => choice.days === plan?.intervalDays);
  const [repeat, setRepeat] = useState(
    plan ? (preset ? String(plan.intervalDays) : "custom") : "30",
  );
  const [scope, setScope] = useState<"group" | "item">(plan?.item ? "item" : "group");

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Task *</span>
        <input
          required
          name="title"
          defaultValue={plan?.title ?? ""}
          maxLength={120}
          className={field}
          placeholder="Clean and dust the PCs"
        />
      </label>

      <fieldset>
        <legend className="text-sm font-semibold">Applies to</legend>
        <div className="view-switch mt-2" role="radiogroup">
          <label className="view-switch-option">
            <input
              type="radio"
              name="scope"
              value="group"
              checked={scope === "group"}
              onChange={() => setScope("group")}
              className="sr-only"
            />
            A room or category
          </label>
          <label className="view-switch-option">
            <input
              type="radio"
              name="scope"
              value="item"
              checked={scope === "item"}
              onChange={() => setScope("item")}
              className="sr-only"
            />
            One item
          </label>
        </div>
        {scope === "item" ? (
          <div className="mt-3">
            <ItemPicker name="itemId" label="Item *" initial={plan?.item ?? null} />
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-semibold">Room</span>
              <select name="locationId" defaultValue={plan?.locationId ?? ""} className={field}>
                <option value="">Every room</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold">Category</span>
              <select name="categoryId" defaultValue={plan?.categoryId ?? ""} className={field}>
                <option value="">Every category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted text-xs leading-5 sm:col-span-2">
              Pick a room, a category, or both, like Computer Lab 1 and Desktop computers.
            </p>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-semibold">Repeat</span>
          <select
            name="intervalDays"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            className={field}
          >
            {intervalChoices.map((choice) => (
              <option key={choice.days} value={choice.days}>
                {choice.label}
              </option>
            ))}
            <option value="custom">Every few days...</option>
          </select>
        </label>
        {repeat === "custom" ? (
          <label>
            <span className="text-sm font-semibold">Every how many days? *</span>
            <input
              required
              name="customDays"
              type="number"
              min={1}
              max={maxIntervalDays}
              defaultValue={plan && !preset ? plan.intervalDays : 45}
              className={field}
            />
          </label>
        ) : null}
        <label>
          <span className="text-sm font-semibold">{plan ? "Next due *" : "First due *"}</span>
          <input
            required
            name="nextDueOn"
            type="date"
            defaultValue={plan?.nextDue ?? today}
            className={field}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">Steps or notes</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={plan?.notes ?? ""}
          maxLength={1_000}
          className={field}
          placeholder="Blow out dust, check fans and cables, run a disk check."
        />
      </label>
    </div>
  );
}
