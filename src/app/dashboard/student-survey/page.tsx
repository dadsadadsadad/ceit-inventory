import Image from "next/image";
import { ExternalLink } from "lucide-react";
import QRCode from "qrcode";

const studentSurveyUrl =
  "https://docs.google.com/forms/d/e/1FAIpQLSdCtjAAb8GNvZ_TkLB86k-g1bSySctIS-U6NIiItlZqrqoFZA/viewform";

export default async function StudentSurveyPage() {
  const qrDataUrl = await QRCode.toDataURL(studentSurveyUrl, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 640,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div className="page">
      <div className="page-narrow space-y-6">
        <header>
          <p className="eyebrow">CEIT inventory</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Student survey</h1>
          <p className="muted mt-3 text-sm leading-6">
            Students, scan the QR code below with your phone camera to answer the form.
          </p>
        </header>

        <section
          aria-labelledby="survey-qr-heading"
          className="card mx-auto w-full max-w-xl rounded-lg p-6 text-center sm:p-8"
        >
          <h2 id="survey-qr-heading" className="text-xl font-semibold">
            Scan to answer
          </h2>
          <p className="muted mt-2 text-sm leading-6">
            Point your camera at the code, then tap the link to open Google Forms.
          </p>
          <Image
            unoptimized
            src={qrDataUrl}
            alt="QR code linking to the CEIT student survey on Google Forms"
            width={320}
            height={320}
            className="mx-auto my-6 h-auto w-full max-w-80 rounded-lg"
          />
          <a
            href={studentSurveyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="primary-button inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold"
          >
            Open form
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="muted mt-3 text-xs leading-5">
            Using this device? Select Open form to answer in a new tab.
          </p>
        </section>
      </div>
    </div>
  );
}
