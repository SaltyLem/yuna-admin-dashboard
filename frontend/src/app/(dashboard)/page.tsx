"use client";

/**
 * Overview — the landing page.
 *
 * Layout rhythm (top → bottom, largest → smallest):
 *   1. PULSE     — live stream status for JA + EN (hero, loud)
 *   2. TODAY     — 6 KPI tiles (dense, numeric)
 *   3. ACTIVITY + MIND — split 60 / 40 (middle)
 *   4. SYSTEM    — 3080 / 5090 / Docker mini-rings (compact)
 *   5. VIDEO     — queue + recent posts (compact)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/use-api";

/* ============================================================= */
/*  types                                                         */
/* ============================================================= */

type Channel = "ja" | "en";

interface StreamStatus { status?: string; title?: string; program?: string }
interface StreamEvent {
  id: number; event_type: string; session_id: string | null;
  payload: Record<string, unknown>; emitted_at: string | null; recorded_at: string;
}
interface StreamMonitor {
  stream?: { started_at?: string | null; title?: string | null; program?: string | null };
  counts?: { comments?: number; superchat?: number; superUsd?: number; uniqueViewers?: number; peakViewers?: number };
  latestUtterance?: { text?: string; speaker?: string; at?: string };
}
interface ChannelState {
  channel: Channel;
  sessionId: string | null;
  status: StreamStatus | null;
  statusAt: string | null;
  events: StreamEvent[];
  monitor: StreamMonitor | null;
}

interface YunaState {
  connected?: boolean;
  emotion?: { category?: string; valence?: number; arousal?: number } | null;
  currentThought?: string | null;
  activityStatus?: string | null;
  currentPhase?: string | null;
  todayCostUsd?: number | null;
  activeGoals?: Array<{ id: number; content?: string; progress?: string | null; type?: string }>;
  currentInterests?: Array<string | { topic?: string; since?: string; lastSeen?: string; intensity?: number }>;
}

interface LatestSample {
  kind: string; subject: string | null; metric: string; value: number;
}
interface Post {
  id: number; session_id: number; title: string | null; topic: string | null;
  language: string | null; video_type: string | null;
  short_url: string | null; full_url: string | null;
  posted_at: string | null; created_at: string;
}
interface VideoStats {
  sessionCounts: Array<{ status: string; count: number }>;
  weekly: { total_cost: string; completed_sessions: number; total_sessions: number };
}
interface QueueState {
  depth: number;
  processing: Array<{ sessionId?: number; direction?: { title?: string; topic?: string; videoType?: string } }>;
}
interface PendingAction {
  id: number; title?: string; content?: string; priority?: number | string;
  status?: string; due_at?: string | null;
}

/* ============================================================= */
/*  data hooks                                                    */
/* ============================================================= */

