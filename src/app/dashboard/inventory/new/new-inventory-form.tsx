"use client";

import { useState } from "react";

import { CustomFieldInputs } from "@/app/components/custom-field-inputs";
import { FeedbackForm } from "@/app/components/feedback-form";
import { FormSection } from "@/app/components/form-section";
import { NewExtraField } from "@/app/components/new-extra-field";
import { SubmitButton } from "@/app/components/submit-button";
import { customFieldsFor, type CustomFieldDefinition } from "@/lib/custom-fields";
import { defaultLowStockThreshold } from "@/lib/stock-level";
import { manilaCalendarDate } from "@/lib/manila-date";

import { createInventoryItem } from "../actions/item";

type SetupOption = { id: string; name: string };
type LocationOption = SetupOption & { nextPcNumber: number };
type InputFieldProps = {
  hint?: string;
  label: string;
  max?: number;
  maxValue?: number;
  min?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  step?: number;
  type?: string;
};

const statusOptions = ["OK", "WORKING", "DEPLOYED", "DEFECTIVE", "NOT_TESTED", "RETIRED", "LOST"];
const conditionOptions = ["EXCELLENT", "GOOD", "FAIR", "POOR", "FOR_REPAIR"];

function readable(value: string) {
  if (value === "OK") {
    return "OK";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

// Shared label and input for the new-item form.
function InputField({
  hint,
  label,
  max = 255,
  maxValue,
  min,
  name,
  placeholder,
  required = false,
  step,
  type = "text",
}: InputFieldProps) {
  return (
    <label>
      <span className="text-sm font-semibold">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        required={required}
        max={maxValue}
        maxLength={max}
        min={min}
        step={step}
        type={type}
        className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
        placeholder={placeholder}
      />
      {hint ? <span className="muted mt-1 block text-xs leading-5">{hint}</span> : null}
    </label>
  );
}

// Equipment or stock, then only the fields that matter for it. Everything else is optional.
export function NewInventoryForm({
  categories,
  customFields,
  locations,
}: {
  categories: SetupOption[];
  customFields: CustomFieldDefinition[];
  locations: LocationOption[];
}) {
  const [isComputer, setIsComputer] = useState(false);
  const [itemType, setItemType] = useState<"ASSET" | "SUPPLY">("ASSET");
  const [itemName, setItemName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [units, setUnits] = useState("1");
  const isStock = itemType === "SUPPLY";
  const severalUnits = !isStock && Number(units) > 1;
  const selectedLocation = locations.find((location) => location.id === locationId);
  const suggestedPcName = selectedLocation
    ? `${selectedLocation.name}-PC-${String(selectedLocation.nextPcNumber).padStart(2, "0")}`
    : "";
  const extraFields = customFieldsFor(customFields, { categoryId: categoryId || null, itemType });

  // Suggest a PC name when a computer profile is enabled.
  function updateComputerSelection(nextValue: boolean) {
    setIsComputer(nextValue);
    if (nextValue) {
      setUnits("1");
      if (suggestedPcName) {
        setItemName(suggestedPcName);
      }
    }
  }

  // Update the selected room and suggest its next PC name.
  function updateLocation(nextLocationId: string) {
    setLocationId(nextLocationId);
    if (!isComputer) {
      return;
    }
    const location = locations.find((entry) => entry.id === nextLocationId);
    if (location) {
      setItemName(`${location.name}-PC-${String(location.nextPcNumber).padStart(2, "0")}`);
    }
  }

  return (
    <FeedbackForm
      action={createInventoryItem}
      createPreview={{ titleField: "name", detailFields: ["locationId", "categoryId"] }}
      className="card space-y-6 rounded-lg p-5 sm:p-7"
    >
      {/* The few things every record needs. */}
      <section aria-labelledby="new-item-essentials">
        <p className="eyebrow">The basics</p>
        <h2 id="new-item-essentials" className="mt-2 text-lg font-semibold">
          What are you adding?
        </h2>
        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Kind of record</legend>
          {[
            {
              value: "ASSET",
              title: "Equipment",
              text: "Each unit gets its own asset tag and QR code, such as a PC, projector, or monitor.",
            },
            {
              value: "SUPPLY",
              title: "Stock",
              text: "Supplies counted by quantity, such as cables or markers. One QR code covers the whole stock.",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={`choice-option items-start ${itemType === option.value ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="itemType"
                value={option.value}
                checked={itemType === option.value}
                onChange={() => {
                  setItemType(option.value as "ASSET" | "SUPPLY");
                  if (option.value === "SUPPLY") {
                    setIsComputer(false);
                    setUnits("1");
                  }
                }}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block font-semibold">{option.title}</span>
                <span className="muted mt-1 block text-sm font-normal leading-5">
                  {option.text}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold">Name *</span>
            <input
              required
              name="name"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              maxLength={255}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              placeholder={
                isComputer
                  ? "Choose a room to suggest Room-PC-01"
                  : isStock
                    ? "HDMI cable"
                    : "Dell OptiPlex 7010"
              }
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Category *</span>
            <select
              required
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Room *</span>
            <select
              required
              name="locationId"
              value={locationId}
              onChange={(event) => updateLocation(event.target.value)}
              className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="">Choose a room or area</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {isStock ? (
            <>
              <label>
                <span className="text-sm font-semibold">How many do you have? *</span>
                <input
                  required
                  name="quantity"
                  type="number"
                  min="0"
                  max="1000000"
                  inputMode="numeric"
                  defaultValue="0"
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="text-sm font-semibold">Warn me when it falls to</span>
                <input
                  name="lowStockThreshold"
                  type="number"
                  min="0"
                  max="1000000"
                  inputMode="numeric"
                  placeholder={String(defaultLowStockThreshold)}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
                <span className="muted mt-1 block text-xs leading-5">
                  Leave blank to use {defaultLowStockThreshold}.
                </span>
              </label>
            </>
          ) : (
            <>
              <label>
                <span className="text-sm font-semibold">How many units?</span>
                <input
                  name="units"
                  type="number"
                  min="1"
                  max="50"
                  inputMode="numeric"
                  value={units}
                  disabled={isComputer}
                  onChange={(event) => setUnits(event.target.value)}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-60"
                />
                <span className="muted mt-1 block text-xs leading-5">
                  {severalUnits
                    ? `Creates ${units} separate records, numbered #1 to #${units}, each with its own tag and QR code.`
                    : "Each unit gets its own asset tag and QR code."}
                </span>
              </label>
              <label className="flex items-start gap-3 self-end rounded-lg pb-3 text-sm font-semibold">
                <input
                  name="isComputer"
                  type="checkbox"
                  checked={isComputer}
                  onChange={(event) => updateComputerSelection(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  This is a PC or Mac
                  <span className="muted mt-1 block text-xs font-normal leading-5">
                    Adds fields for its hardware and software.
                  </span>
                </span>
              </label>
            </>
          )}
        </div>
      </section>

      <div className="space-y-3">
        <FormSection
          title="More details"
          hint="Tag, status, condition, model, serial number, notes"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {!isStock && !severalUnits ? (
              <InputField
                name="assetTag"
                label="Asset tag"
                placeholder="Leave blank to generate"
                hint="Looks like INV-CAT-ST-ROOM-0001."
              />
            ) : null}
            <label>
              <span className="text-sm font-semibold">Status</span>
              <select
                name="status"
                defaultValue="OK"
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {statusOptions.map((value) => (
                  <option key={value} value={value}>
                    {readable(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold">Condition</span>
              <select
                name="condition"
                defaultValue="GOOD"
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              >
                {conditionOptions.map((value) => (
                  <option key={value} value={value}>
                    {readable(value)}
                  </option>
                ))}
              </select>
            </label>
            <InputField name="manufacturer" label="Manufacturer" />
            <InputField name="model" label="Model" />
            {!severalUnits ? <InputField name="serialNumber" label="Serial number" /> : null}
            <label>
              <span className="text-sm font-semibold">Last checked</span>
              <input
                name="lastCheckedAt"
                type="date"
                defaultValue={manilaCalendarDate()}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold">Description</span>
              <textarea
                name="description"
                rows={2}
                maxLength={5_000}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                placeholder="What it is used for or what comes with it."
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold">Notes</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={5_000}
                className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        </FormSection>

        <FormSection title="Purchase and warranty" hint="Date, price, and when the warranty ends">
          <div className="grid gap-4 sm:grid-cols-3">
            <InputField name="purchaseDate" label="Purchase date" type="date" />
            <InputField
              name="purchasePrice"
              label="Price (PHP)"
              type="number"
              min={0}
              maxValue={99_999_999.99}
              step={0.01}
              placeholder="35000.00"
            />
            <InputField name="warrantyEndsAt" label="Warranty ends" type="date" />
          </div>
          <p className="muted mt-3 text-xs leading-5">
            The price is only visible in the record and the reports. A warranty date lets CEIT see
            what is about to run out.
          </p>
        </FormSection>

        {isComputer ? (
          <FormSection
            title="PC hardware and software"
            defaultOpen
            hint="Specs and network details"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                name="operatingSystem"
                label="Operating system"
                placeholder="Windows 11 Pro"
              />
              <InputField name="osVersion" label="OS version" placeholder="24H2" />
              <InputField name="processor" label="Processor" />
              <InputField name="graphics" label="Graphics" />
              <label>
                <span className="text-sm font-semibold">Memory (GB)</span>
                <input
                  name="memoryGb"
                  type="number"
                  min="0"
                  max="16384"
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              <label>
                <span className="text-sm font-semibold">Storage (GB)</span>
                <input
                  name="storageGb"
                  type="number"
                  min="0"
                  max="1000000"
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              <InputField name="storageType" label="Storage type" placeholder="NVMe SSD" />
              <InputField name="macAddress" label="MAC address" />
              <InputField name="ipAddress" label="IP address" />
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold">Hardware description</span>
                <textarea
                  name="hardwareDescription"
                  rows={2}
                  maxLength={5_000}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold">Software description</span>
                <textarea
                  name="softwareDescription"
                  rows={2}
                  maxLength={5_000}
                  className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <p className="muted mt-3 text-xs leading-5">
              Installed programs are added on the record after it is created.
            </p>
          </FormSection>
        ) : null}

        <FormSection
          title="Extra details"
          hint={
            extraFields.length
              ? "Fields your department added, or add a new one"
              : "Record something that is not here yet"
          }
        >
          {extraFields.length ? <CustomFieldInputs fields={extraFields} /> : null}
          <NewExtraField />
        </FormSection>
      </div>

      <SubmitButton
        pendingLabel={severalUnits ? `Creating ${units} items…` : "Creating item…"}
        className="primary-button rounded-lg px-5 py-2.5 text-sm font-semibold"
      >
        {severalUnits ? `Create ${units} items` : isStock ? "Create stock record" : "Create item"}
      </SubmitButton>
    </FeedbackForm>
  );
}
