"use client";

import type { FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inventoryQrCodeFromScan } from "@/lib/qr-code";

export function codeFromScan(value: string, trustedQrOrigin?: string) {
  return inventoryQrCodeFromScan(value, window.location.origin, trustedQrOrigin);
}

export function QrScanner({ trustedQrOrigin }: { trustedQrOrigin?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const [message, setMessage] = useState("Camera is off.");
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");

  function stopCamera(updateState = true) {
    attemptRef.current += 1;
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateState && mountedRef.current) {
      setIsScanning(false);
      setIsStarting(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera(false);
    };
  }, []);

  function openRecord(value: string) {
    const code = codeFromScan(value, trustedQrOrigin);
    if (!code) {
      setMessage("Not a CEIT inventory QR code. Type the code under the QR instead.");
      return;
    }
    stopCamera();
    setMessage("Item found. Opening...");
    router.push(`/scan/${encodeURIComponent(code)}`);
  }

  async function startCamera() {
    if (isStarting || isScanning || !navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("No camera available. Type the code instead.");
      }
      return;
    }

    const attempt = ++attemptRef.current;
    setIsStarting(true);
    setMessage("Starting camera...");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      // the reader loads lazily, bail if the scan was stopped or we navigated away meanwhile
      if (attempt !== attemptRef.current || !mountedRef.current || !videoRef.current) {
        return;
      }
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 250,
        delayBetweenScanSuccess: 750,
      });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _error, activeControls) => {
          if (attempt !== attemptRef.current) {
            activeControls.stop();
            return;
          }
          if (result) {
            openRecord(result.getText());
          }
        },
      );

      if (attempt !== attemptRef.current || !mountedRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setMessage("Point the camera at a QR code.");
      setIsScanning(true);
    } catch {
      if (attempt === attemptRef.current && mountedRef.current) {
        stopCamera();
        setMessage("Couldn't start the camera. Type the code instead.");
      }
    } finally {
      if (attempt === attemptRef.current && mountedRef.current) {
        setIsStarting(false);
      }
    }
  }

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openRecord(manualCode);
  }

  return (
    <section className="card scanner-card rounded-lg p-5 sm:p-7">
      <div
        data-scanning={isScanning}
        className="scanner-preview relative overflow-hidden rounded-lg bg-black"
      >
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="QR code scanner camera preview"
          className="scanner-video w-full object-cover"
        />
        <div className="scanner-corners pointer-events-none absolute" aria-hidden="true" />
        {!isScanning && !isStarting ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
            <div className="scanner-empty-state">
              <ScanLine className="mx-auto h-7 w-7" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">Camera preview</p>
              <p className="mt-1 text-xs leading-5">Scan an equipment label.</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="scanner-side">
        <ol className="scanner-steps">
          <li>
            <span aria-hidden="true">1</span> Turn on the camera.
          </li>
          <li>
            <span aria-hidden="true">2</span> Hold the label inside the frame.
          </li>
          <li>
            <span aria-hidden="true">3</span> It opens automatically.
          </li>
        </ol>
        <p id="scanner-status" className="scanner-status muted text-sm leading-6" role="status">
          {message}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={
              isScanning
                ? () => {
                    stopCamera();
                    setMessage("Camera is off.");
                  }
                : startCamera
            }
            disabled={isStarting}
            className={`${isScanning ? "secondary-button" : "primary-button"} rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60`}
          >
            {isStarting ? "Starting camera..." : isScanning ? "Stop camera" : "Use camera"}
          </button>
        </div>
        <div className="divider mt-6 border-t pt-5">
          <h2 className="text-sm font-semibold">Manual lookup</h2>
          <p className="muted mt-1 text-sm leading-6">No camera? Type the code under the QR.</p>
          <form onSubmit={submitManualCode} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="manual-qr-code">
              QR code
            </label>
            <input
              id="manual-qr-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              required
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="scanner-status"
              maxLength={2048}
              className="field min-w-0 flex-1 rounded-lg px-3 py-2.5 font-mono text-sm"
              placeholder="QR code"
            />
            <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">
              Open item
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
