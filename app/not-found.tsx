import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap doc nf">
      <h1>Not on the radar</h1>
      <p>Zero Radar keeps recent entries only (about 30 days). Older ones drop off — try NVD or the GitHub Advisory Database.</p>
      <p>
        <Link href="/">← Back to the feed</Link>
      </p>
    </main>
  );
}
