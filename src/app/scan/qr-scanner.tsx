"use client";

import type { FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inventoryLabelAppOrigin } from "@/lib/inventory-label-url";
import { inventoryQrCodeFromScan } from "@/lib/qr-code";

function codeFromScan(value: string) {
  const configuredOrigin = inventoryLabelAppOrigin(process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL);
  return inventoryQrCodeFromScan(value, window.location.origin, configuredOrigin);
}

export function QrScanner() {
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
    } catch {
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (updateState && mountedRef.current) {
      setIsScanning(false);
      setIsStarting(false);
    }
  }

  useEffect(() => () => {
    mountedRef.current = false;
    stopCamera(false);
  }, []);

  function openRecord(value: string) {
    const code = codeFromScan(value);
    if (!code) {
      setMessage("This is not a CEIT inventory QR code. Enter the code printed under the QR image instead.");
      return;
    }
    stopCamera();
    router.push(`/scan/${encodeURIComponent(code)}`);
  }

  async function startCamera() {
    if (isStarting || isScanning || !navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      if (!navigator.mediaDevices?.getUserMedia) setMessage("Camera access is unavailable on this device. Use the printed code instead.");
      return;
    }

    const attempt = ++attemptRef.current;
    setIsStarting(true);
    setMessage("Starting camera…");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 750 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _error, activeControls) => {
          if (attempt !== attemptRef.current) {
            activeControls.stop();
            return;
          }
          if (result) openRecord(result.getText());
        },
      );

      if (attempt !== attemptRef.current || !mountedRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setMessage("Point the camera at a CEIT inventory QR code.");
      setIsScanning(true);
    } catch {
      if (attempt === attemptRef.current && mountedRef.current) {
        stopCamera();
        setMessage("Camera permission was not granted or the camera could not start. You can enter the QR code manually.");
      }
    } finally {
      if (attempt === attemptRef.current && mountedRef.current) setIsStarting(false);
    }
  }

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openRecord(manualCode);
  }

  return (
    <section className="card rounded-lg p-5 sm:p-7">
      <div className="scanner-preview relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} muted playsInline aria-label="QR code scanner camera preview" className="aspect-[4/5] w-full object-cover sm:aspect-[3/4]" />
        <div className="scanner-corners pointer-events-none absolute inset-7 rounded-2xl" aria-hidden="true" />
        {!isScanning && !isStarting ? <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"><div className="scanner-empty-state"><ScanLine className="mx-auto h-7 w-7" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">Camera preview</p><p className="mt-1 text-xs leading-5">Tap Use camera to scan a CEIT QR code.</p></div></div> : null}
      </div>
      <p className="muted mt-4 text-sm leading-6" aria-live="polite">{message}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={isScanning ? () => stopCamera() : startCamera} disabled={isStarting} className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">
          {isStarting ? "Starting camera…" : isScanning ? "Stop camera" : "Use camera"}
        </button>
      </div>
      <div className="divider mt-6 border-t pt-5">
        <h2 className="text-sm font-semibold">Manual lookup</h2>
        <form onSubmit={submitManualCode} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="manual-qr-code">QR code</label>
          <input id="manual-qr-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} maxLength={128} className="field min-w-0 flex-1 rounded-lg px-3 py-2.5 font-mono text-sm" placeholder="Paste or type QR code" />
          <button className="primary-button rounded-lg px-4 py-2.5 text-sm font-semibold">Open item</button>
        </form>
      </div>
    </section>
  );
}
