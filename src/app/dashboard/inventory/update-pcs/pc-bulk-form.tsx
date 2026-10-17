"use client";

import { useState } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { PcHardwareFields, type HardwareSuggestions } from "@/app/components/pc-hardware-fields";
import { SubmitButton } from "@/app/components/submit-button";

import { updateManyPcs } from "../actions/pc-bulk";

export type BulkPc = { id: string; name: string; assetTag: string | null; software: string[] };
export type BulkRoom = { id: string; name: string; pcs: BulkPc[] };

const choices = [
  { value: "install", label: "Add or update software" },
  { value: "remove", label: "Remove software" },
  { value: "hardware", label: "Change hardware" },
] as const;

const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

export function PcBulkForm({
  rooms,
  softwareNames,
  suggestions,
}: {
  rooms: BulkRoom[];
  softwareNames: string[];
  suggestions: HardwareSuggestions;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<(typeof choices)[number]["value"]>("install");

  const toggle = (ids: string[], on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  const pickedSoftware = new Set(
    rooms.flatMap((room) =>
      room.pcs.filter((pc) => picked.has(pc.id)).flatMap((pc) => pc.software),
    ),
  );

  return (
    // keep the picked pcs after saving, a reset would untick them behind react's back
    <FeedbackForm
      action={updateManyPcs}
      successMessage="PCs updated."
      resetOnSuccess={false}
      className="space-y-6"
    >
      <section className="card rounded-lg p-5" aria-labelledby="pick-heading">
        <div className="section-heading">
          <h2 id="pick-heading" className="text-lg font-semibold">
            1. Pick PCs
          </h2>
          <span className="muted text-sm">{picked.size} selected</span>
        </div>
        <div className="pc-pick-rooms mt-4">
          {rooms.map((room) => {
            const ids = room.pcs.map((pc) => pc.id);
            const all = ids.every((id) => picked.has(id));
            const some = !all && ids.some((id) => picked.has(id));
            return (
              <fieldset key={room.id} className="pc-pick-room">
                <legend>
                  <label className="pc-pick-all">
                    <input
                      type="checkbox"
                      checked={all}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = some;
                        }
                      }}
                      onChange={(event) => toggle(ids, event.target.checked)}
                    />
                    <strong>{room.name}</strong>
                    <span className="muted">{room.pcs.length} PCs</span>
                  </label>
                </legend>
                <ul>
                  {room.pcs.map((pc) => (
                    <li key={pc.id}>
                      <label>
                        <input
                          type="checkbox"
                          name="itemIds"
                          value={pc.id}
                          checked={picked.has(pc.id)}
                          onChange={(event) => toggle([pc.id], event.target.checked)}
                        />
                        <span>{pc.name}</span>
                        {pc.assetTag ? <small className="muted">{pc.assetTag}</small> : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="card rounded-lg p-5" aria-labelledby="change-heading">
        <h2 id="change-heading" className="text-lg font-semibold">
          2. Choose the change
        </h2>
        <div className="pc-bulk-choices mt-4" role="radiogroup" aria-label="Change">
          {choices.map((choice) => (
            <label key={choice.value} className="pc-bulk-choice">
              <input
                type="radio"
                name="bulkAction"
                value={choice.value}
                checked={action === choice.value}
                onChange={() => setAction(choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {action === "install" ? (
            <>
              <label>
                <span className="text-sm font-semibold">Software name *</span>
                <input
                  required
                  name="name"
                  list="bulk-software"
                  maxLength={255}
                  className={field}
                  placeholder="Visual Studio Code"
                />
              </label>
              <label>
                <span className="text-sm font-semibold">Version</span>
                <input name="version" maxLength={255} className={field} />
              </label>
              <label>
                <span className="text-sm font-semibold">Licensed?</span>
                <select name="isLicensed" defaultValue="" className={field}>
                  <option value="">Leave as is</option>
                  <option value="yes">Licensed</option>
                  <option value="no">Free or not licensed</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-semibold">License ends</span>
                <input name="licenseExpiresAt" type="date" className={field} />
              </label>
              <label>
                <span className="text-sm font-semibold">Installed on</span>
                <input name="installedAt" type="date" className={field} />
              </label>
              <p className="muted text-sm sm:col-span-2">
                PCs that already have it keep anything you leave blank.
              </p>
              <datalist id="bulk-software">
                {softwareNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          ) : null}
          {action === "remove" ? (
            <label>
              <span className="text-sm font-semibold">Software to remove *</span>
              <select required name="removeName" defaultValue="" className={field}>
                <option value="" disabled>
                  {pickedSoftware.size ? "Pick software" : "Pick PCs first"}
                </option>
                {[...pickedSoftware].sort().map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action === "hardware" ? (
            <>
              <PcHardwareFields bulk suggestions={suggestions} />
              <p className="muted text-sm sm:col-span-2">
                Only the parts you fill in change, the rest stays as it is.
              </p>
            </>
          ) : null}
        </div>
      </section>

      <SubmitButton
        pendingLabel="Updating PCs..."
        className="primary-button rounded-lg px-5 py-2.5 text-sm font-semibold"
      >
        {picked.size ? `Update ${picked.size} ${picked.size === 1 ? "PC" : "PCs"}` : "Update PCs"}
      </SubmitButton>
    </FeedbackForm>
  );
}