function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await fn();
        if (!cancelled) setData(d);
      } catch { /* keep previous */ }
    }
    void run();
    const h = setInterval(run, intervalMs);
    return () => { cancelled = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

/* ============================================================= */
/*  page                                                          */
/* ============================================================= */

export default function OverviewPage() {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(h);
  }, []);

  const live = usePolling<{ now: string; channels: ChannelState[] }>(
    () => apiFetch("/stream/live-state", { silent: true }),
    5_000,
  );
  const state = usePolling<YunaState>(() => apiFetch("/state", { silent: true }), 10_000);
  const pending = usePolling<{ actions: PendingAction[]; total: number }>(
    () => apiFetch("/pending-actions?status=pending&limit=5", { silent: true }),
    15_000,
  );
  const metrics3080 = usePolling<{ samples: LatestSample[] }>(
    () => apiFetch("/metrics/latest?host=linux-3080", { silent: true }),
    15_000,
  );
  const metrics5090 = usePolling<{ samples: LatestSample[] }>(
    () => apiFetch("/metrics/latest?host=linux-5090", { silent: true }),
    15_000,
  );
  const queue = usePolling<QueueState>(() => apiFetch("/video/queue", { silent: true }), 10_000);
  const vstats = usePolling<VideoStats>(() => apiFetch("/video/stats", { silent: true }), 30_000);
  const vposts = usePolling<{ posts: Post[] }>(
    () => apiFetch("/video/posts?limit=5", { silent: true }),
    30_000,
  );

  const byChannel: Record<Channel, ChannelState | undefined> = useMemo(() => {
    const m: Partial<Record<Channel, ChannelState>> = {};
    for (const c of live?.channels ?? []) m[c.channel] = c;
    return m as Record<Channel, ChannelState | undefined>;
  }, [live]);

  const todaysTotals = useMemo(() => computeToday(live), [live]);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      {/* ────────────── 1. PULSE ────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <PulseCard channel="ja" state={byChannel.ja} accent="#22d3ee" nowMs={nowMs} />
        <PulseCard channel="en" state={byChannel.en} accent="#e879f9" nowMs={nowMs} />
      </section>

      {/* ────────────── 2. TODAY (KPIs) ────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <Kpi label="配信時間"     value={fmtMinutes(todaysTotals.streamMinutes)} color="#22d3ee" />
        <Kpi label="コメント"     value={todaysTotals.comments.toLocaleString()} color="#60a5fa" />
        <Kpi label="Superchat $"  value={`$${todaysTotals.superUsd.toFixed(2)}`} color="#fbbf24" />
        <Kpi label="動画投稿"     value={countCompletedToday(vstats)} color="#a855f7" />
        <Kpi label="今日の API $" value={state?.todayCostUsd != null ? `$${state.todayCostUsd.toFixed(2)}` : "—"} color="#38bdf8" />
        <Kpi label="サイクル"     value={state?.currentPhase ?? state?.activityStatus ?? "—"} color="#f472b6" big={false} />
      </section>

      {/* ────────────── 3. ACTIVITY + MIND ────────────── */}
      <section className="grid grid-cols-1 xl:grid-cols-5 gap-3 flex-1 min-h-[320px]">
        <ActivityTimeline className="xl:col-span-3" live={live} nowMs={nowMs} />
        <MindPanel className="xl:col-span-2" state={state} pending={pending} />
      </section>

      {/* ────────────── 4. SYSTEM ────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <HostRing label="3080 Ti" samples={metrics3080?.samples ?? []} accent="#22d3ee" />
        <HostRing label="5090"    samples={metrics5090?.samples ?? []} accent="#e879f9" />
        <DockerPanel samples={[...(metrics3080?.samples ?? []), ...(metrics5090?.samples ?? [])]} />
      </section>

      {/* ────────────── 5. VIDEO ────────────── */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <VideoQueueCard queue={queue} stats={vstats} className="xl:col-span-1" />
        <VideoRecentCard posts={vposts?.posts ?? []} className="xl:col-span-2" />
      </section>
    </div>
  );
}

/* ============================================================= */
/*  PULSE                                                         */
/* ============================================================= */

