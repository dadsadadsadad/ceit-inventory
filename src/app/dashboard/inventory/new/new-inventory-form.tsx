"use client";

import { useState } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { createInventoryItem } from "../actions";

type SetupOption = { id: string; name: string };
type InputFieldProps = { label: string; max?: number; name: string; placeholder?: string; required?: boolean; type?: string };

const statusOptions = ["OK", "WORKING", "DEPLOYED", "DEFECTIVE", "NOT_TESTED", "RETIRED", "LOST"];
const conditionOptions = ["EXCELLENT", "GOOD", "FAIR", "POOR", "FOR_REPAIR"];

function readable(value: string) {
  return value.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function InputField({ label, max = 255, name, placeholder, required = false, type = "text" }: InputFieldProps) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}{required ? " *" : ""}</span>
      <input name={name} required={required} maxLength={max} type={type} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder={placeholder} />
    </label>
  );
}

export function NewInventoryForm({ categories, locations }: { categories: SetupOption[]; locations: SetupOption[] }) {
  const [isComputer, setIsComputer] = useState(false);
  const [itemType, setItemType] = useState("ASSET");
  const isSupply = itemType === "SUPPLY";

  return (
    <FeedbackForm action={createInventoryItem} className="card space-y-7 rounded-lg p-5 sm:p-7">
      <section>
        <div><p className="eyebrow">Identity</p><h2 className="mt-2 text-lg font-semibold">What are you adding?</h2></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InputField name="name" label="Item name" required placeholder="Dell OptiPlex 7010" />
          <InputField name="assetTag" label="Asset tag" placeholder="CEIT-PC-001" />
          <label>
            <span className="text-sm font-semibold">Category *</span>
            <select required name="categoryId" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
          <label>
            <span className="text-sm font-semibold">Location *</span>
            <select required name="locationId" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="">Choose a room or area</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          </label>
          <label>
            <span className="text-sm font-semibold">Record type</span>
            <select name="itemType" value={itemType} onChange={(event) => { setItemType(event.target.value); if (event.target.value === "SUPPLY") setIsComputer(false); }} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">
              <option value="ASSET">Tracked asset</option>
              <option value="SUPPLY">Supply / stock</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Quantity</span>
            <input name="quantity" type="number" min="0" max="1000000" defaultValue="1" disabled={isComputer} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-60" />
            {isComputer ? <span className="muted mt-1 block text-xs">PC assets are recorded one per label.</span> : null}
          </label>
          <label><span className="text-sm font-semibold">Status</span><select name="status" defaultValue="OK" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{statusOptions.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
          <label><span className="text-sm font-semibold">Condition</span><select name="condition" defaultValue="GOOD" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm">{conditionOptions.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
        </div>
        <label className="mt-4 block"><span className="text-sm font-semibold">Description</span><textarea name="description" rows={3} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="What it is used for, included accessories, or other helpful details." /></label>
      </section>

      <section className="divider border-t pt-6">
        <p className="eyebrow">Details</p>
        <h2 className="mt-2 text-lg font-semibold">Manufacturer and lifecycle</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <InputField name="manufacturer" label="Manufacturer" />
          <InputField name="model" label="Model" />
          <InputField name="serialNumber" label="Serial number" />
          <InputField name="purchaseDate" label="Purchase date" type="date" />
          <InputField name="warrantyEndsAt" label="Warranty end" type="date" />
          <InputField name="imageUrl" label="Photo URL" type="url" max={2_000} placeholder="https://…" />
        </div>
      </section>

      <section className="divider border-t pt-6">
        <label className="flex items-center gap-3 text-sm font-semibold"><input name="isComputer" type="checkbox" checked={isComputer} onChange={(event) => setIsComputer(event.target.checked)} disabled={isSupply} className="h-4 w-4" /> This tracked asset is a PC</label>
        {isSupply ? <p className="muted mt-2 text-sm">Supply records cannot include a PC hardware profile.</p> : null}
        {isComputer ? (
          <div className="card-muted mt-4 rounded-lg p-4">
            <p className="text-sm font-semibold">Initial PC hardware</p>
            <p className="muted mt-1 text-xs">You can return later to add or update these details.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InputField name="operatingSystem" label="Operating system" placeholder="Windows 11 Pro" />
              <InputField name="osVersion" label="OS version" placeholder="24H2" />
              <InputField name="processor" label="Processor" />
              <InputField name="graphics" label="Graphics" />
              <label><span className="text-sm font-semibold">Memory (GB)</span><input name="memoryGb" type="number" min="0" max="16384" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
              <label><span className="text-sm font-semibold">Storage (GB)</span><input name="storageGb" type="number" min="0" max="1000000" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label>
              <InputField name="storageType" label="Storage type" placeholder="NVMe SSD" />
              <InputField name="macAddress" label="MAC address" />
              <InputField name="ipAddress" label="IP address" />
            </div>
          </div>
        ) : null}
      </section>

      <section className="divider border-t pt-6"><label className="block"><span className="text-sm font-semibold">Notes</span><textarea name="notes" rows={3} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label></section>
      <SubmitButton pendingLabel="Creating item…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Create item</SubmitButton>
    </FeedbackForm>
  );
}
