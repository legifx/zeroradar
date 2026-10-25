import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap detail">
      <h1>Not on the radar</h1>
      <p className="note">Zero Radar keeps recent threats only (about 30 days). Older entries drop off.</p>
      <p>
        <Link href="/">← back to the feed</Link>
      </p>
    </main>
  );
}