function PulseCard({ channel, state, accent, nowMs }: {
  channel: Channel; state: ChannelState | undefined; accent: string; nowMs: number;
}) {
  const status = state?.status?.status ?? "idle";
  const started = state?.monitor?.stream?.started_at ? Date.parse(state.monitor.stream.started_at) : 0;
  const live = status !== "idle" && started > 0;
  const elapsed = live && started ? nowMs - started : 0;

  const title = state?.status?.title ?? state?.monitor?.stream?.title ?? "";
  const program = state?.monitor?.stream?.program ?? state?.status?.program ?? "";
  const viewers = state?.monitor?.counts?.peakViewers ?? state?.monitor?.counts?.uniqueViewers ?? 0;
  const comments = state?.monitor?.counts?.comments ?? 0;
  const superUsd = state?.monitor?.counts?.superUsd ?? 0;
  const lastUtt = state?.monitor?.latestUtterance;

  return (
    <div
      className="relative rounded-2xl border overflow-hidden"
      style={{
        background: `radial-gradient(140% 140% at 0% 0%, ${accent}1c, #0b1120 45%, #05070d 90%)`,
        borderColor: live ? `${accent}aa` : `${accent}33`,
        boxShadow: live ? `0 0 32px -10px ${accent}cc, 0 0 1px ${accent}aa inset` : undefined,
      }}
    >
      <div className="flex items-start justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <div
            className="text-[11px] font-bold tracking-[0.3em] uppercase"
            style={{ color: accent, textShadow: `0 0 8px ${accent}66` }}
          >
            {channel.toUpperCase()}
          </div>
          {program && <span className="text-[10px] text-text-muted uppercase tracking-wider">{program}</span>}
        </div>
        <LivePill live={live} accent={accent} />
      </div>

      <div className="px-4 pb-4 pt-1">
        <div className="flex items-baseline gap-3">
          <div
            className="text-5xl font-black tabular-nums leading-none"
            style={{ color: live ? accent : "#475569", textShadow: live ? `0 0 16px ${accent}99` : undefined }}
          >
            {viewers.toLocaleString()}
          </div>
          <div className="text-xs text-text-muted uppercase tracking-[0.2em]">viewers</div>
          {live && (
            <div className="ml-auto text-xs text-text-muted tabular-nums">
              {fmtElapsed(elapsed)}
            </div>
          )}
        </div>

        {title && <div className="mt-2 text-sm text-text line-clamp-1">{title}</div>}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <MiniStat label="COMMENTS" value={comments.toLocaleString()} color="#60a5fa" />
          <MiniStat label="SC $"     value={`$${superUsd.toFixed(2)}`} color="#fbbf24" />
        </div>

        <div className="mt-3 min-h-[44px] rounded-md border border-white/5 px-3 py-2 bg-panel/40">
          {lastUtt?.text ? (
            <div className="text-[11px] text-text leading-snug line-clamp-2">
              <span className="text-text-faint mr-1">{lastUtt.speaker ?? "YUNA"}:</span>
              {lastUtt.text}
            </div>
          ) : (
            <div className="text-[11px] text-text-faint italic">silence</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LivePill({ live, accent }: { live: boolean; accent: string }) {
  if (!live) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] text-text-faint uppercase tracking-widest">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600" />
        offline
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
      style={{ color: accent, background: `${accent}22`, border: `1px solid ${accent}77` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
      LIVE
    </span>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

/* ============================================================= */
/*  TODAY KPIs                                                    */
/* ============================================================= */

function Kpi({ label, value, color, big = true }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
        boxShadow: `0 0 12px -10px ${color}88, 0 0 1px ${color}22 inset`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div
        className={(big ? "text-2xl" : "text-base") + " font-bold tabular-nums leading-none mt-1"}
        style={{ color, textShadow: `0 0 10px ${color}55` }}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  ACTIVITY timeline                                             */
/* ============================================================= */

interface TimelineItem {
  t: number;
  source: "comment" | "utterance" | "director" | "video";
  channel?: Channel;
  text: string;
}

function ActivityTimeline({
  className = "", live, nowMs,
}: {
  className?: string; live: { now: string; channels: ChannelState[] } | null; nowMs: number;
}) {
  const items = useMemo(() => extractTimeline(live), [live]);

  return (
    <section className={["relative rounded-xl border border-white/10 bg-panel flex flex-col overflow-hidden", className].join(" ")}>
      <div className="flex items-center px-3 pt-2.5 pb-1.5">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Activity</div>
        <Link href="/stream" className="ml-auto text-[10px] text-accent hover:underline">live monitor →</Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 scrollbar-none">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-faint text-xs">no activity in the last 24h</div>
        ) : (
          <ul className="space-y-1">
            {items.slice(0, 40).map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="text-text-faint tabular-nums w-10 shrink-0">{fmtAgo(nowMs - it.t)}</span>
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full mt-[6px] shrink-0"
                  style={{ background: sourceColor(it.source), boxShadow: `0 0 4px ${sourceColor(it.source)}` }}
                />
                <span className="text-text-muted text-[10px] uppercase tracking-wider w-16 shrink-0">
                  {it.channel ? `${it.channel} · ${it.source}` : it.source}
                </span>
                <span className="text-text flex-1 truncate">{it.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ============================================================= */
/*  MIND                                                          */
/* ============================================================= */

function MindPanel({
  className = "", state, pending,
}: {
  className?: string; state: YunaState | null; pending: { actions: PendingAction[]; total: number } | null;
}) {
  const emotion = state?.emotion?.category ?? "—";
  const valence = state?.emotion?.valence;
  const arousal = state?.emotion?.arousal;
  const connected = state?.connected;
  const thought = state?.currentThought;
  const goals = state?.activeGoals ?? [];
  const interests = state?.currentInterests ?? [];

  return (
    <section
      className={[
        "relative rounded-xl border overflow-hidden flex flex-col",
        className,
      ].join(" ")}
      style={{
        background: `radial-gradient(120% 120% at 100% 0%, #a855f71a, #0b1120 55%)`,
        borderColor: "#a855f744",
      }}
    >
      <div className="flex items-center px-3 pt-2.5 pb-1.5">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#a855f7cc" }}>Mind</div>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-widest"
          style={{ color: connected ? "#22d3ee" : "#f43f5e" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: connected ? "#22d3ee" : "#f43f5e" }} />
          {connected ? "CONNECTED" : "OFFLINE"}
        </span>
      </div>

      <div className="px-3 pb-3 space-y-3 overflow-y-auto flex-1 min-h-0 scrollbar-none">
        <div className="rounded-lg border border-white/5 bg-panel/40 p-2.5">
          <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint">Emotion</div>
          <div className="flex items-baseline gap-3 mt-1">
            <div className="text-2xl font-bold text-text" style={{ textShadow: "0 0 10px #a855f766" }}>
              {emotion}
            </div>
            {valence != null && arousal != null && (
              <div className="text-[10px] tabular-nums text-text-muted">
                V {valence.toFixed(2)} · A {arousal.toFixed(2)}
              </div>
            )}
          </div>
          {thought && (
            <div className="mt-2 text-[11px] text-text-muted line-clamp-3 italic">&ldquo;{thought}&rdquo;</div>
          )}
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1 flex items-center">
            Active goals
            <Link href="/yuna/goals" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
          </div>
          <ul className="space-y-1">
            {goals.slice(0, 3).map((g) => (
              <li key={g.id} className="flex items-start gap-2 text-xs">
                <span className="text-text-faint font-mono w-8 shrink-0">#{g.id}</span>
                <span className="text-text flex-1 line-clamp-2">{g.content ?? "—"}</span>
              </li>
            ))}
            {goals.length === 0 && <li className="text-text-faint text-[11px]">no active goals</li>}
          </ul>
        </div>

        {interests.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1">Interests</div>
            <div className="flex flex-wrap gap-1">
              {interests.slice(0, 8).map((t, i) => {
                const topic = typeof t === "string" ? t : (t.topic ?? "");
                if (!topic) return null;
                const intensity = typeof t === "object" && t.intensity != null ? t.intensity : null;
                return (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-text-muted bg-panel/40 tabular-nums"
                    title={intensity != null ? `intensity ${intensity.toFixed(2)}` : undefined}
                  >
                    {topic}
                    {intensity != null && <span className="text-text-faint ml-1">{intensity.toFixed(1)}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1 flex items-center">
            Pending actions ({pending?.total ?? 0})
            <Link href="/yuna/pending-actions" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
          </div>
          <ul className="space-y-1">
            {(pending?.actions ?? []).slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[11px]">
                <span className="text-text-faint font-mono w-8 shrink-0">#{a.id}</span>
                <span className="text-text flex-1 line-clamp-1">{a.title ?? a.content ?? "—"}</span>
              </li>
            ))}
            {(pending?.actions.length ?? 0) === 0 && <li className="text-text-faint text-[11px]">none</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ============================================================= */
/*  SYSTEM                                                        */
/* ============================================================= */

function HostRing({ label, samples, accent }: { label: string; samples: LatestSample[]; accent: string }) {
  const cpu = samples.find(s => s.kind === "cpu" && s.metric === "usage_pct")?.value ?? null;
  const mem = samples.find(s => s.kind === "memory" && s.metric === "pct")?.value ?? null;
  const gpu = samples.find(s => s.kind === "gpu" && s.metric === "usage_pct" && s.subject === "0")?.value ?? null;
  const temp = samples.find(s => s.kind === "gpu" && s.metric === "temp_c" && s.subject === "0")?.value ?? null;
  const stale = samples.length === 0;

  return (
    <Link
      href={`/metrics`}
      className="rounded-xl border bg-panel px-3 py-3 flex items-center gap-3 hover:border-white/30 transition"
      style={{ borderColor: stale ? "#33415544" : `${accent}33` }}
    >
      <div className="flex flex-col items-start gap-0.5 w-16 shrink-0">
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: stale ? "#475569" : `${accent}cc` }}>{label}</span>
        <span className="text-[9px] text-text-faint">
          {stale ? "no data" : temp != null ? `${Math.round(temp)}°C` : ""}
        </span>
      </div>
      <Ring value={cpu} label="CPU" color={accent} />
      <Ring value={gpu} label="GPU" color={accent} />
      <Ring value={mem} label="MEM" color={accent} />
    </Link>
  );
}

function Ring({ value, label, color }: { value: number | null; label: string; color: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 18;
  const circum = 2 * Math.PI * r;
  const offset = circum * (1 - v / 100);
  const bad = value != null && value >= 80;
  const warn = value != null && value >= 60 && value < 80;
  const ringColor = bad ? "#f43f5e" : warn ? "#fbbf24" : color;

  return (
    <div className="relative w-[54px] h-[54px] flex-shrink-0">
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="27" cy="27" r={r}
          fill="none" stroke={ringColor} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circum}
          strokeDashoffset={offset}
          transform="rotate(-90 27 27)"
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[11px] font-bold tabular-nums leading-none" style={{ color: ringColor }}>
          {value == null ? "—" : Math.round(v)}
        </div>
        <div className="text-[7px] uppercase tracking-widest text-text-faint mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function DockerPanel({ samples }: { samples: LatestSample[] }) {
  const containers = new Set<string>();
  let hi = { name: "", cpu: 0 };
  for (const s of samples) {
    if (s.kind === "docker" && s.subject) {
      containers.add(s.subject);
      if (s.metric === "cpu_pct" && s.value > hi.cpu) hi = { name: s.subject, cpu: s.value };
    }
  }
  return (
    <div className="rounded-xl border border-white/10 bg-panel px-3 py-3 flex items-center gap-3">
      <div className="flex flex-col items-start gap-0.5 w-20 shrink-0">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Docker</span>
        <span className="text-[9px] text-text-faint">{containers.size} containers</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint">Top CPU</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <div className="text-lg font-bold tabular-nums text-text truncate" style={{ maxWidth: 180 }}>
            {hi.name || "—"}
          </div>
          <div className="text-[11px] tabular-nums text-text-muted">{hi.cpu.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  VIDEO                                                         */
/* ============================================================= */

function VideoQueueCard({ queue, stats, className = "" }: { queue: QueueState | null; stats: VideoStats | null; className?: string }) {
  const depth = queue?.depth ?? 0;
  const running = queue?.processing.length ?? 0;
  const failed = stats?.sessionCounts.find(x => x.status === "failed")?.count ?? 0;

  return (
    <Link href="/video" className={["rounded-xl border border-white/10 bg-panel px-4 py-3 flex flex-col gap-2 hover:border-white/30 transition", className].join(" ")}>
      <div className="flex items-center">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Video pipeline</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <VideoStat label="Queue"     value={depth}   color="#a855f7" />
        <VideoStat label="Running"   value={running} color="#fbbf24" />
        <VideoStat label="Failed 30d" value={failed}  color="#f43f5e" />
      </div>
      {queue && queue.processing.length > 0 && (
        <div className="text-[10px] text-text-muted truncate pt-1 border-t border-white/5 mt-1">
          <span className="text-text-faint mr-1">now:</span>
          {queue.processing[0]?.direction?.title ?? queue.processing[0]?.direction?.topic ?? queue.processing[0]?.direction?.videoType ?? "—"}
        </div>
      )}
    </Link>
  );
}

function VideoStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-widest text-text-faint">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color, textShadow: `0 0 10px ${color}66` }}>{value}</div>
    </div>
  );
}

function VideoRecentCard({ posts, className = "" }: { posts: Post[]; className?: string }) {
  return (
    <section className={["relative rounded-xl border border-white/10 bg-panel px-3 py-3", className].join(" ")}>
      <div className="flex items-center mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Recent posts</span>
        <Link href="/video/posts" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {posts.length === 0 ? (
        <div className="text-text-faint text-xs">no posts</div>
      ) : (
        <ul className="divide-y divide-white/5">
          {posts.map(p => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="text-text-faint tabular-nums w-8 shrink-0">#{p.id}</span>
              <span className="text-text-muted text-[10px] w-8 shrink-0">{p.language ?? ""}</span>
              <span className="text-text truncate flex-1">{p.title ?? p.topic ?? "—"}</span>
              <span className="text-text-faint tabular-nums w-20 text-right shrink-0">{fmtTime(p.posted_at ?? p.created_at)}</span>
              {p.short_url && (
                <a
                  href={p.short_url} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-accent hover:underline shrink-0"
                >
                  ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================================================= */
/*  helpers                                                       */
/* ============================================================= */

function fmtElapsed(ms: number): string {
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

function fmtAgo(deltaMs: number): string {
  const s = Math.max(0, Math.floor(deltaMs / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sourceColor(s: TimelineItem["source"]): string {
  switch (s) {
    case "comment":   return "#94a3b8";
    case "utterance": return "#22d3ee";
    case "director":  return "#a855f7";
    case "video":     return "#fbbf24";
  }
}

function computeToday(live: { channels: ChannelState[] } | null): {
  streamMinutes: number; comments: number; superUsd: number;
} {
  if (!live) return { streamMinutes: 0, comments: 0, superUsd: 0 };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  let streamMinutes = 0;
  let comments = 0;
  let superUsd = 0;

  for (const c of live.channels) {
    const m = c.monitor?.counts;
    if (m?.comments)  comments  += m.comments;
    if (m?.superUsd)  superUsd  += m.superUsd;

    const startedAt = c.monitor?.stream?.started_at;
    if (startedAt) {
      const s = Date.parse(startedAt);
      if (s > todayStartMs) {
        streamMinutes += Math.floor((Date.now() - s) / 60_000);
      }
    }

    let todayCommentEvents = 0;
    for (const e of c.events) {
      const t = Date.parse(e.recorded_at);
      if (t < todayStartMs) continue;
      if (e.event_type === "comment") todayCommentEvents += 1;
    }
    if (todayCommentEvents > comments) comments = todayCommentEvents;
  }
  return { streamMinutes, comments, superUsd };
}

function countCompletedToday(stats: VideoStats | null): string {
  if (!stats) return "—";
  const completed = stats.sessionCounts.find(x => x.status === "completed")?.count ?? 0;
  return String(completed);
}

function extractTimeline(live: { channels: ChannelState[] } | null): TimelineItem[] {
  if (!live) return [];
  const out: TimelineItem[] = [];
  for (const c of live.channels) {
    for (const ev of c.events) {
      const t = Date.parse(ev.recorded_at);
      if (!t) continue;
      const p = ev.payload ?? {};
      if (ev.event_type === "comment") {
        const text = strField(p, "text") || strField(p, "message") || "";
        const name = strField(p, "displayName") || strField(p, "author");
        out.push({
          t, source: "comment", channel: c.channel,
          text: name ? `${name}: ${text}` : text,
        });
      } else if (ev.event_type === "speak") {
        const text = strField(p, "text") || strField(p, "utterance") || "";
        out.push({ t, source: "utterance", channel: c.channel, text });
      } else if (ev.event_type === "director" || ev.event_type === "theme") {
        const text = strField(p, "currentTheme") || strField(p, "theme") || strField(p, "title") || "director tick";
        out.push({ t, source: "director", channel: c.channel, text });
      }
    }
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

function strField(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  return typeof v === "string" ? v : "";
}
