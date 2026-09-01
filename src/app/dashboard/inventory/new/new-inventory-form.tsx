"use client";

import { useState } from "react";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { createInventoryItem } from "../actions";

type SetupOption = { id: string; name: string };
type LocationOption = SetupOption & { nextPcNumber: number };
type InputFieldProps = { label: string; max?: number; maxValue?: number; min?: number; name: string; placeholder?: string; required?: boolean; step?: number; type?: string };

const statusOptions = ["OK", "WORKING", "DEPLOYED", "DEFECTIVE", "NOT_TESTED", "RETIRED", "LOST"];
const conditionOptions = ["EXCELLENT", "GOOD", "FAIR", "POOR", "FOR_REPAIR"];

function readable(value: string) {
  return value.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function InputField({ label, max = 255, maxValue, min, name, placeholder, required = false, step, type = "text" }: InputFieldProps) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}{required ? " *" : ""}</span>
      <input name={name} required={required} max={maxValue} maxLength={max} min={min} step={step} type={type} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder={placeholder} />
    </label>
  );
}

export function NewInventoryForm({ categories, locations }: { categories: SetupOption[]; locations: LocationOption[] }) {
  const [isComputer, setIsComputer] = useState(false);
  const [itemType, setItemType] = useState("ASSET");
  const [itemName, setItemName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const isSupply = itemType === "SUPPLY";
  const selectedLocation = locations.find((location) => location.id === locationId);
  const suggestedPcName = selectedLocation ? `${selectedLocation.name}-PC-${String(selectedLocation.nextPcNumber).padStart(2, "0")}` : "";

  function updateComputerSelection(nextValue: boolean) {
    setIsComputer(nextValue);
    if (nextValue && suggestedPcName) setItemName(suggestedPcName);
  }

  function updateLocation(nextLocationId: string) {
    setLocationId(nextLocationId);
    if (!isComputer) return;
    const location = locations.find((entry) => entry.id === nextLocationId);
    if (location) setItemName(`${location.name}-PC-${String(location.nextPcNumber).padStart(2, "0")}`);
  }

  return (
    <FeedbackForm action={createInventoryItem} className="card space-y-7 rounded-lg p-5 sm:p-7">
      <section>
        <div><p className="eyebrow">Identity</p><h2 className="mt-2 text-lg font-semibold">What are you adding?</h2></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label><span className="text-sm font-semibold">Item name *</span><input required name="name" value={itemName} onChange={(event) => setItemName(event.target.value)} maxLength={255} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder={isComputer ? "Select a room to suggest Room-PC-01" : "Dell OptiPlex 7010"} /></label>
          <div><InputField name="assetTag" label="Asset tag" placeholder="Leave blank to generate" /><p className="muted mt-1 text-xs leading-5">Tracked equipment automatically receives the next compatible <code>INV-CAT-ST-ROOM-0001</code> tag and a unique QR label.</p></div>
          <label>
            <span className="text-sm font-semibold">Category *</span>
            <select required name="categoryId" className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
          <label>
            <span className="text-sm font-semibold">Location *</span>
            <select required name="locationId" value={locationId} onChange={(event) => updateLocation(event.target.value)} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"><option value="">Choose a room or area</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
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
            <input name="quantity" type="number" min="0" max="1000000" value={isSupply ? quantity : "1"} onChange={(event) => setQuantity(event.target.value)} disabled={!isSupply} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-60" />
            {isSupply ? <span className="muted mt-1 block text-xs">Supplies may use a shared stock quantity.</span> : <span className="muted mt-1 block text-xs">Each equipment asset is one physical unit with its own tag and QR.</span>}
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
          <div>
            <InputField name="purchasePrice" label="Purchase price (PHP)" type="number" min={0} maxValue={99_999_999.99} step={0.01} placeholder="e.g. 35000.00" />
            <p className="muted mt-1 text-xs leading-5">Optional total paid for this inventory record. It is visible only in the record details and acquisition report.</p>
          </div>
        </div>
      </section>

      <section className="divider border-t pt-6">
        <label className="flex items-center gap-3 text-sm font-semibold"><input name="isComputer" type="checkbox" checked={isComputer} onChange={(event) => updateComputerSelection(event.target.checked)} disabled={isSupply} className="h-4 w-4" /> This tracked asset is a PC or Mac</label>
        {isSupply ? <p className="muted mt-2 text-sm">Supply records cannot include a PC or Mac hardware profile.</p> : null}
        {isComputer ? (
          <div className="card-muted mt-4 rounded-lg p-4">
            <p className="text-sm font-semibold">Initial PC hardware</p>
            <p className="muted mt-1 text-xs">PC and Mac details stay on this record only. The room-based name suggestion remains editable.</p>
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-semibold">Hardware description</span><textarea name="hardwareDescription" rows={3} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Chassis, display, peripherals, or other hardware configuration." /></label><label><span className="text-sm font-semibold">Software description</span><textarea name="softwareDescription" rows={3} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" placeholder="Operating environment, special applications, or licensing notes." /></label></div>
          </div>
        ) : null}
      </section>

      <section className="divider grid gap-4 border-t pt-6 sm:grid-cols-2"><label><span className="text-sm font-semibold">Last checked</span><input name="lastCheckedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /><span className="muted mt-1 block text-xs">This inspection date is recorded for every item, including supplies.</span></label><label className="block"><span className="text-sm font-semibold">Notes</span><textarea name="notes" rows={3} maxLength={5_000} className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm" /></label></section>
      <SubmitButton pendingLabel="Creating item…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Create item</SubmitButton>
    </FeedbackForm>
  );
}
