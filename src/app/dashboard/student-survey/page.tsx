import Image from "next/image";
import { ExternalLink } from "lucide-react";
import QRCode from "qrcode";

export const metadata = { title: "Student survey · CEIT Inventory" };

const studentSurveyUrl =
  "https://docs.google.com/forms/d/e/1FAIpQLSdoHxFXWctUNOmfltMSVA7TBNU3w7AfII5QLsPtrdM2_MeVvg/viewform?usp=dialog";

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
          <p className="eyebrow">Student feedback</p>
          <h1 className="title mt-2 text-3xl">Student survey</h1>
          <p className="muted mt-3 text-sm leading-6">
            Scan the QR code with your phone to answer the survey.
          </p>
        </header>

        <section
          aria-labelledby="survey-qr-heading"
          className="card mx-auto w-full max-w-xl rounded-lg p-6 text-center sm:p-8"
        >
          <h2 id="survey-qr-heading" className="text-xl font-semibold">
            Scan to answer
          </h2>
          <p className="muted mt-2 text-sm leading-6">It opens in Google Forms.</p>
          <Image
            unoptimized
            src={qrDataUrl}
            alt="QR code for the student survey"
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
          <p className="muted mt-3 text-xs leading-5">Or click Open form to answer here.</p>
        </section>
      </div>
    </div>
  );
}
