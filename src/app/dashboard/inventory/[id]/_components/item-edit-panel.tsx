import type { Category, Location } from "@prisma/client";
import { humanizeEnum } from "@/lib/labels";
import { ItemCondition, ItemStatus, ItemType } from "@prisma/client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { inventoryStatusLabel } from "@/lib/inventory-status";

import {
  markInventoryItemChecked,
  splitGroupedAsset,
  updateInventoryItem,
} from "../../actions/item";
import { TextField, dateValue, displayDate, manilaDateValue } from "./item-fields";
import type { ItemRecord } from "./item-record";
import { PhotoManager } from "./photo-manager";
import { RecordLifecycle } from "./record-lifecycle";

// The collapsible staff panel: edit form, inspection, photos, and record lifecycle.
export function ItemEditPanel({
  item,
  categories,
  locations,
  open,
}: {
  item: ItemRecord;
  categories: Category[];
  locations: Location[];
  open: boolean;
}) {
  const computer = item.computer;
  const selectableCategories = categories.filter(
    (category) => category.isActive || category.id === item.categoryId,
  );
  const selectableLocations = locations.filter(
    (location) => location.isActive || location.id === item.locationId,
  );

  return (
    <details
      id="edit-record"
      open={open}
      className="section-disclosure card h-fit scroll-mt-6 rounded-lg p-5 sm:p-6"
    >
      {/* Staff editing controls. */}
      <summary className="cursor-pointer text-lg font-semibold">Edit record</summary>
      {/* Save the main inventory details. */}
      <FeedbackForm
        action={updateInventoryItem}
        resetOnSuccess={false}
        revision={item.updatedAt.toISOString()}
        savedValues={{
          status: item.status,
          condition: item.condition,
          categoryId: item.categoryId,
          locationId: item.locationId,
          itemType: item.itemType,
        }}
        optimistic={{
          entity: `item:${item.id}`,
          fields: {
            name: "name",
            status: "status",
            condition: "condition",
            location: "locationId",
            quantity: "quantity",
          },
        }}
        className="mt-5 space-y-4"
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="updatedAt" value={item.updatedAt.toISOString()} />
        <TextField name="name" label="Name" value={item.name} required maxLength={255} />
        <TextField name="assetTag" label="Asset tag" value={item.assetTag} maxLength={255} />
        <label>
          <span className="text-sm font-semibold">Category</span>
          <select
            name="categoryId"
            defaultValue={item.categoryId}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          >
            {selectableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? "" : " (current, inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Location</span>
          <select
            name="locationId"
            defaultValue={item.locationId}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          >
            {selectableLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.isActive ? "" : " (current, inactive)"}
              </option>
            ))}
          </select>
        </label>
        {computer ? (
          <div>
            <span className="text-sm font-semibold">Record type</span>
            <p className="muted mt-2 text-sm">Tracked asset (locked while PC details exist)</p>
            <input type="hidden" name="itemType" value={ItemType.ASSET} />
            <input type="hidden" name="isComputer" value="on" />
          </div>
        ) : (
          <>
            <label>
              <span className="text-sm font-semibold">Record type</span>
              <select
                name="itemType"
                defaultValue={item.itemType}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {Object.values(ItemType).map((value) => (
                  <option key={value} value={value}>
                    {value === ItemType.ASSET ? "Tracked asset" : "Supply / stock"}
                  </option>
                ))}
              </select>
            </label>
            {item.itemType === ItemType.ASSET ? (
              <label className="card-muted flex items-start gap-3 rounded-lg p-3 text-sm font-semibold">
                <input
                  name="isComputer"
                  type="checkbox"
                  defaultChecked={item.isComputer}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  This tracked asset is a PC
                  <span className="muted mt-1 block text-xs font-normal leading-5">
                    Only PC-designated single tracked assets can have hardware and software details.
                  </span>
                </span>
              </label>
            ) : (
              <p className="muted text-xs leading-5">
                Supply records cannot be designated as PCs. Change the record type to a tracked
                asset first.
              </p>
            )}
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <label>
            <span className="text-sm font-semibold">Status</span>
            <select
              name="status"
              defaultValue={item.status}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              {Object.values(ItemStatus)
                .filter(
                  (value) => value !== ItemStatus.RETIRED || item.status === ItemStatus.RETIRED,
                )
                .map((value) => (
                  <option key={value} value={value}>
                    {inventoryStatusLabel(value)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Condition</span>
            <select
              name="condition"
              defaultValue={item.condition}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              {Object.values(ItemCondition).map((value) => (
                <option key={value} value={value}>
                  {humanizeEnum(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4">
          <TextField
            name="quantity"
            label="Quantity"
            type="number"
            value={item.quantity}
            min={0}
            readOnly={Boolean(computer)}
          />
        </div>
        <TextField
          name="manufacturer"
          label="Manufacturer"
          value={item.manufacturer}
          maxLength={255}
        />
        <TextField name="model" label="Model" value={item.model} maxLength={255} />
        <TextField
          name="serialNumber"
          label="Serial number"
          value={item.serialNumber}
          maxLength={255}
        />
        <TextField
          name="purchaseDate"
          label="Purchase date"
          value={dateValue(item.purchaseDate)}
          type="date"
        />
        <TextField
          name="lastCheckedAt"
          label="Last checked"
          value={manilaDateValue(item.lastCheckedAt)}
          type="date"
        />
        <div>
          <TextField
            name="purchasePrice"
            label="Purchase price (PHP)"
            value={item.purchasePrice?.toString()}
            type="number"
            min={0}
            max={99_999_999.99}
            step={0.01}
          />
          <p className="muted mt-1 text-xs leading-5">
            Optional total paid for this record. It stays off the inventory list and is included in
            the acquisition report.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Description</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={item.description ?? ""}
            maxLength={5_000}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Notes</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={item.notes ?? ""}
            maxLength={5_000}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
          />
        </label>
        <SubmitButton
          pendingLabel="Saving update…"
          className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Save update
        </SubmitButton>
      </FeedbackForm>

      {/* Record the latest inspection. */}
      <section className="divider mt-6 border-t pt-5" aria-labelledby="inspection-heading">
        <h3 id="inspection-heading" className="text-sm font-semibold">
          Inspection
        </h3>
        <p className="muted mt-2 text-xs leading-5">
          Last checked: {displayDate(item.lastCheckedAt)}. This records a dated inspection for every
          item and updates the PC profile when one exists.
        </p>
        <FeedbackForm
          action={markInventoryItemChecked}
          successMessage="Inspection recorded."
          className="mt-3"
        >
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton
            pendingLabel="Recording…"
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Mark checked today
          </SubmitButton>
        </FeedbackForm>
      </section>

      {item.itemType === ItemType.ASSET && item.quantity > 1 && !item.isComputer ? (
        <section className="divider mt-6 border-t pt-5" aria-labelledby="individualize-heading">
          {/* Split grouped equipment into individual records. */}
          <h3 id="individualize-heading" className="text-sm font-semibold">
            Create individual asset records
          </h3>
          <p className="muted mt-2 text-xs leading-5">
            This converts the current record into unit 1 and creates {item.quantity - 1} new records
            in the same room. Every new unit gets the next compatible asset tag and a unique QR
            code; move the units to their actual rooms afterward. This is unavailable once a
            borrowing history exists.
          </p>
          <FeedbackForm action={splitGroupedAsset} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={item.id} />
            <input
              required
              name="confirmation"
              maxLength={16}
              className="field w-full rounded-lg px-3 py-2 text-sm"
              placeholder="Type SPLIT"
              aria-label="Type SPLIT to create individual asset records"
            />
            <SubmitButton
              pendingLabel="Creating individual records…"
              className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Split into {item.quantity} individual assets
            </SubmitButton>
          </FeedbackForm>
        </section>
      ) : null}

      <PhotoManager item={item} />

      <RecordLifecycle item={item} />
    </details>
  );
}
