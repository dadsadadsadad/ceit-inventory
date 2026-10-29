import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { deliveryChoices, deliveryOf, eventKinds, summaryKinds } from "@/lib/notification-kinds";

import { saveNotificationSettings, sendTestEmail } from "../notification-actions";
import { SummaryScheduleFields } from "./summary-schedule-fields";

type Props = {
  email: string;
  mailReady: boolean;
  notifyLater: string[];
  notifyOn: string[];
  summaryDay: number;
  summaryFrequency: string;
  summaryTime: string;
};

export function NotificationSettings({
  email,
  mailReady,
  notifyLater,
  notifyOn,
  summaryDay,
  summaryFrequency,
  summaryTime,
}: Props) {
  return (
    <section className="card rounded-lg p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Email notifications</h2>
      <p className="muted mt-1 max-w-2xl text-sm leading-6">
        Pick what gets sent to <strong>{email}</strong>, and when.
        {mailReady ? null : " Email isn't set up on the server yet, so nothing is sent for now."}
      </p>
      <FeedbackForm
        action={saveNotificationSettings}
        revision={[
          notifyOn.join(","),
          notifyLater.join(","),
          summaryFrequency,
          summaryDay,
          summaryTime,
        ].join("|")}
        resetOnSuccess={false}
        successMessage="Email choices saved."
        className="mt-5 space-y-6"
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">When something happens</legend>
          <p className="muted text-sm leading-6">
            Get each one right away, save it for your summary email, or turn it off.
          </p>
          <div className="notify-rows">
            {eventKinds.map((kind) => (
              <div key={kind.id} className="notify-row">
                <span>
                  <strong>{kind.label}</strong>
                  <small className="muted">{kind.description}</small>
                </span>
                <select
                  name={`deliver-${kind.id}`}
                  defaultValue={deliveryOf(kind.id, notifyOn, notifyLater)}
                  className="field rounded-lg px-3 py-2 text-sm"
                  aria-label={`${kind.label}: when to email`}
                >
                  {deliveryChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Summary email</legend>
          <p className="muted text-sm leading-6">
            One email that lists what needs doing. It is skipped when there is nothing to report.
          </p>
          <SummaryScheduleFields day={summaryDay} frequency={summaryFrequency} time={summaryTime} />
          <p className="text-sm font-semibold">What it lists</p>
          <div className="grid gap-3 md:grid-cols-3">
            {summaryKinds.map((kind) => (
              <label key={kind.id} className="notify-option">
                <input
                  type="checkbox"
                  name="summaryInclude"
                  value={kind.id}
                  defaultChecked={notifyOn.includes(kind.id)}
                />
                <span>
                  <strong>{kind.label}</strong>
                  <small className="muted">{kind.description}</small>
                </span>
              </label>
            ))}
          </div>
          <p className="muted text-xs leading-5">
            Anything set to &quot;In my summary&quot; above is listed too. Weekly summaries cover
            the past 7 days and what is due in the next 7.
          </p>
        </fieldset>

        <SubmitButton
          pendingLabel="Saving..."
          className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Save email choices
        </SubmitButton>
      </FeedbackForm>
      {mailReady ? (
        <FeedbackForm action={sendTestEmail} successMessage="Test email sent." className="mt-3">
          <SubmitButton
            pendingLabel="Sending..."
            className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Send me a test email
          </SubmitButton>
        </FeedbackForm>
      ) : null}
    </section>
  );
}
