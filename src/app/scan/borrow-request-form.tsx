"use client";

import { useState } from "react";
import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { manilaDateTimeInput } from "@/lib/borrow-schedule";
import { submitBorrowRequest } from "./borrow-actions";

type BorrowRequestFormProps = { itemName: string; maximumQuantity: number; qrCode: string };
const field = "field mt-2 w-full rounded-lg px-3 py-2.5 text-sm";

// Collect an immediate loan or a future reservation.
export function BorrowRequestForm({ itemName, maximumQuantity, qrCode }: BorrowRequestFormProps) {
  const [when, setWhen] = useState("now");
  const [pickup, setPickup] = useState("");
  const maximum = Math.min(Math.max(Math.trunc(maximumQuantity), 1), 1_000);
  return (
    <FeedbackForm action={submitBorrowRequest} className="card request-form rounded-lg p-5 sm:p-7">
      {/* Link this request to the scanned item. */}
      <input type="hidden" name="qrCode" value={qrCode} />
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="borrow-website">Leave this field blank</label>
        <input id="borrow-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <h2 className="text-xl font-semibold">Borrow {itemName}</h2>
      <p className="muted mt-2 text-sm leading-6">
        Borrow today or reserve a time later. Wait for staff confirmation before collecting the
        equipment.
      </p>
      {/* Choose borrowing now or reserving for later. */}
      <fieldset className="mt-6">
        <legend className="text-sm font-semibold">When do you need it?</legend>
        <div className="choice-group mt-2 grid grid-cols-2 gap-2">
          <label className={"choice-option " + (when === "now" ? "is-selected" : "")}>
            <input
              type="radio"
              name="borrowWhen"
              value="now"
              checked={when === "now"}
              onChange={() => setWhen("now")}
            />
            <span>Borrow now</span>
          </label>
          <label className={"choice-option " + (when === "later" ? "is-selected" : "")}>
            <input
              type="radio"
              name="borrowWhen"
              value="later"
              checked={when === "later"}
              onChange={() => setWhen("later")}
            />
            <span>Reserve for later</span>
          </label>
        </div>
      </fieldset>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {when === "later" ? (
          <label>
            <span className="text-sm font-semibold">Pickup date and time *</span>
            <input
              name="startsAt"
              type="datetime-local"
              required
              min={manilaDateTimeInput()}
              value={pickup}
              onChange={(event) => setPickup(event.target.value)}
              className={field}
            />
          </label>
        ) : null}
        <label>
          <span className="text-sm font-semibold">Return date and time *</span>
          <input
            name="expectedReturnDate"
            type="datetime-local"
            required
            min={when === "later" && pickup ? pickup : manilaDateTimeInput()}
            className={field}
          />
        </label>
      </div>
      <p className="muted mt-2 text-xs leading-5">
        All times are Philippine time. Availability is checked for the full borrowing period when
        you submit.
      </p>
      {/* Borrower details and requested dates. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-semibold">Full name *</span>
          <input
            name="borrowerName"
            required
            minLength={2}
            autoComplete="name"
            maxLength={120}
            className={field}
            placeholder="Your full name"
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Student number *</span>
          <input
            name="studentNumber"
            required
            minLength={3}
            autoComplete="off"
            maxLength={64}
            className={field}
            placeholder="e.g. 2024-00001"
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Contact number *</span>
          <input
            name="contact"
            required
            type="tel"
            autoComplete="tel"
            minLength={7}
            maxLength={32}
            className={field}
            placeholder="09XX XXX XXXX"
          />
        </label>
        {maximum === 1 ? (
          <div>
            <input type="hidden" name="requestedQuantity" value="1" />
            <span className="text-sm font-semibold">Quantity</span>
            <p className="muted mt-2 text-sm">1 item</p>
          </div>
        ) : (
          <label>
            <span className="text-sm font-semibold">Quantity *</span>
            <input
              name="requestedQuantity"
              required
              type="number"
              inputMode="numeric"
              min="1"
              max={maximum}
              defaultValue="1"
              className={field}
            />
          </label>
        )}
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">Purpose *</span>
        <textarea
          name="purpose"
          required
          rows={3}
          minLength={5}
          maxLength={1_000}
          className={field}
          placeholder="e.g. Projector for our class presentation"
        />
      </label>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="muted text-xs leading-5">Staff will use your contact number to follow up.</p>
        <SubmitButton
          pendingLabel="Sending…"
          className="primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold sm:w-auto"
        >
          {when === "later" ? "Request reservation" : "Send borrowing request"}
        </SubmitButton>
      </div>
    </FeedbackForm>
  );
}
