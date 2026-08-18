import Link from "next/link";

export default function NotFound() {
  return <main className="page grid min-h-screen place-items-center"><section className="card w-full max-w-lg rounded-lg p-7 text-center"><p className="eyebrow">Not found</p><h1 className="title mt-3 text-3xl">That inventory record is not available</h1><p className="muted mt-3 text-sm leading-6">The link may be incomplete, or the record may no longer be available to your account.</p><Link href="/dashboard" className="primary-button mt-6 inline-block rounded-lg px-4 py-2.5 text-sm font-semibold">Go to dashboard</Link></section></main>;
}
