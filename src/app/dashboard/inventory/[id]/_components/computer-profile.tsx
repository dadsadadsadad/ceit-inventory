import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { canHaveComputerDetails } from "@/lib/inventory-pc";

import {
  addComputerDetails,
  addComputerSoftware,
  removeComputerSoftware,
  updateComputerDetails,
  updateComputerSoftware,
} from "../../actions/computer";
import { Detail, TextField, dateValue, displayDate } from "./item-fields";
import type { ItemRecord } from "./item-record";

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
  hardwareDescription: string | null;
  softwareDescription: string | null;
  lastCheckedAt: Date | null;
};

// Shared hardware and software input fields.
export function ComputerFields({ computer }: { computer?: ComputerInfo | null }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="operatingSystem"
          label="Operating system"
          value={computer?.operatingSystem}
          placeholder="Windows 11 Pro"
          maxLength={255}
        />
        <TextField
          name="osVersion"
          label="OS version"
          value={computer?.osVersion}
          placeholder="24H2"
          maxLength={255}
        />
        <TextField name="processor" label="Processor" value={computer?.processor} maxLength={255} />
        <TextField name="graphics" label="Graphics" value={computer?.graphics} maxLength={255} />
        <TextField
          name="memoryGb"
          label="Memory (GB)"
          type="number"
          value={computer?.memoryGb}
          min={0}
        />
        <TextField
          name="storageGb"
          label="Storage (GB)"
          type="number"
          value={computer?.storageGb}
          min={0}
        />
        <TextField
          name="storageType"
          label="Storage type"
          value={computer?.storageType}
          placeholder="NVMe SSD"
          maxLength={255}
        />
        <TextField
          name="macAddress"
          label="MAC address"
          value={computer?.macAddress}
          maxLength={255}
        />
        <TextField
          name="ipAddress"
          label="IP address"
          value={computer?.ipAddress}
          maxLength={255}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-semibold">Hardware description</span>
          <textarea
            name="hardwareDescription"
            rows={4}
            defaultValue={computer?.hardwareDescription ?? ""}
            maxLength={5_000}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Installed components, display, and attached hardware."
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Software description</span>
          <textarea
            name="softwareDescription"
            rows={4}
            defaultValue={computer?.softwareDescription ?? ""}
            maxLength={5_000}
            className="field mt-2 w-full rounded-lg px-3 py-2.5 text-sm"
            placeholder="Special applications, configuration, and license notes."
          />
        </label>
      </div>
    </div>
  );
}

// Read-only computer specifications.
function ComputerSummary({ computer }: { computer: ComputerInfo }) {
  return (
    <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Operating system">
        {[computer.operatingSystem, computer.osVersion].filter(Boolean).join(" ") || "Not recorded"}
      </Detail>
      <Detail label="Processor">{computer.processor ?? "Not recorded"}</Detail>
      <Detail label="Graphics">{computer.graphics ?? "Not recorded"}</Detail>
      <Detail label="Memory">
        {computer.memoryGb === null ? "Not recorded" : `${computer.memoryGb} GB`}
      </Detail>
      <Detail label="Storage">
        {computer.storageGb === null
          ? "Not recorded"
          : `${computer.storageGb} GB${computer.storageType ? ` · ${computer.storageType}` : ""}`}
      </Detail>
      <Detail label="MAC address">{computer.macAddress ?? "Not recorded"}</Detail>
      <Detail label="IP address">{computer.ipAddress ?? "Not recorded"}</Detail>
      <Detail label="Last checked">{displayDate(computer.lastCheckedAt)}</Detail>
      {computer.hardwareDescription ? (
        <Detail label="Hardware description">{computer.hardwareDescription}</Detail>
      ) : null}
      {computer.softwareDescription ? (
        <Detail label="Software description">{computer.softwareDescription}</Detail>
      ) : null}
    </dl>
  );
}

