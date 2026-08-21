import Link from "next/link";
import { notFound } from "next/navigation";

import { ItemCondition, ItemStatus, ItemType } from "@prisma/client";

import {
  addComputerDetails,
  addComputerSoftware,
  deleteInventoryItemPhoto,
  deleteInventoryItem,
  removeComputerSoftware,
  retireInventoryItem,
  updateComputerDetails,
  updateComputerSoftware,
  updateInventoryItem,
  uploadInventoryItemPhoto,
} from "../actions";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { inventoryStatusClass, inventoryStatusLabel } from "@/lib/inventory-status";
import { canManageAdministration, canManageInventory, requireInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/prisma";

export const dynamic = "force-dynamic";

type ComputerInfo = {
  id: string;
  operatingSystem: string | null;
  osVersion: string | null;
  processor: string | null;
  graphics: string | null;
  memoryGb: number | null;
  storageGb: number | null;
  storageType: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  lastCheckedAt: Date | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function label(value: string) {
  return value.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function dateValue(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function displayDate(value?: Date | null) {
  return value ? value.toLocaleDateString() : "Not recorded";
}

function TextField({
  name,
  label: fieldLabel,
  value,
  type = "text",
  placeholder,
  required = false,
  maxLength,
  min,
  readOnly = false,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  readOnly?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{fieldLabel}</span>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        min={min}
        readOnly={readOnly}
        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function Detail({ label: detailLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="muted text-xs font-bold uppercase tracking-wide">{detailLabel}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{children}</dd>
    </div>
  );
}

function ComputerFields({ computer }: { computer?: ComputerInfo | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="operatingSystem" label="Operating system" value={computer?.operatingSystem} placeholder="Windows 11 Pro" maxLength={255} />
      <TextField name="osVersion" label="OS version" value={computer?.osVersion} placeholder="24H2" maxLength={255} />
      <TextField name="processor" label="Processor" value={computer?.processor} maxLength={255} />
      <TextField name="graphics" label="Graphics" value={computer?.graphics} maxLength={255} />
      <TextField name="memoryGb" label="Memory (GB)" type="number" value={computer?.memoryGb} min={0} />
      <TextField name="storageGb" label="Storage (GB)" type="number" value={computer?.storageGb} min={0} />
      <TextField name="storageType" label="Storage type" value={computer?.storageType} placeholder="NVMe SSD" maxLength={255} />
      <TextField name="macAddress" label="MAC address" value={computer?.macAddress} maxLength={255} />
      <TextField name="ipAddress" label="IP address" value={computer?.ipAddress} maxLength={255} />
    </div>
  );
}

function ComputerSummary({ computer }: { computer: ComputerInfo }) {
  return (
    <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Operating system">{[computer.operatingSystem, computer.osVersion].filter(Boolean).join(" ") || "Not recorded"}</Detail>
      <Detail label="Processor">{computer.processor ?? "Not recorded"}</Detail>
      <Detail label="Graphics">{computer.graphics ?? "Not recorded"}</Detail>
      <Detail label="Memory">{computer.memoryGb === null ? "Not recorded" : `${computer.memoryGb} GB`}</Detail>
      <Detail label="Storage">{computer.storageGb === null ? "Not recorded" : `${computer.storageGb} GB${computer.storageType ? ` · ${computer.storageType}` : ""}`}</Detail>
      <Detail label="MAC address">{computer.macAddress ?? "Not recorded"}</Detail>
      <Detail label="IP address">{computer.ipAddress ?? "Not recorded"}</Detail>
      <Detail label="Last checked">{displayDate(computer.lastCheckedAt)}</Detail>
    </dl>
  );
}

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInventoryAccess();
  const canManage = canManageInventory(user.role);
  const canDelete = canManageAdministration(user.role);
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const [item, categories, locations] = await Promise.all([
    prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        computer: { include: { software: { orderBy: { name: "asc" } } } },
        photos: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, byteSize: true, createdAt: true } },
        auditEvents: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!item) notFound();
  const computer = item.computer;
  const selectableCategories = categories.filter((category) => category.isActive || category.id === item.categoryId);
  const selectableLocations = locations.filter((location) => location.isActive || location.id === item.locationId);

  return (
    <div className="page">
      <div className="page-inner space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/dashboard/inventory" className="accent-link text-sm font-semibold">← Inventory</Link>
            <p className="eyebrow mt-5">Inventory record</p>
            <h1 className="title mt-3 text-3xl sm:text-4xl">{item.name}</h1>
            <p className="muted mt-2 text-sm">{item.assetTag ? `Asset tag: ${item.assetTag}` : `QR code: ${item.qrCode}`}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {canManage ? <Link href="#edit-record" className="primary-button rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Edit record</Link> : null}
            {canManage ? <Link href={`/dashboard/maintenance?item=${item.id}`} className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Report an issue</Link> : null}
            <Link href={`/dashboard/inventory/${item.id}/label`} className="card card-link rounded-lg px-4 py-2.5 text-center text-sm font-semibold">Print QR label</Link>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="order-2 space-y-6 xl:order-1">
            <article className="card rounded-lg p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Record summary</h2>
                <span className={`${inventoryStatusClass(item.status)} rounded-md px-2.5 py-1 text-xs font-semibold`}>{inventoryStatusLabel(item.status)}</span>
              </div>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row">
                {item.photos.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:w-44">
                    {item.photos.slice(0, 4).map((photo) => <img key={photo.id} src={`/dashboard/inventory/${item.id}/photos/${photo.id}`} alt={`Photo of ${item.name}`} className="h-20 w-full rounded-lg object-cover" loading="lazy" />)}
                  </div>
                ) : null}
                <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Category">{item.category.name}</Detail>
                  <Detail label="Location">{item.location.name}</Detail>
                  <Detail label="Condition">{label(item.condition)}</Detail>
                  <Detail label="Quantity">{item.quantity}</Detail>
                  <Detail label="Manufacturer / model">{[item.manufacturer, item.model].filter(Boolean).join(" ") || "Not recorded"}</Detail>
                  <Detail label="Serial number">{item.serialNumber ?? "Not recorded"}</Detail>
                  <Detail label="Purchased">{displayDate(item.purchaseDate)}</Detail>
                  <Detail label="Record type">{item.itemType === ItemType.ASSET ? "Tracked asset" : "Supply / stock"}</Detail>
                </dl>
              </div>
              {item.description ? <p className="divider mt-5 border-t pt-5 text-sm leading-6">{item.description}</p> : null}
              {item.notes ? <p className="muted mt-3 whitespace-pre-line text-sm leading-6">Notes: {item.notes}</p> : null}
            </article>

            {computer ? (
              <article className="card rounded-lg p-5 sm:p-6">
                <h2 className="text-lg font-semibold">PC hardware and software</h2>
                {canManage ? (
                  <FeedbackForm action={updateComputerDetails} className="mt-5 space-y-5">
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="computerId" value={computer.id} />
                    <ComputerFields computer={computer} />
                    <SubmitButton pendingLabel="Saving PC details…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Save PC details</SubmitButton>
                  </FeedbackForm>
                ) : <ComputerSummary computer={computer} />}

                <div className="divider mt-6 border-t pt-5">
                  <h3 className="text-sm font-semibold">Installed software</h3>
                  {computer.software.length ? (
                    <div className="mt-3 space-y-3">
                      {computer.software.map((software) => canManage ? (
                        <div key={software.id} className="card-muted rounded-lg p-3">
                          <FeedbackForm action={updateComputerSoftware} className="grid gap-3 sm:grid-cols-2">
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="computerId" value={computer.id} />
                            <input type="hidden" name="id" value={software.id} />
                            <input required name="name" defaultValue={software.name} maxLength={255} className="field rounded-lg px-3 py-2 text-sm" aria-label="Software name" />
                            <input name="version" defaultValue={software.version ?? ""} maxLength={255} className="field rounded-lg px-3 py-2 text-sm" aria-label="Software version" placeholder="Version" />
                            <input name="licenseKeyHint" defaultValue={software.licenseKeyHint ?? ""} maxLength={255} className="field rounded-lg px-3 py-2 text-sm" aria-label="License hint" placeholder="License hint" />
                            <label className="text-sm"><span className="sr-only">Installed date</span><input name="installedAt" type="date" defaultValue={dateValue(software.installedAt)} className="field w-full rounded-lg px-3 py-2" /></label>
                            <label className="text-sm"><span className="sr-only">License expiry date</span><input name="licenseExpiresAt" type="date" defaultValue={dateValue(software.licenseExpiresAt)} className="field w-full rounded-lg px-3 py-2" /></label>
                            <SubmitButton pendingLabel="Saving…" className="primary-button rounded-lg px-3 py-2 text-sm font-semibold">Save</SubmitButton>
                          </FeedbackForm>
                          <FeedbackForm action={removeComputerSoftware} className="mt-2">
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="computerId" value={computer.id} />
                            <input type="hidden" name="id" value={software.id} />
                            <SubmitButton pendingLabel="Removing…" className="accent-link text-xs font-semibold">Remove software</SubmitButton>
                          </FeedbackForm>
                        </div>
                      ) : (
                        <div key={software.id} className="card-muted rounded-md px-3 py-2 text-sm">
                          <span className="font-semibold">{software.name}</span>
                          {software.version ? <span className="muted"> · {software.version}</span> : null}
                          {software.licenseExpiresAt ? <span className="muted"> · License ends {displayDate(software.licenseExpiresAt)}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className="muted mt-2 text-sm">No software entries recorded yet.</p>}

                  {canManage ? (
                    <FeedbackForm action={addComputerSoftware} className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="computerId" value={computer.id} />
                      <input required name="name" maxLength={255} className="field rounded-lg px-3 py-2 text-sm" placeholder="Software name" aria-label="Software name" />
                      <input name="version" maxLength={255} className="field rounded-lg px-3 py-2 text-sm" placeholder="Version" aria-label="Software version" />
                      <input name="licenseKeyHint" maxLength={255} className="field rounded-lg px-3 py-2 text-sm" placeholder="License hint" aria-label="License hint" />
                      <label className="text-sm"><span className="sr-only">Installed date</span><input name="installedAt" type="date" className="field w-full rounded-lg px-3 py-2" /></label>
                      <label className="text-sm"><span className="sr-only">License expiry date</span><input name="licenseExpiresAt" type="date" className="field w-full rounded-lg px-3 py-2" /></label>
                      <SubmitButton pendingLabel="Adding…" className="primary-button rounded-lg px-4 py-2 text-sm font-semibold">Add software</SubmitButton>
                    </FeedbackForm>
                  ) : null}
                </div>
              </article>
            ) : canManage && item.itemType === ItemType.ASSET && item.quantity === 1 ? (
              <article className="card rounded-lg p-5 sm:p-6">
                <h2 className="text-lg font-semibold">Add PC details</h2>
                <p className="muted mt-2 text-sm">Create a PC record for this single tracked asset.</p>
                <FeedbackForm action={addComputerDetails} className="mt-5 space-y-5">
                  <input type="hidden" name="itemId" value={item.id} />
                  <ComputerFields />
                  <SubmitButton pendingLabel="Adding PC record…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Add PC record</SubmitButton>
                </FeedbackForm>
              </article>
            ) : null}

            <article className="card rounded-lg p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Recent activity</h2>
              {item.auditEvents.length ? (
                <ol className="mt-4 space-y-3">
                  {item.auditEvents.map((event) => (
                    <li key={event.id} className="divider border-l pl-4 text-sm">
                      <p className="font-semibold">{event.summary}</p>
                      <p className="muted mt-1 text-xs">{event.actorName ?? "System"} · {event.createdAt.toLocaleString()}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted mt-3 text-sm">No activity has been recorded yet.</p>}
            </article>
          </div>

          {canManage ? (
            <aside id="edit-record" className="card order-1 h-fit scroll-mt-6 rounded-lg p-5 sm:p-6 xl:sticky xl:top-6 xl:order-2">
              <h2 className="text-lg font-semibold">Update record</h2>
              <p className="muted mt-2 text-sm leading-6">Visible first on smaller screens so a room check or QR scan can be updated without hunting through the record.</p>
              <FeedbackForm action={updateInventoryItem} className="mt-5 space-y-4">
                <input type="hidden" name="id" value={item.id} />
                <TextField name="name" label="Name" value={item.name} required maxLength={255} />
                <TextField name="assetTag" label="Asset tag" value={item.assetTag} maxLength={255} />
                <label>
                  <span className="text-sm font-semibold">Category</span>
                  <select name="categoryId" defaultValue={item.categoryId} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                    {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " (current, inactive)"}</option>)}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold">Location</span>
                  <select name="locationId" defaultValue={item.locationId} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                    {selectableLocations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.isActive ? "" : " (current, inactive)"}</option>)}
                  </select>
                </label>
                {computer ? (
                  <div><span className="text-sm font-semibold">Record type</span><p className="muted mt-2 text-sm">Tracked asset (locked while PC details exist)</p><input type="hidden" name="itemType" value={ItemType.ASSET} /></div>
                ) : (
                  <label>
                    <span className="text-sm font-semibold">Record type</span>
                    <select name="itemType" defaultValue={item.itemType} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
                      {Object.values(ItemType).map((value) => <option key={value} value={value}>{value === ItemType.ASSET ? "Tracked asset" : "Supply / stock"}</option>)}
                    </select>
                  </label>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <label><span className="text-sm font-semibold">Status</span><select name="status" defaultValue={item.status} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{Object.values(ItemStatus).map((value) => <option key={value} value={value}>{inventoryStatusLabel(value)}</option>)}</select></label>
                  <label><span className="text-sm font-semibold">Condition</span><select name="condition" defaultValue={item.condition} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{Object.values(ItemCondition).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
                </div>
                <div className="grid gap-4">
                  <TextField name="quantity" label="Quantity" type="number" value={item.quantity} min={0} readOnly={Boolean(computer)} />
                </div>
                <TextField name="manufacturer" label="Manufacturer" value={item.manufacturer} maxLength={255} />
                <TextField name="model" label="Model" value={item.model} maxLength={255} />
                <TextField name="serialNumber" label="Serial number" value={item.serialNumber} maxLength={255} />
                <TextField name="purchaseDate" label="Purchase date" value={dateValue(item.purchaseDate)} type="date" />
                <label className="block"><span className="text-sm font-semibold">Description</span><textarea name="description" rows={3} defaultValue={item.description ?? ""} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
                <label className="block"><span className="text-sm font-semibold">Notes</span><textarea name="notes" rows={3} defaultValue={item.notes ?? ""} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
                <SubmitButton pendingLabel="Saving update…" className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold">Save update</SubmitButton>
              </FeedbackForm>

              <section className="divider mt-6 border-t pt-5" aria-labelledby="item-photos-heading">
                <h3 id="item-photos-heading" className="text-sm font-semibold">Item photos</h3>
                <p className="muted mt-2 text-xs leading-5">Photos are stored in the PostgreSQL inventory database. Add up to four JPEG, PNG, or WebP images, 3 MB each.</p>
                <FeedbackForm action={uploadInventoryItemPhoto} successMessage="Photo added." className="mt-4 space-y-3">
                  <input type="hidden" name="itemId" value={item.id} />
                  <label className="block"><span className="sr-only">Choose item photo</span><input required name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field w-full rounded-lg px-3 py-2 text-sm" /></label>
                  <SubmitButton pendingLabel="Uploading…" className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold">Add photo</SubmitButton>
                </FeedbackForm>
                {item.photos.length ? <div className="mt-4 space-y-2">{item.photos.map((photo) => <div key={photo.id} className="card-muted flex items-center gap-3 rounded-lg p-2"><img src={`/dashboard/inventory/${item.id}/photos/${photo.id}`} alt="" className="h-12 w-12 rounded-md object-cover" loading="lazy" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{photo.fileName}</p><p className="muted mt-0.5 text-xs">{Math.ceil(photo.byteSize / 1024)} KB · {displayDate(photo.createdAt)}</p></div><FeedbackForm action={deleteInventoryItemPhoto}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="photoId" value={photo.id} /><SubmitButton pendingLabel="Removing…" className="accent-link px-2 py-1 text-xs font-semibold">Remove</SubmitButton></FeedbackForm></div>)}</div> : null}
              </section>

              <section className="divider mt-6 border-t pt-5" aria-labelledby="record-lifecycle">
                <h3 id="record-lifecycle" className="text-sm font-semibold">Record lifecycle</h3>
                <p className="muted mt-2 text-xs leading-5">Retiring is reversible and keeps the PC, software, and activity history available.</p>
                <FeedbackForm action={retireInventoryItem} className="mt-3">
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton disabled={item.status === ItemStatus.RETIRED} pendingLabel="Retiring…" className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold">{item.status === ItemStatus.RETIRED ? "Item is retired" : "Retire item"}</SubmitButton>
                </FeedbackForm>

                {canDelete ? (
                  <details className="danger-zone mt-4 rounded-lg p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Permanently remove this item</summary>
                    <p className="mt-2 text-xs leading-5">This also permanently deletes the attached PC, photos, software, and activity history. Type <strong>DELETE</strong> to continue.</p>
                    <FeedbackForm action={deleteInventoryItem} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={item.id} />
                      <input required name="confirmation" maxLength={16} className="field w-full rounded-lg px-3 py-2 text-sm" placeholder="Type DELETE" aria-label="Type DELETE to permanently remove this item" />
                      <SubmitButton pendingLabel="Removing…" className="danger-button rounded-lg px-3 py-2 text-sm font-semibold">Permanently delete</SubmitButton>
                    </FeedbackForm>
                  </details>
                ) : null}
              </section>
            </aside>
          ) : <aside className="notice order-1 h-fit rounded-lg px-5 py-4 text-sm xl:order-2">You have read-only access to this item.</aside>}
        </div>
      </div>
    </div>
  );
}
