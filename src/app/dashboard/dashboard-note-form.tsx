"use client";

import { FeedbackForm } from "@/app/components/feedback-form";
import { SubmitButton } from "@/app/components/submit-button";

import { saveDashboardNote } from "./actions";

const maximumDashboardNoteLength = 5_000;

type DashboardNoteFormProps = {
  initialContent: string;
  updatedByName?: string | null;
};

export function DashboardNoteForm({ initialContent, updatedByName }: DashboardNoteFormProps) {
  return (
    <FeedbackForm action={saveDashboardNote} className="mt-4 flex flex-1 flex-col">
      <label className="flex flex-1">
        <span className="sr-only">Department note</span>
        <textarea
          name="content"
          defaultValue={initialContent}
          maxLength={maximumDashboardNoteLength}
          rows={10}
          className="field h-full min-h-[19rem] w-full resize-y rounded-lg px-3 py-2.5 text-sm leading-6"
          placeholder="Add a note here"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="muted text-xs">{updatedByName ? `Last saved by ${updatedByName}.` : null}</p>
        <SubmitButton pendingLabel="Saving note…" className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Save note</SubmitButton>
      </div>
    </FeedbackForm>
  );
}
