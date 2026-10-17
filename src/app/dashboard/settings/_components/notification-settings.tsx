import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";
import { notificationKinds } from "@/lib/notification-kinds";

import { saveNotificationSettings, sendTestEmail } from "../notification-actions";

export function NotificationSettings({
  email,
  notifyOn,
  mailReady,
}: {
  email: string;
  notifyOn: string[];
  mailReady: boolean;
}) {
  return (
    <section className="card rounded-lg p-5 sm:p-6">
      <p className="eyebrow">Email</p>
      <h2 className="mt-2 text-lg font-semibold">Email notifications</h2>
      <p className="muted mt-1 max-w-2xl text-sm leading-6">
        Pick what gets sent to <strong>{email}</strong>.
        {mailReady ? null : " Email isn't set up on the server yet, so nothing is sent for now."}
      </p>
      <FeedbackForm
        action={saveNotificationSettings}
        revision={notifyOn.join(",")}
        resetOnSuccess={false}
        successMessage="Email choices saved."
        className="mt-5 space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {notificationKinds.map((kind) => (
            <label key={kind.id} className="notify-option">
              <input
                type="checkbox"
                name="notifyOn"
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
