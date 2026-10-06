import { humanizeEnum } from "@/lib/labels";
import { OptimisticStatus, OptimisticText } from "@/app/components/optimistic-state";
import { ItemPhotoGallery } from "@/app/components/item-photo-gallery";
import { StockBadge, WarrantyBadge } from "@/app/components/stock-badge";
import {
  customFieldsFor,
  formatCustomValue,
  readCustomValues,
  type CustomFieldDefinition,
} from "@/lib/custom-fields";
import { warrantyState, warrantyStateLabel } from "@/lib/warranty";
import { ItemType } from "@prisma/client";

import { Detail, displayDate, displayPurchasePrice } from "./item-fields";
import type { ItemRecord } from "./item-record";

// The record summary card: photos, key facts, description, and notes.
export function ItemSummary({
  customFields,
  item,
}: {
  customFields: CustomFieldDefinition[];
  item: ItemRecord;
}) {
  const extraValues = readCustomValues(item.customFields);
  const extraFields = customFieldsFor(customFields, item).filter(
    (field) => formatCustomValue(field, extraValues[field.id]) !== null,
  );
  const warranty = warrantyState(item.warrantyEndsAt);
  return (
    <>
      {/* Item details and photo preview. */}
      <article className="card rounded-lg p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Record summary</h2>
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge item={item} showCount />
            <WarrantyBadge endsAt={item.warrantyEndsAt} />
            <OptimisticStatus entity={`item:${item.id}`} value={item.status} />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row">
          {item.photos.length ? (
            <ItemPhotoGallery
              itemId={item.id}
              itemName={item.name}
              photos={item.photos.map((photo) => ({
                id: photo.id,
                fileName: photo.fileName,
              }))}
            />
          ) : null}
          <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Category">{item.category.name}</Detail>
            <Detail label="Location">
              <OptimisticText entity={`item:${item.id}`} field="location">
                {item.location.name}
              </OptimisticText>
            </Detail>
            <Detail label="Condition">
              <OptimisticText entity={`item:${item.id}`} field="condition">
                {humanizeEnum(item.condition)}
              </OptimisticText>
            </Detail>
            <Detail label="Quantity">
              <OptimisticText entity={`item:${item.id}`} field="quantity">
                {item.quantity}
              </OptimisticText>
            </Detail>
            <Detail label="Manufacturer / model">
              {[item.manufacturer, item.model].filter(Boolean).join(" ") || "Not recorded"}
            </Detail>
            <Detail label="Serial number">{item.serialNumber ?? "Not recorded"}</Detail>
            <Detail label="Purchased">{displayDate(item.purchaseDate)}</Detail>
            <Detail label="Warranty">
              {item.warrantyEndsAt
                ? `${displayDate(item.warrantyEndsAt)} · ${warrantyStateLabel(warranty).toLowerCase()}`
                : "Not recorded"}
            </Detail>
            <Detail label="Last checked">{displayDate(item.lastCheckedAt)}</Detail>
            {item.purchasePrice !== null ? (
              <Detail label="Acquisition value">{displayPurchasePrice(item.purchasePrice)}</Detail>
            ) : null}
            <Detail label="Record type">
              {item.itemType === ItemType.ASSET
                ? "Equipment · its own QR code"
                : "Stock · one QR code for all"}
            </Detail>
            {extraFields.map((field) => (
              <Detail key={field.id} label={field.label}>
                {formatCustomValue(field, extraValues[field.id])}
              </Detail>
            ))}
          </dl>
        </div>
        {item.description ? (
          <p className="divider mt-5 border-t pt-5 text-sm leading-6">{item.description}</p>
        ) : null}
        {item.notes ? (
          <p className="muted mt-3 whitespace-pre-line text-sm leading-6">Notes: {item.notes}</p>
        ) : null}
        {item.itemType === ItemType.ASSET && item.quantity > 1 ? (
          <p className="notice mt-5 rounded-lg px-4 py-3 text-sm leading-6">
            Legacy grouped asset: this record represents {item.quantity} units but has one current
            tag and QR code. New equipment is always created as one physical unit per record, so
            give each existing unit its own record before moving it to a different room.
          </p>
        ) : null}
      </article>
    </>
  );
}
