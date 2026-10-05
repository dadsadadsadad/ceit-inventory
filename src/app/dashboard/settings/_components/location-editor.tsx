import { OptimisticText } from "@/app/components/optimistic-state";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { deleteLocation, setLocationActive, updateLocation } from "../actions";

// Edit a room and manage whether it is available.
export function LocationEditor({
  location,
}: {
  location: {
    id: string;
    name: string;
    assetTagCode: string | null;
    roomNumber: string | null;
    description: string | null;
    isActive: boolean;
    _count: { items: number };
  };
}) {
  const hasAssignedItems = location._count.items > 0;

  return (
    <details className="section-disclosure card-muted rounded-lg p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          <strong>
            <OptimisticText entity={`location:${location.id}`} field="name">
              {location.name}
            </OptimisticText>
          </strong>
          {location.roomNumber ? <span className="muted"> · {location.roomNumber}</span> : null}
        </span>
        <span className="flex items-center gap-3">
          <span className="muted">
            {location._count.items} record{location._count.items === 1 ? "" : "s"}
          </span>
          {!location.isActive ? (
            <span className="status-pill rounded-md px-2 py-1 text-xs font-semibold">Inactive</span>
          ) : null}
        </span>
      </summary>
      {/* Save room details. */}
      <FeedbackForm
        resetOnSuccess={false}
        action={updateLocation}
        optimistic={{ entity: `location:${location.id}`, fields: { name: "name" } }}
        revision={JSON.stringify(location)}
        className="divider mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="id" value={location.id} />
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Location name</span>
          <input
            required
            name="name"
            defaultValue={location.name}
            maxLength={255}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Room number</span>
          <input
            name="roomNumber"
            defaultValue={location.roomNumber ?? ""}
            maxLength={100}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="muted text-xs font-bold uppercase tracking-wide">Tag code</span>
          <input
            required
            name="assetTagCode"
            defaultValue={location.assetTagCode ?? ""}
            maxLength={2}
            pattern="[0-9]{2}"
            title="Use two digits, such as 05."
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="muted text-xs font-bold uppercase tracking-wide">Description</span>
          <input
            name="description"
            defaultValue={location.description ?? ""}
            maxLength={2_000}
            className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <SubmitButton
          pendingLabel="Saving…"
          className="secondary-button justify-self-start rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Save location
        </SubmitButton>
      </FeedbackForm>
      {/* Enable or disable this room. */}
      <FeedbackForm action={setLocationActive} className="mt-3">
        <input type="hidden" name="id" value={location.id} />
        <input type="hidden" name="isActive" value={String(!location.isActive)} />
        <SubmitButton pendingLabel="Updating…" className="accent-link text-xs font-semibold">
          {location.isActive ? "Deactivate location" : "Reactivate location"}
        </SubmitButton>
        {location.isActive && location._count.items > 0 ? (
          <span className="muted ml-2 text-xs">Existing records remain assigned here.</span>
        ) : null}
      </FeedbackForm>
      {/* Delete an unused room. */}
      <FeedbackForm action={deleteLocation} className="divider mt-4 border-t pt-4">
        <input type="hidden" name="id" value={location.id} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1">
            <span className="muted text-xs font-bold uppercase tracking-wide">
              Type DELETE to remove this location
            </span>
            <input
              required
              disabled={hasAssignedItems}
              name="confirmation"
              maxLength={16}
              className="field mt-2 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="DELETE"
              aria-label={`Type DELETE to remove ${location.name}`}
            />
          </label>
          <SubmitButton
            disabled={hasAssignedItems}
            pendingLabel="Deleting…"
            className="danger-button rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Delete location
          </SubmitButton>
        </div>
        <p className="muted mt-2 text-xs">
          {hasAssignedItems
            ? `This location has ${location._count.items} linked inventory record${location._count.items === 1 ? "" : "s"} and cannot be deleted yet.`
            : "Deletion is permanent and is only available while no inventory records are assigned here."}
        </p>
      </FeedbackForm>
    </details>
  );
}
