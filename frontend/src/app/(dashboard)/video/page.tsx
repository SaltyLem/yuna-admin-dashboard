"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/use-api";

interface QueueState {
  depth: number;
  processing: Array<{
    sessionId?: number;
    scenario?: { topic?: string; language?: string; videoType?: string };
    direction?: { title?: string; topic?: string; videoType?: string };
    raw?: string;
  }>;
}

interface Stats {
  sessionCounts: Array<{ status: string; count: number }>;
  postCountsByLanguage: Array<{ language: string | null; count: number }>;
  weekly: { total_cost: string; completed_sessions: number; total_sessions: number };
}

interface Post {
  id: number; session_id: number;
  platform: string; video_type: string | null; language: string | null;
  title: string | null; topic: string | null;
  short_url: string | null; full_url: string | null;
  posted_at: string; created_at: string;
}

interface Session {
  id: number; status: string; language: string | null;
  direction: { topic?: string; title?: string; videoType?: string } | null;
  build_id: string | null; total_cost: string;
  created_at: string; completed_at: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function VideoOverviewPage() {
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [q, s, p, ss] = await Promise.all([
          apiFetch<QueueState>("/video/queue", { silent: true }),
          apiFetch<Stats>("/video/stats", { silent: true }),
          apiFetch<{ posts: Post[] }>("/video/posts?limit=10", { silent: true }),
          apiFetch<{ sessions: Session[] }>("/video/sessions?limit=10", { silent: true }),
        ]);
        if (cancelled) return;
        setQueue(q); setStats(s); setPosts(p.posts); setSessions(ss.sessions);
      } catch { /* keep */ }
    }
    void load();
    const h = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);

  const runningCount = stats?.sessionCounts.find(x => x.status === "running")?.count ?? 0;
  const completedCount = stats?.sessionCounts.find(x => x.status === "completed")?.count ?? 0;
  const failedCount = stats?.sessionCounts.find(x => x.status === "failed")?.count ?? 0;
  const weekCost = parseFloat(stats?.weekly.total_cost ?? "0") || 0;

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header>
        <h2 className="text-xl font-semibold">Video pipeline</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Remotion 経由のショート動画生成 — キュー / セッション / 投稿
        </p>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <Kpi label="Queue" value={queue?.depth ?? 0} sub={`${queue?.processing.length ?? 0} 実行中`} />
        <Kpi label="Sessions running" value={runningCount} />
        <Kpi label="Sessions completed" value={completedCount} />
        <Kpi label="Sessions failed" value={failedCount} accent="#f43f5e" />
        <Kpi label="週コスト" value={`$${weekCost.toFixed(2)}`} accent="#22d3ee" />
      </div>

      {/* Processing jobs */}
      {queue && queue.processing.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-panel p-3">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Processing now</div>
          <ul className="space-y-1">
            {queue.processing.map((j, i) => (
              <li key={i} className="text-sm tabular-nums flex items-center gap-2">
                <span className="text-accent">#{j.sessionId ?? "?"}</span>
                <span className="text-text-muted text-[10px]">{j.direction?.videoType ?? j.scenario?.videoType ?? ""}</span>
                <span className="text-text truncate">{j.direction?.title ?? j.direction?.topic ?? j.scenario?.topic ?? j.raw ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent sessions + posts side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-lg border border-white/10 bg-panel p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-text-muted">Recent sessions</div>
            <Link href="/video/sessions" className="text-[11px] text-accent hover:underline">all →</Link>
          </div>
          <ul className="space-y-1">
            {sessions.map(s => (
              <li key={s.id} className="text-xs flex items-center gap-2">
                <span className="text-text-faint tabular-nums w-10">#{s.id}</span>
                <StatusBadge status={s.status} />
                <span className="text-text-muted tabular-nums w-24">{fmtTime(s.created_at)}</span>
                <span className="text-text truncate flex-1">{s.direction?.title ?? s.direction?.topic ?? "—"}</span>
                <span className="text-text-faint tabular-nums w-14 text-right">${parseFloat(s.total_cost || "0").toFixed(3)}</span>
              </li>
            ))}
            {sessions.length === 0 && <li className="text-text-faint text-xs">no sessions</li>}
          </ul>
        </section>

        <section className="rounded-lg border border-white/10 bg-panel p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-text-muted">Recent posts</div>
            <Link href="/video/posts" className="text-[11px] text-accent hover:underline">all →</Link>
          </div>
          <ul className="space-y-1">
            {posts.map(p => (
              <li key={p.id} className="text-xs flex items-center gap-2">
                <span className="text-text-faint tabular-nums w-10">#{p.id}</span>
                <span className="text-text-muted text-[10px] w-8">{p.language ?? ""}</span>
                <span className="text-text-muted tabular-nums w-24">{fmtTime(p.posted_at)}</span>
                <span className="text-text truncate flex-1">{p.title ?? p.topic ?? "—"}</span>
                {p.short_url && <a href={p.short_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">R2</a>}
              </li>
            ))}
            {posts.length === 0 && <li className="text-text-faint text-xs">no posts</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent = "#a855f7" }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: `linear-gradient(180deg, ${accent}10 0%, #0b1120cc 70%)`,
        borderColor: `${accent}44`,
        boxShadow: `0 0 12px -8px ${accent}66, 0 0 1px ${accent}33 inset`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${accent}aa` }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "completed" ? "#22d3ee"
              : status === "running"   ? "#fbbf24"
              : status === "failed"    ? "#f43f5e" : "#64748b";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {status}
    </span>
  );
}
