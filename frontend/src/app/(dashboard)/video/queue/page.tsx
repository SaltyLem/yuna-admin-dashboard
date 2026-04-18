"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface ProcessingJob {
  sessionId?: number;
  scenario?: { topic?: string; language?: string; videoType?: string };
  direction?: { title?: string; topic?: string; videoType?: string; hookType?: string };
  raw?: string;
}

interface QueueState { depth: number; processing: ProcessingJob[] }

export default function VideoQueuePage() {
  const [q, setQ] = useState<QueueState | null>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<QueueState>("/video/queue", { silent: true });
      setQ(d);
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    void load();
    const h = setInterval(load, 5_000);
    return () => clearInterval(h);
  }, [load]);

  async function clearProcessing() {
    if (!confirm("processing list をクリアしますか？ (実行中の mp4 レンダリング自体は止まりません)")) return;
    setClearing(true);
    try {
      const r = await apiFetch<{ ok: boolean; removed: number }>("/video/queue/clear-processing", { method: "POST" });
      setMessage(`cleared ${r.removed}`);
      await load();
    } catch {
      setMessage("clear failed");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Video queue</h2>
          <p className="text-xs text-text-muted mt-0.5">
            yuna-redis の <code>video:build</code> と <code>video:processing</code>
          </p>
        </div>
        <button
          onClick={clearProcessing}
          disabled={clearing || !q || q.processing.length === 0}
          className="px-3 py-1.5 text-sm rounded-md border border-white/10 text-text-muted hover:text-text hover:border-white/30 disabled:opacity-40"
        >
          Clear processing
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-panel p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Waiting (video:build)</div>
          <div className="text-4xl font-bold tabular-nums mt-1 text-accent">{q?.depth ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-panel p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Processing</div>
          <div className="text-4xl font-bold tabular-nums mt-1" style={{ color: "#fbbf24" }}>
            {q?.processing.length ?? "—"}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-white/10 bg-panel p-3">
        <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Jobs in flight</div>
        {!q || q.processing.length === 0 ? (
          <div className="text-xs text-text-faint">no jobs</div>
        ) : (
          <ul className="space-y-2">
            {q.processing.map((j, i) => (
              <li key={i} className="rounded border border-white/5 bg-panel-2 p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-accent tabular-nums">#{j.sessionId ?? "?"}</span>
                  <span className="text-text-muted">{j.direction?.videoType ?? j.scenario?.videoType ?? ""}</span>
                  {j.direction?.hookType && <span className="text-text-muted">· {j.direction.hookType}</span>}
                  <span className="text-text-muted">· {j.scenario?.language ?? "ja"}</span>
                </div>
                <div className="text-text">{j.direction?.title ?? j.direction?.topic ?? j.scenario?.topic ?? j.raw}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <div className="text-xs text-text-muted">{message}</div>}
    </div>
  );
}
