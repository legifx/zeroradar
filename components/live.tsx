"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RelTime } from "./reltime";

type M = { checked_at: string; data_changed_at: string; sources: { total: number; ok: number } };

/** Live-Leiste: fragt jede Minute nach, ob es neue Daten gibt, und bietet dann Neuladen an. */
export function LiveBar({ initial }: { initial: M }) {
  const router = useRouter();
  const [m, setM] = useState(initial);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/meta", { cache: "no-store" });
        if (r.ok) setM(await r.json());
      } catch {}
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const newer = m.data_changed_at && initial.data_changed_at && m.data_changed_at > initial.data_changed_at;
  const stale = Date.now() - Date.parse(m.checked_at) > 20 * 60e3;
  return (
    <div className="live" aria-live="polite">
      <span className={`dot${stale ? " stale" : ""}`} />
      <span>
        {stale ? "Delayed" : "Live"}, last checked <RelTime iso={m.checked_at} />
      </span>
      <span>
        {m.sources.ok} of {m.sources.total} sources reachable
      </span>
      {m.data_changed_at && (
        <span>
          last new information <RelTime iso={m.data_changed_at} />
        </span>
      )}
      {newer && (
        <button type="button" onClick={() => router.refresh()}>
          New entries. Reload
        </button>
      )}
    </div>
  );
}