// Hardware, installed software, and the forms to edit them.
export function ComputerSection({ item, canManage }: { item: ItemRecord; canManage: boolean }) {
  const computer = item.computer;

  return (
    <>
      {computer ? (
        <article className="card rounded-lg p-5 sm:p-6">
          {/* Computer profile and installed software. */}
          <h2 className="text-lg font-semibold">PC hardware and software</h2>
          <ComputerSummary computer={computer} />
          {canManage ? (
            <details className="section-disclosure mt-5">
              <summary className="accent-link cursor-pointer text-sm font-semibold">
                Edit PC details
              </summary>
              <FeedbackForm
                resetOnSuccess={false}
                action={updateComputerDetails}
                revision={computer.updatedAt.toISOString()}
                className="mt-5 space-y-5"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="computerId" value={computer.id} />
                <ComputerFields computer={computer} />
                <SubmitButton
                  pendingLabel="Saving PC details…"
                  className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  Save PC details
                </SubmitButton>
              </FeedbackForm>
            </details>
          ) : null}

          <div className="divider mt-6 border-t pt-5">
            <h3 className="text-sm font-semibold">Installed software</h3>
            {computer.software.length ? (
              <div className="mt-3 space-y-3">
                {computer.software.map((software) =>
                  canManage ? (
                    <details
                      key={software.id}
                      className="section-disclosure card-muted rounded-lg p-3"
                    >
                      <summary className="cursor-pointer text-sm">
                        <strong>{software.name}</strong>
                        {software.version ? (
                          <span className="muted"> · {software.version}</span>
                        ) : null}
                        {software.licenseExpiresAt ? (
                          <span className="muted">
                            {" "}
                            · License ends {displayDate(software.licenseExpiresAt)}
                          </span>
                        ) : null}
                      </summary>
                      {/* Edit this installed application. */}
                      <FeedbackForm
                        resetOnSuccess={false}
                        action={updateComputerSoftware}
                        revision={software.updatedAt.toISOString()}
                        className="mt-4 grid gap-3 sm:grid-cols-2"
                      >
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="computerId" value={computer.id} />
                        <input type="hidden" name="id" value={software.id} />
                        <input
                          required
                          name="name"
                          defaultValue={software.name}
                          maxLength={255}
                          className="field rounded-lg px-3 py-2 text-sm"
                          aria-label="Software name"
                        />
                        <input
                          name="version"
                          defaultValue={software.version ?? ""}
                          maxLength={255}
                          className="field rounded-lg px-3 py-2 text-sm"
                          aria-label="Software version"
                          placeholder="Version"
                        />
                        <input
                          name="licenseKeyHint"
                          defaultValue={software.licenseKeyHint ?? ""}
                          maxLength={255}
                          className="field rounded-lg px-3 py-2 text-sm"
                          aria-label="License hint"
                          placeholder="License hint"
                        />
                        <label className="text-sm">
                          <span className="sr-only">Installed date</span>
                          <input
                            name="installedAt"
                            type="date"
                            defaultValue={dateValue(software.installedAt)}
                            className="field w-full rounded-lg px-3 py-2"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="sr-only">License expiry date</span>
                          <input
                            name="licenseExpiresAt"
                            type="date"
                            defaultValue={dateValue(software.licenseExpiresAt)}
                            className="field w-full rounded-lg px-3 py-2"
                          />
                        </label>
                        <SubmitButton
                          pendingLabel="Saving…"
                          className="primary-button rounded-lg px-3 py-2 text-sm font-semibold"
                        >
                          Save software
                        </SubmitButton>
                      </FeedbackForm>
                      {/* Remove this application from the record. */}
                      <FeedbackForm action={removeComputerSoftware} className="mt-2">
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="computerId" value={computer.id} />
                        <input type="hidden" name="id" value={software.id} />
                        <SubmitButton
                          pendingLabel="Removing…"
                          className="accent-link text-xs font-semibold"
                        >
                          Remove software
                        </SubmitButton>
                      </FeedbackForm>
                    </details>
                  ) : (
                    <div key={software.id} className="card-muted rounded-md px-3 py-2 text-sm">
                      <span className="font-semibold">{software.name}</span>
                      {software.version ? (
                        <span className="muted"> · {software.version}</span>
                      ) : null}
                      {software.licenseExpiresAt ? (
                        <span className="muted">
                          {" "}
                          · License ends {displayDate(software.licenseExpiresAt)}
                        </span>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="muted mt-2 text-sm">No software entries recorded yet.</p>
            )}

            {canManage ? (
              <details className="section-disclosure mt-4">
                <summary className="accent-link cursor-pointer text-sm font-semibold">
                  Add software
                </summary>
                <FeedbackForm
                  action={addComputerSoftware}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  {/* Add another installed application. */}
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="computerId" value={computer.id} />
                  <input
                    required
                    name="name"
                    maxLength={255}
                    className="field rounded-lg px-3 py-2 text-sm"
                    placeholder="Software name"
                    aria-label="Software name"
                  />
                  <input
                    name="version"
                    maxLength={255}
                    className="field rounded-lg px-3 py-2 text-sm"
                    placeholder="Version"
                    aria-label="Software version"
                  />
                  <input
                    name="licenseKeyHint"
                    maxLength={255}
                    className="field rounded-lg px-3 py-2 text-sm"
                    placeholder="License hint"
                    aria-label="License hint"
                  />
                  <label className="text-sm">
                    <span className="sr-only">Installed date</span>
                    <input
                      name="installedAt"
                      type="date"
                      className="field w-full rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="sr-only">License expiry date</span>
                    <input
                      name="licenseExpiresAt"
                      type="date"
                      className="field w-full rounded-lg px-3 py-2"
                    />
                  </label>
                  <SubmitButton
                    pendingLabel="Adding…"
                    className="primary-button rounded-lg px-4 py-2 text-sm font-semibold"
                  >
                    Add software
                  </SubmitButton>
                </FeedbackForm>
              </details>
            ) : null}
          </div>
        </article>
      ) : canManage && canHaveComputerDetails(item) ? (
        <details className="section-disclosure card rounded-lg p-5 sm:p-6">
          {/* Create the item's computer profile. */}
          <summary className="cursor-pointer text-lg font-semibold">Add PC details</summary>
          <p className="muted mt-2 text-sm">Create a PC record for this single tracked asset.</p>
          <FeedbackForm action={addComputerDetails} className="mt-5 space-y-5">
            <input type="hidden" name="itemId" value={item.id} />
            <ComputerFields />
            <SubmitButton
              pendingLabel="Adding PC record…"
              className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Add PC record
            </SubmitButton>
          </FeedbackForm>
        </details>
      ) : null}
    </>
  );
}
