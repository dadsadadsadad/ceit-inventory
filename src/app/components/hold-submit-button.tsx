"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { useFormStatus } from "react-dom";
import { Check, Trash2 } from "lucide-react";
import { SubmitButton } from "./submit-button";

const holdDuration = 1100;

// Holding arms the action; releasing inside the button submits it. A normal
// click opens an untimed confirmation for keyboard, touch, and assistive input.
export function HoldSubmitButton({
  label = "Delete item",
  pendingLabel = "Deleting…",
  confirmation,
}: {
  label?: string;
  pendingLabel?: string;
  confirmation: string;
}) {
  const { pending } = useFormStatus();
  const [phase, setPhase] = useState<"idle" | "holding" | "ready">("idle");
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const frame = useRef<number | null>(null);
  const gesture = useRef<{ id: number; started: number } | null>(null);
  const suppressClick = useRef(false);
  const submitting = useRef(false);
  const previousPending = useRef(false);
  const helpId = useId();
  const panelId = useId();

  const stop = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    gesture.current = null;
    buttonRef.current?.style.setProperty("--hold-progress", "0");
    setPhase("idle");
  }, []);

  useEffect(() => {
    function cancel() {
      suppressClick.current = true;
      stop();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancel();
        setConfirming(false);
        if (buttonRef.current?.parentElement?.contains(document.activeElement)) {
          buttonRef.current.focus({ preventScroll: true });
        }
      }
    }
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
      document.removeEventListener("keydown", escape);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    };
  }, [stop]);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus({ preventScroll: true });
    }
  }, [confirming]);

  useEffect(() => {
    // A failed server action can be retried, but never duplicated while pending.
    if (previousPending.current && !pending) {
      submitting.current = false;
    }
    previousPending.current = pending;
  }, [pending]);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || pending || submitting.current) {
      return;
    }
    suppressClick.current = false;
    setConfirming(false);
    gesture.current = { id: event.pointerId, started: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPhase("holding");
    function tick() {
      if (!gesture.current) {
        return;
      }
      const progress = Math.min(1, (performance.now() - gesture.current.started) / holdDuration);
      buttonRef.current?.style.setProperty("--hold-progress", String(progress));
      if (progress === 1) {
        setPhase("ready");
        frame.current = null;
      } else {
        frame.current = requestAnimationFrame(tick);
      }
    }
    frame.current = requestAnimationFrame(tick);
  }

  function inside(event: PointerEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.id !== event.pointerId) {
      return;
    }
    const ready = performance.now() - gesture.current.started >= holdDuration && inside(event);
    // Short taps open the ordinary confirmation. A long/cancelled gesture never
    // falls through to a second click action after pointerup.
    suppressClick.current = ready || !inside(event);
    stop();
    if (ready && !pending && !submitting.current) {
      const form = event.currentTarget.form;
      if (form?.reportValidity()) {
        submitting.current = true;
        form.requestSubmit();
      }
    }
  }

  return (
    <div className="hold-action">
      <button
        ref={buttonRef}
        type="button"
        className="danger-button hold-button"
        data-phase={phase}
        aria-label={label}
        aria-describedby={helpId}
        aria-expanded={confirming}
        aria-controls={panelId}
        aria-busy={pending || undefined}
        disabled={pending}
        onPointerDown={start}
        onPointerUp={release}
        onPointerMove={(event) => {
          if (gesture.current && !inside(event)) {
            suppressClick.current = true;
            stop();
          }
        }}
        onPointerCancel={() => {
          suppressClick.current = true;
          stop();
        }}
        onLostPointerCapture={stop}
        onBlur={stop}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            suppressClick.current = false;
          }
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (!pending && !submitting.current) {
            setConfirming(true);
          }
        }}
      >
        <span className="hold-fill" aria-hidden="true" />
        <span className="hold-sizing" aria-hidden="true">
          {[label, pendingLabel, "Keep holding…", "Release to confirm"].map((text, index) => (
            <span key={index}>{text}</span>
          ))}
        </span>
        <span className="hold-label">
          {pending ? (
            <span className="submit-spinner" aria-hidden="true" />
          ) : phase === "ready" ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Trash2 size={17} aria-hidden="true" />
          )}
          {pending
            ? pendingLabel
            : phase === "ready"
              ? "Release to confirm"
              : phase === "holding"
                ? "Keep holding…"
                : label}
        </span>
      </button>
      <p id={helpId} className="muted hold-hint">
        Hold and release, or click to confirm.
      </p>
      <span className="sr-only" role="status">
        {phase === "ready"
          ? "Ready. Release inside the button to confirm, or move away to cancel."
          : ""}
      </span>
      {confirming ? (
        <div id={panelId} className="hold-confirmation" role="group" aria-label="Confirm removal">
          <p>{confirmation}</p>
          <div className="hold-confirmation-actions">
            <SubmitButton ref={confirmRef} pendingLabel={pendingLabel} className="danger-button">
              Confirm removal
            </SubmitButton>
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                buttonRef.current?.focus({ preventScroll: true });
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
