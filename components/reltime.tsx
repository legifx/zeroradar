"use client";
import { useEffect, useState } from "react";

function rel(iso: string, now: number) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Relative Zeit, die im Browser weiterläuft (Seiten sind gecacht). */
export function RelTime({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const abs = new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return (
    <time dateTime={iso} title={abs} suppressHydrationWarning>
      {now ? rel(iso, now) : abs}
    </time>
  );
}
