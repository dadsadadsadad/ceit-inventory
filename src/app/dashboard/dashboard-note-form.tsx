"use client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { saveDashboardNote } from "./actions";

const maxDashboardNoteLength = 5_000;

type DashboardNoteFormProps = {
  initialContent: string;
  updatedByName?: string | null;
};

export function DashboardNoteForm({ initialContent, updatedByName }: DashboardNoteFormProps) {
  return (
    <FeedbackForm
      resetOnSuccess={false}
      action={saveDashboardNote}
      revision={initialContent}
      className="mt-4 flex flex-1 flex-col"
    >
      <div className="flex flex-1">
        <label htmlFor="department-note" className="sr-only">
          Department note
        </label>
        <textarea
          id="department-note"
          name="content"
          defaultValue={initialContent}
          maxLength={maxDashboardNoteLength}
          rows={5}
          className="field h-full min-h-[10rem] w-full resize-y rounded-lg px-3 py-2.5 text-sm leading-6"
          placeholder="Write a note for the team"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-xs">{updatedByName ? `Last saved by ${updatedByName}.` : null}</p>
        <SubmitButton
          pendingLabel="Saving note..."
          className="secondary-button rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Save note
        </SubmitButton>
      </div>
    </FeedbackForm>
  );
}
