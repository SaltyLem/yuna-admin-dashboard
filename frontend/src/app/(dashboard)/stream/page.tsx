"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, PolarRadiusAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { apiFetch } from "@/components/use-api";
import { useAdminWs } from "@/components/use-admin-ws";

/* ============================================================= */
/*  types                                                         */
/* ============================================================= */

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];
const CHANNEL_LABEL: Record<Channel, string> = { ja: "JA", en: "EN" };
const CHANNEL_COLOR: Record<Channel, string> = { ja: "#22d3ee", en: "#e879f9" }; // cyan / fuchsia

type EventType = "comments" | "status" | "speak" | "speak_done" | "expression" | "control";

interface StreamEvent {
  id?: number;
  event_type: EventType | string;
  session_id: string | null;
  payload: unknown;
  emitted_at: string | null;
  recorded_at: string;
}

interface StatusPayload {
  status?: string;
  program?: string;
  label?: string;
  title?: string;
  actors?: string[];
}

interface DirectorIter {
  phase: string;
  emergency_reason: string | null;
  iteration: number;
  thinking: string | null;
  actions: unknown;
  action_results: unknown;
  done: boolean;
  cost: number;
  created_at: string;
}

interface TalkerResult {
  utterances: Array<{ text: string; expression?: string; isReply?: boolean }>;
  recalled_memories: unknown;
  comment_text: string | null;
  comment_user: string | null;
  model: string | null;
  cost: number;
  emotion_delta: number;
  created_at: string;
}

interface CommentRow {
  display_name: string;
  nickname: string | null;
  text: string;
  is_superchat: boolean;
  amount: number | null;
  commented_at: string;
  author_channel_id: string | null;
  person_id: string | null;
}

interface Counts {
  comment_count: number;
  unique_viewers: number;
  superchat_count: number;
  superchat_total: number | string;
}

interface StreamMeta {
  session_id: string;
  title: string | null;
  topics: unknown;
  target_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  status: string;
}

interface ChannelMonitor {
  stream: StreamMeta;
  directorIters: DirectorIter[];
  talkerResults: TalkerResult[];
  comments: CommentRow[];
  counts: Counts;
}

interface ChannelLive {
  channel: Channel;
  sessionId: string | null;
  status: StatusPayload | null;
  statusAt: string | null;
  events: StreamEvent[];
  monitor: ChannelMonitor | null;
}

interface LiveStateResp {
  now: string;
  channels: ChannelLive[];
}

interface YunaState {
  connected: boolean;
  emotion: { category?: string; valence?: number; arousal?: number } | null;
  currentPhase: string | null;
  todayCostUsd: number | null;
  activityStatus: { mode?: string; state?: string } | null;
}

/* ============================================================= */
/*  helpers                                                       */
/* ============================================================= */

function safeNum(x: unknown): number {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : 0;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimeShort(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function phasePalette(phase: string | undefined | null): {
  label: string; fg: string; bg: string; ring: string; dot: string;
} {
  switch (phase) {
    case "live":
      return { label: "LIVE",     fg: "text-cyan-300",    bg: "bg-cyan-500/10",    ring: "ring-cyan-500/50",    dot: "bg-cyan-400" };
    case "prep":
      return { label: "PREP",     fg: "text-sky-300",     bg: "bg-sky-500/10",     ring: "ring-sky-500/40",     dot: "bg-sky-400" };
    case "closing":
      return { label: "CLOSING",  fg: "text-amber-300",   bg: "bg-amber-500/10",   ring: "ring-amber-500/40",   dot: "bg-amber-400" };
    case "ending":
      return { label: "ENDING",   fg: "text-fuchsia-300", bg: "bg-fuchsia-500/10", ring: "ring-fuchsia-500/40", dot: "bg-fuchsia-400" };
    case "idle":
    default:
      return { label: "IDLE",     fg: "text-zinc-400",    bg: "bg-zinc-500/5",     ring: "ring-zinc-600/30",    dot: "bg-zinc-500" };
  }
}

/* ============================================================= */
/*  page                                                          */
/* ============================================================= */

export default function LiveStreamMonitorPage() {
  const [byChannel, setByChannel] = useState<Record<Channel, ChannelLive | null>>({
    ja: null, en: null,
  });
  const [yunaState, setYunaState] = useState<YunaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // 1s clock
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const load = useCallback(async () => {
    try {
      const [live, state] = await Promise.all([
        apiFetch<LiveStateResp>("/stream/live-state", { silent: true }),
        apiFetch<YunaState>("/state", { silent: true }).catch(() => null),
      ]);
      const next: Record<Channel, ChannelLive | null> = { ja: null, en: null };
      for (const c of live.channels) next[c.channel] = c;
      setByChannel(next);
      if (state) setYunaState(state);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const h = setInterval(() => void load(), 15_000);
    return () => clearInterval(h);
  }, [load]);

  const onWs = useCallback((event: string, data: unknown) => {
    const m = /^stream:(ja|en):(.+)$/.exec(event);
    if (!m) return;
    const channel = m[1] as Channel;
    const rawType = m[2]!;
    const eventType = rawType.replace(":", "_") as EventType;

    setByChannel((prev) => {
      const cur = prev[channel];
      const base: ChannelLive = cur ?? {
        channel, sessionId: null, status: null, statusAt: null, events: [], monitor: null,
      };

      const evt: StreamEvent = {
        event_type: eventType,
        session_id: null,
        payload: data,
        emitted_at: null,
        recorded_at: new Date().toISOString(),
      };

      let status = base.status;
      let sessionId = base.sessionId;
      let statusAt = base.statusAt;
      if (eventType === "status" && data && typeof data === "object") {
        status = data as StatusPayload;
        const p = data as Record<string, unknown>;
        if (typeof p["sessionId"] === "string") sessionId = p["sessionId"];
        if (typeof p["session_id"] === "string") sessionId = p["session_id"];
        if ((data as StatusPayload).status === "idle") sessionId = null;
        statusAt = evt.recorded_at;
      }

      const events = [...base.events, evt].slice(-600);
      return { ...prev, [channel]: { ...base, events, status, sessionId, statusAt } };
    });
  }, []);

  const { connected } = useAdminWs(onWs);

  return (
    <div className="relative h-full flex flex-col gap-2 overflow-hidden">
      <SciBg />

      <Header connected={connected} loading={loading} nowMs={now} />
      <TotalsBar byChannel={byChannel} yunaState={yunaState} />

      {/* main content: 3 sections stacked vertically */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-2">

        {/* SECTION A — hero centered with activity on left, pulse radars above/below,
            EN activity on right. 12-col × 2-row grid. */}
        <div className="flex-[1.35] min-h-0 grid grid-cols-12 grid-rows-2 gap-2">
          <PanelFrame
            className="col-start-1 col-end-4 row-start-1 row-end-2"
            title="JA Activity" accent={CHANNEL_COLOR.ja}
          >
            <ActivityChart events={byChannel.ja?.events ?? []} nowMs={now} color={CHANNEL_COLOR.ja} />
          </PanelFrame>

          <PanelFrame
            className="col-start-1 col-end-4 row-start-2 row-end-3"
            title="JA Pulse" accent={CHANNEL_COLOR.ja}
          >
            <ChannelRadar channel="ja" data={byChannel.ja} nowMs={now} />
          </PanelFrame>

          <PanelFrame
            className="col-start-4 col-end-10 row-start-1 row-end-3"
            title="Session Core" accent="#a855f7"
          >
            <HeroCore byChannel={byChannel} yunaState={yunaState} nowMs={now} />
          </PanelFrame>

          <PanelFrame
            className="col-start-10 col-end-13 row-start-1 row-end-2"
            title="EN Activity" accent={CHANNEL_COLOR.en}
          >
            <ActivityChart events={byChannel.en?.events ?? []} nowMs={now} color={CHANNEL_COLOR.en} />
          </PanelFrame>

          <PanelFrame
            className="col-start-10 col-end-13 row-start-2 row-end-3"
            title="EN Pulse" accent={CHANNEL_COLOR.en}
          >
            <ChannelRadar channel="en" data={byChannel.en} nowMs={now} />
          </PanelFrame>
        </div>

        {/* SECTION B — theme timeline, thin strip across full width */}
        <PanelFrame className="shrink-0" title="Theme Timeline" accent="#fbbf24">
          <DualThemeTimeline byChannel={byChannel} />
        </PanelFrame>

        {/* SECTION C — three feeds, equal width */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-2">
          <PanelFrame className="col-span-4 min-h-0" title="Comments" accent="#38bdf8">
            <CommentsFeed byChannel={byChannel} />
          </PanelFrame>
          <PanelFrame className="col-span-4 min-h-0" title="YUNA Utterances" accent="#c084fc">
            <UtterancesFeed byChannel={byChannel} />
          </PanelFrame>
          <PanelFrame className="col-span-4 min-h-0" title="Director" accent="#fb7185">
            <DirectorList byChannel={byChannel} />
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  SciBg: fixed starfield + gradient                             */
/* ============================================================= */

function SciBg() {
  // 40 static stars at deterministic positions so SSR/CSR match
  const stars = useMemo(() => {
    const rng = mulberry32(42);
    return Array.from({ length: 48 }, (_, i) => ({
      id: i,
      x: rng() * 100,
      y: rng() * 100,
      size: rng() * 1.6 + 0.4,
      opacity: rng() * 0.6 + 0.2,
      delay: rng() * 6,
    }));
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-lg">
      {/* base gradient */}
      <div className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 20% -10%, rgba(34,211,238,0.08), transparent 60%)," +
            "radial-gradient(900px 500px at 85% 120%, rgba(232,121,249,0.08), transparent 65%)," +
            "radial-gradient(600px 400px at 50% 50%, rgba(168,85,247,0.05), transparent 70%)," +
            "linear-gradient(180deg, #05070d 0%, #0a0f1c 50%, #05070d 100%)",
        }}
      />
      {/* grid overlay */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.6) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(148,163,184,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* stars */}
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full bg-cyan-200"
          style={{
            top: `${s.y}%`, left: `${s.x}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            opacity: s.opacity,
            boxShadow: `0 0 ${s.size * 3}px rgba(165,243,252,0.6)`,
            animation: `sci-twinkle 6s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================= */
/*  PanelFrame: sci-fi panel with corner brackets                 */
/* ============================================================= */

function PanelFrame({
  title, accent = "#22d3ee", className = "", children,
}: {
  title?: string;
  accent?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "relative z-10 rounded-lg border border-white/10 bg-[#0b1120]/60 backdrop-blur-sm flex flex-col overflow-hidden",
        className,
      ].join(" ")}
      style={{ boxShadow: `0 0 24px -10px ${accent}55, 0 0 1px ${accent}55 inset` }}
    >
      {title && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0">
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: `${accent}cc` }}
          >
            {title}
          </div>
          <div className="ml-auto h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }} />
        </div>
      )}
      <div className="flex-1 min-h-0 px-3 pb-3 pt-1 overflow-hidden">{children}</div>
    </section>
  );
}

/* ============================================================= */
/*  Header + totals bar                                           */
/* ============================================================= */

function Header({
  connected, loading, nowMs,
}: { connected: boolean; loading: boolean; nowMs: number }) {
  return (
    <div className="relative z-10 flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <h1
          className="text-2xl font-bold tracking-[0.25em] uppercase"
          style={{
            background: "linear-gradient(90deg, #22d3ee 0%, #e879f9 100%)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 18px rgba(34,211,238,0.25)",
          }}
        >
          YUNA · Live Stream Monitor
        </h1>
        {loading && <span className="text-xs text-text-faint">loading…</span>}
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-cyan-400" : "bg-red-500"} ${connected ? "animate-pulse" : ""}`}
            style={connected ? { boxShadow: "0 0 8px #22d3ee" } : {}} />
          <span className={connected ? "text-cyan-300" : "text-red-400"}>
            {connected ? "WS LINK ONLINE" : "WS LINK OFFLINE"}
          </span>
        </div>
        <div className="tabular-nums text-text-muted">
          {new Date(nowMs).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function TotalsBar({
  byChannel, yunaState,
}: { byChannel: Record<Channel, ChannelLive | null>; yunaState: YunaState | null }) {
  const counts = (ch: Channel) => byChannel[ch]?.monitor?.counts;
  const total = (key: keyof Counts) =>
    safeNum(counts("ja")?.[key]) + safeNum(counts("en")?.[key]);
  const emotion = yunaState?.emotion?.category ?? "—";
  const todayCost = yunaState?.todayCostUsd;

  return (
    <div className="relative z-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <Kpi label="Comments" value={total("comment_count")} accent="#22d3ee" />
      <Kpi label="Viewers"  value={total("unique_viewers")} accent="#22d3ee" />
      <Kpi label="Superchats" value={total("superchat_count")} accent="#fbbf24" />
      <Kpi label="Super $"  value={`$${(safeNum(counts("ja")?.superchat_total) + safeNum(counts("en")?.superchat_total)).toFixed(0)}`} accent="#fbbf24" />
      <Kpi label="Emotion"  value={emotion} accent="#e879f9" />
      <Kpi label="Today $"  value={todayCost == null ? "—" : `$${safeNum(todayCost).toFixed(2)}`} accent="#34d399" />
    </div>
  );
}

function Kpi({
  label, value, accent,
}: { label: string; value: string | number; accent: string }) {
  return (
    <PanelFrame accent={accent}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted">{label}</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: accent, textShadow: `0 0 10px ${accent}66` }}>
            {value}
          </div>
        </div>
        <div className="h-8 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }} />
      </div>
    </PanelFrame>
  );
}

/* ============================================================= */
/*  Hero core: dual session rings + emotion                       */
/* ============================================================= */

function HeroCore({
  byChannel, yunaState, nowMs,
}: {
  byChannel: Record<Channel, ChannelLive | null>;
  yunaState: YunaState | null;
  nowMs: number;
}) {
  const ring = (ch: Channel) => {
    const c = byChannel[ch];
    const status = c?.status?.status ?? "idle";
    const started = c?.monitor?.stream.started_at ? Date.parse(c.monitor.stream.started_at) : 0;
    const target = safeNum(c?.monitor?.stream.target_minutes) * 60_000;
    const elapsed = started ? nowMs - started : 0;
    const progress = target > 0 ? clamp01(elapsed / target) : 0;
    return { status, elapsed, target, progress, active: status !== "idle" && started > 0 };
  };
  const ja = ring("ja");
  const en = ring("en");

  const valence = safeNum(yunaState?.emotion?.valence);
  const arousal = safeNum(yunaState?.emotion?.arousal);
  const category = yunaState?.emotion?.category ?? "—";
  const totalComments = safeNum(byChannel.ja?.monitor?.counts?.comment_count) + safeNum(byChannel.en?.monitor?.counts?.comment_count);

  // SVG arc (viewBox coords; rendered responsively)
  const size = 240;
  const cx = size / 2, cy = size / 2;
  const outerR = 104, innerR = 82;
  const stroke = 8;

  return (
    <div className="flex flex-col items-center h-full gap-2">
      <div className="relative flex-1 min-h-0 aspect-square">
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="ringJa" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={CHANNEL_COLOR.ja} />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="ringEn" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={CHANNEL_COLOR.en} />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* tick marks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * 2 * Math.PI - Math.PI / 2;
            const r1 = outerR + 12, r2 = outerR + 16;
            const bold = i % 5 === 0;
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * r1}
                y1={cy + Math.sin(a) * r1}
                x2={cx + Math.cos(a) * r2}
                y2={cy + Math.sin(a) * r2}
                stroke={bold ? "#67e8f9" : "#475569"}
                strokeWidth={bold ? 1.5 : 0.8}
                opacity={bold ? 0.8 : 0.4}
              />
            );
          })}

          {/* outer track + JA progress */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <Arc cx={cx} cy={cy} r={outerR} stroke="url(#ringJa)" strokeWidth={stroke}
            progress={ja.progress} filter="url(#glow)" dim={!ja.active} />
          {/* inner track + EN progress */}
          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <Arc cx={cx} cy={cy} r={innerR} stroke="url(#ringEn)" strokeWidth={stroke}
            progress={en.progress} filter="url(#glow)" dim={!en.active} />

          {/* inner circle background */}
          <circle cx={cx} cy={cy} r={innerR - stroke - 2} fill="#05070d" fillOpacity={0.6} />

          {/* valence arc (bottom) */}
          <ValenceArc cx={cx} cy={cy} r={innerR - stroke - 10} valence={valence} />
        </svg>

        {/* center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[9px] uppercase tracking-[0.3em] text-text-muted">Comments</div>
          <div className="text-4xl font-bold tabular-nums text-cyan-300"
            style={{ textShadow: "0 0 16px rgba(34,211,238,0.6)" }}>
            {totalComments}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-fuchsia-300">
            <span style={{ textShadow: "0 0 8px rgba(232,121,249,0.6)" }}>{category}</span>
          </div>
          <div className="mt-1 text-[9px] text-text-faint tabular-nums">
            V {valence.toFixed(2)} · A {arousal.toFixed(2)}
          </div>
        </div>

        {/* orbiting particles (purely decorative) */}
        <OrbitingDots />
      </div>

      {/* legend */}
      <div className="mt-2 grid grid-cols-2 gap-2 w-full text-[11px]">
        {(["ja", "en"] as Channel[]).map(ch => {
          const r = ch === "ja" ? ja : en;
          const color = CHANNEL_COLOR[ch];
          return (
            <div key={ch} className="rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <span className="font-medium" style={{ color }}>{CHANNEL_LABEL[ch]}</span>
                <span className="text-text-muted uppercase text-[9px]">{phasePalette(r.status).label}</span>
              </div>
              <span className="tabular-nums" style={{ color }}>
                {r.active ? formatElapsed(r.elapsed) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Arc({
  cx, cy, r, stroke, strokeWidth, progress, filter, dim,
}: {
  cx: number; cy: number; r: number;
  stroke: string; strokeWidth: number; progress: number;
  filter?: string; dim?: boolean;
}) {
  if (progress <= 0 || dim) {
    return null;
  }
  const p = clamp01(progress);
  const end = -Math.PI / 2 + 2 * Math.PI * p;
  const x1 = cx + Math.cos(-Math.PI / 2) * r;
  const y1 = cy + Math.sin(-Math.PI / 2) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = p > 0.5 ? 1 : 0;
  return (
    <path
      d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      filter={filter}
    />
  );
}

function ValenceArc({
  cx, cy, r, valence,
}: { cx: number; cy: number; r: number; valence: number }) {
  const v = Math.max(-1, Math.min(1, valence));
  const positive = v >= 0;
  const color = positive ? "#10b981" : "#ef4444";
  const mag = Math.abs(v);
  // Semi-circle from 180deg to 360deg (bottom half). Fill proportionally from center outwards.
  const start = Math.PI; // left
  const end = Math.PI + mag * Math.PI * (positive ? 1 : -1); // clockwise if positive
  const sx = cx + Math.cos(start) * r;
  const sy = cy + Math.sin(start) * r;
  const ex = cx + Math.cos(end) * r;
  const ey = cy + Math.sin(end) * r;
  const large = mag > 0.5 ? 1 : 0;
  const sweep = positive ? 1 : 0;
  if (mag < 0.02) return null;
  return (
    <path
      d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeOpacity={0.7}
    />
  );
}

function OrbitingDots() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: "22s" }}>
        <div className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-300" style={{ boxShadow: "0 0 8px #22d3ee" }} />
      </div>
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: "32s", animationDirection: "reverse" }}>
        <div className="absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-fuchsia-300" style={{ boxShadow: "0 0 8px #e879f9" }} />
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Channel radar (6 axes)                                        */
/* ============================================================= */

function ChannelRadar({
  channel, data, nowMs,
}: { channel: Channel; data: ChannelLive | null; nowMs: number }) {
  const color = CHANNEL_COLOR[channel];
  const events = data?.events ?? [];
  const iters = data?.monitor?.directorIters ?? [];
  const talker = data?.monitor?.talkerResults ?? [];
  const counts = data?.monitor?.counts;

  // Axes, each normalized to 0..100
  const windowMs = 5 * 60_000;
  const recent = events.filter(e => Date.parse(e.recorded_at) > nowMs - windowMs);
  const recentComments = recent.filter(e => e.event_type === "comments").length;
  const recentSpeaks = recent.filter(e => e.event_type === "speak").length;

  const iters15 = iters.filter(i => Date.parse(i.created_at) > nowMs - 15 * 60_000).length;
  const replyRate = talker.length === 0
    ? 0
    : talker.slice(0, 20).filter(t => Boolean(t.comment_text)).length / Math.min(20, talker.length);
  const superchatRate = counts && safeNum(counts.comment_count) > 0
    ? safeNum(counts.superchat_count) / safeNum(counts.comment_count)
    : 0;
  const avgCost = iters.slice(0, 10).reduce((s, i) => s + safeNum(i.cost), 0) / Math.max(1, iters.slice(0, 10).length);

  const axes = [
    { axis: "Chat",     value: Math.min(100, recentComments * 5) },
    { axis: "Reply",    value: Math.round(replyRate * 100) },
    { axis: "Tempo",    value: Math.min(100, iters15 * 10) },
    { axis: "Super",    value: Math.round(superchatRate * 100) },
    { axis: "Speak",    value: Math.min(100, recentSpeaks * 5) },
    { axis: "Cost",     value: Math.min(100, avgCost * 1000) },
  ];

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={axes} cx="50%" cy="50%" outerRadius="78%">
          <PolarGrid stroke={`${color}44`} />
          <PolarAngleAxis dataKey="axis" tick={{ fill: `${color}`, fontSize: 10, fontWeight: 600 }} />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          <Radar
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.25}
            strokeWidth={1.5}
            isAnimationActive
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================= */
/*  Activity chart                                                */
/* ============================================================= */

interface ActivityPoint { t: number; comments: number; utterances: number; }

function buildActivitySeries(events: StreamEvent[], nowMs: number): ActivityPoint[] {
  const bucketMs = 60_000;
  const spanMs = 30 * 60_000;
  const start = Math.floor((nowMs - spanMs) / bucketMs) * bucketMs;
  const buckets = new Map<number, ActivityPoint>();
  for (let t = start; t <= nowMs; t += bucketMs) {
    buckets.set(t, { t, comments: 0, utterances: 0 });
  }
  for (const e of events) {
    const at = Date.parse(e.recorded_at);
    if (Number.isNaN(at) || at < start) continue;
    const k = Math.floor(at / bucketMs) * bucketMs;
    const b = buckets.get(k);
    if (!b) continue;
    if (e.event_type === "comments") b.comments += 1;
    else if (e.event_type === "speak") b.utterances += 1;
  }
  return [...buckets.values()];
}

function ActivityChart({
  events, nowMs, color,
}: { events: StreamEvent[]; nowMs: number; color: string }) {
  const series = useMemo(() => buildActivitySeries(events, nowMs), [events, nowMs]);
  const gid = `ch-${color.replace("#", "")}`;

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gid}-u`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c084fc" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#c084fc" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ffffff10" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => formatTimeShort(v)}
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={22} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#0b1120", border: `1px solid ${color}66`, fontSize: 11 }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
          />
          <Area type="monotone" dataKey="comments"   stroke={color}     strokeWidth={1.6} fill={`url(#${gid})`}   isAnimationActive={false} />
          <Area type="monotone" dataKey="utterances" stroke="#c084fc" strokeWidth={1.6} fill={`url(#${gid}-u)`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================= */
/*  Theme timeline (both channels)                                */
/* ============================================================= */

interface ThemeSegment { theme: string; startedAt: number; endedAt: number | null; }

function buildThemeHistory(iters: DirectorIter[]): ThemeSegment[] {
  const out: ThemeSegment[] = [];
  const sorted = [...iters].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const it of sorted) {
    const theme = extractTheme(it);
    if (!theme) continue;
    const ts = Date.parse(it.created_at);
    const last = out[out.length - 1];
    if (last && last.theme === theme) continue;
    if (last) last.endedAt = ts;
    out.push({ theme, startedAt: ts, endedAt: null });
  }
  return out;
}

function extractTheme(it: DirectorIter): string | null {
  const actions = it.actions as unknown;
  if (actions && typeof actions === "object" && "currentTheme" in actions) {
    const v = (actions as { currentTheme?: unknown }).currentTheme;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function DualThemeTimeline({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const items = {
    ja: buildThemeHistory(byChannel.ja?.monitor?.directorIters ?? []),
    en: buildThemeHistory(byChannel.en?.monitor?.directorIters ?? []),
  };
  const all = [...items.ja, ...items.en];
  if (all.length === 0) {
    return <div className="h-24 flex items-center justify-center text-[11px] text-text-faint">no theme activity</div>;
  }
  const first = Math.min(...all.map(s => s.startedAt));
  const last = Math.max(...all.map(s => s.endedAt ?? Date.now()));
  const span = Math.max(1, last - first);

  return (
    <div className="space-y-3">
      {(["ja", "en"] as Channel[]).map(ch => {
        const segs = items[ch];
        const color = CHANNEL_COLOR[ch];
        return (
          <div key={ch}>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>{CHANNEL_LABEL[ch]}</span>
            </div>
            <div className="flex h-8 w-full overflow-hidden rounded-md bg-white/[0.03] border border-white/5">
              {segs.length === 0 && (
                <div className="w-full flex items-center justify-center text-[10px] text-text-faint">—</div>
              )}
              {segs.map((seg, i) => {
                const end = seg.endedAt ?? last;
                // position from first (left align whole range)
                const leftPct = ((seg.startedAt - first) / span) * 100;
                const widthPct = ((end - seg.startedAt) / span) * 100;
                const isCurrent = seg.endedAt === null;
                return (
                  <div
                    key={i}
                    title={seg.theme}
                    className={[
                      "absolute h-8 flex items-center px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis transition-all",
                      isCurrent ? "font-semibold" : "",
                    ].join(" ")}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(2, widthPct)}%`,
                      position: "absolute",
                      background: isCurrent ? `${color}33` : `${color}15`,
                      borderRight: `1px solid ${color}44`,
                      color,
                      boxShadow: isCurrent ? `inset 0 0 12px ${color}44, 0 0 10px ${color}33` : undefined,
                    }}
                  >
                    {seg.theme}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================= */
/*  Comments feed (merged ja + en)                                */
/* ============================================================= */

interface UiComment {
  id: string;
  channel: Channel;
  user: string;
  text: string;
  isSuperchat: boolean;
  amount?: string | number;
  at: number;
}

function mergeComments(byChannel: Record<Channel, ChannelLive | null>): UiComment[] {
  const out: UiComment[] = [];
  for (const ch of CHANNELS) {
    const c = byChannel[ch];
    if (!c) continue;
    for (let i = 0; i < (c.monitor?.comments ?? []).length; i++) {
      const m = c.monitor!.comments[i]!;
      out.push({
        id: `m-${ch}-${i}-${m.commented_at}`,
        channel: ch,
        user: m.nickname || m.display_name,
        text: m.text,
        isSuperchat: m.is_superchat,
        amount: m.amount ?? undefined,
        at: Date.parse(m.commented_at),
      });
    }
    const latestDb = (c.monitor?.comments ?? [])[0]?.commented_at
      ? Date.parse(c.monitor!.comments[0]!.commented_at)
      : 0;
    for (const e of c.events) {
      if (e.event_type !== "comments") continue;
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      const at = typeof p["timestamp"] === "number" ? (p["timestamp"] as number) : Date.parse(e.recorded_at);
      if (at <= latestDb) continue;
      out.push({
        id: `e-${ch}-${String(p["id"] ?? at)}`,
        channel: ch,
        user: String(p["user"] ?? "?"),
        text: String(p["text"] ?? ""),
        isSuperchat: Boolean(p["isSuperchat"]),
        amount: p["amount"] as string | undefined,
        at,
      });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 60);
}

function CommentsFeed({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const rows = mergeComments(byChannel);
  if (rows.length === 0) return <Empty label="no comments yet" />;
  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full scrollbar-none">
      {rows.map((c) => (
        <div
          key={c.id}
          className={[
            "rounded-md px-2 py-1 text-[12px] border transition",
            c.isSuperchat
              ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(251,191,36,0.2)]"
              : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <div className="flex items-center gap-1.5 text-[10px]">
            <span
              className="rounded px-1 text-[9px] font-semibold"
              style={{ color: CHANNEL_COLOR[c.channel], background: `${CHANNEL_COLOR[c.channel]}18` }}
            >
              {CHANNEL_LABEL[c.channel]}
            </span>
            {c.isSuperchat && <span className="text-amber-300">★ {c.amount ?? ""}</span>}
            <span className="text-text-muted truncate">{c.user}</span>
            <span className="ml-auto tabular-nums text-text-faint">{formatTimeShort(c.at)}</span>
          </div>
          <div className="text-text break-all">{c.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================= */
/*  Utterances feed                                               */
/* ============================================================= */

function UtterancesFeed({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const rows: Array<{
    id: string; channel: Channel; texts: string[]; expression?: string;
    isReply: boolean; at: number;
  }> = [];
  for (const ch of CHANNELS) {
    const c = byChannel[ch];
    if (!c) continue;
    (c.monitor?.talkerResults ?? []).forEach((t, i) => {
      rows.push({
        id: `t-${ch}-${i}`,
        channel: ch,
        texts: t.utterances.map(u => u.text),
        expression: t.utterances[0]?.expression,
        isReply: Boolean(t.comment_text),
        at: Date.parse(t.created_at),
      });
    });
    for (const e of c.events) {
      if (e.event_type !== "speak") continue;
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      const us = Array.isArray(p["utterances"]) ? p["utterances"] as Array<Record<string, unknown>> : [];
      rows.push({
        id: `s-${ch}-${e.id ?? e.recorded_at}`,
        channel: ch,
        texts: us.map(u => String(u["text"] ?? "")),
        expression: us[0]?.["expression"] as string | undefined,
        isReply: Boolean(us[0]?.["comment"]),
        at: Date.parse(e.recorded_at),
      });
    }
  }
  rows.sort((a, b) => b.at - a.at);
  const top = rows.slice(0, 25);
  if (top.length === 0) return <Empty label="no utterances yet" />;
  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full scrollbar-none">
      {top.map((r) => (
        <div key={r.id} className="rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.05] transition">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span
              className="rounded px-1 text-[9px] font-semibold"
              style={{ color: CHANNEL_COLOR[r.channel], background: `${CHANNEL_COLOR[r.channel]}18` }}
            >
              {CHANNEL_LABEL[r.channel]}
            </span>
            {r.expression && <span className="rounded bg-fuchsia-500/10 text-fuchsia-300 px-1">{r.expression}</span>}
            {r.isReply && <span className="text-cyan-300">reply</span>}
            <span className="ml-auto tabular-nums text-text-faint">{formatTimeShort(r.at)}</span>
          </div>
          {r.texts.map((t, i) => (
            <div key={i} className="text-[12px] text-text leading-snug break-all">{t}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================= */
/*  Director iter list                                            */
/* ============================================================= */

function DirectorList({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const rows: Array<{
    id: string; channel: Channel; at: number; theme: string;
    pick: number; close: boolean; emergency: boolean; cost: number; iter: number;
  }> = [];
  for (const ch of CHANNELS) {
    const iters = byChannel[ch]?.monitor?.directorIters ?? [];
    for (const it of iters) {
      const actions = it.actions as Record<string, unknown> | null;
      rows.push({
        id: `${ch}-${it.created_at}-${it.iteration}`,
        channel: ch,
        at: Date.parse(it.created_at),
        theme: actions && typeof actions["currentTheme"] === "string" ? actions["currentTheme"] as string : "—",
        pick: actions && typeof actions["pickComments"] === "number" ? actions["pickComments"] as number : 0,
        close: Boolean(actions && actions["shouldClose"]),
        emergency: Boolean(it.emergency_reason),
        cost: safeNum(it.cost),
        iter: it.iteration,
      });
    }
  }
  rows.sort((a, b) => b.at - a.at);
  const top = rows.slice(0, 12);
  if (top.length === 0) return <Empty label="no director activity yet" />;

  return (
    <div className="overflow-y-auto h-full scrollbar-none">
      <table className="w-full text-[11px]">
        <tbody>
          {top.map((r) => (
            <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition">
              <td className="py-1 px-1 tabular-nums text-text-faint w-16">{formatTimeShort(r.at)}</td>
              <td className="py-1 px-1 w-7">
                <span className="rounded px-1 text-[9px] font-semibold" style={{ color: CHANNEL_COLOR[r.channel], background: `${CHANNEL_COLOR[r.channel]}18` }}>
                  {CHANNEL_LABEL[r.channel]}
                </span>
              </td>
              <td className="py-1 px-1 tabular-nums text-text-muted w-8">#{r.iter}</td>
              <td className="py-1 px-1 text-text truncate max-w-[180px]" title={r.theme}>{r.theme}</td>
              <td className="py-1 px-1 w-8 text-right tabular-nums text-text-muted">{r.pick}</td>
              <td className="py-1 px-1 w-16">
                {r.close && <span className="rounded bg-amber-500/20 text-amber-300 px-1 text-[10px]">close</span>}
                {r.emergency && <span className="ml-1 rounded bg-rose-500/20 text-rose-300 px-1 text-[10px]">emg</span>}
              </td>
              <td className="py-1 px-1 w-14 text-right tabular-nums text-text-faint">${r.cost.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================= */
/*  TTS pipeline panel                                            */
/* ============================================================= */

function TtsPipeline({
  byChannel, nowMs,
}: { byChannel: Record<Channel, ChannelLive | null>; nowMs: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CHANNELS.map((ch) => {
        const events = byChannel[ch]?.events ?? [];
        const lastSpeak = [...events].reverse().find(e => e.event_type === "speak");
        const lastDone = [...events].reverse().find(e => e.event_type === "speak_done");
        const lastExpr = [...events].reverse().find(e => e.event_type === "expression");

        const speakAt = lastSpeak ? Date.parse(lastSpeak.recorded_at) : 0;
        const doneAt = lastDone ? Date.parse(lastDone.recorded_at) : 0;
        const exprP = lastExpr?.payload as Record<string, unknown> | undefined;
        const expression = exprP && typeof exprP["expression"] === "string" ? exprP["expression"] : null;

        const sinceSpeak = speakAt ? nowMs - speakAt : null;
        const sinceDone = doneAt ? nowMs - doneAt : null;
        const playing = speakAt > doneAt;
        const color = CHANNEL_COLOR[ch];
        return (
          <div key={ch} className="rounded-md border border-white/5 bg-white/[0.02] p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="rounded px-1 text-[9px] font-semibold" style={{ color, background: `${color}18` }}>
                {CHANNEL_LABEL[ch]}
              </span>
              {playing
                ? <span className="text-[10px] text-cyan-300" style={{ textShadow: `0 0 6px ${color}` }}>● PLAYING</span>
                : <span className="text-[10px] text-text-faint">○ idle</span>}
            </div>
            <div className="text-[11px] space-y-1">
              <Row label="expression" value={expression ?? "—"} color="#c084fc" />
              <Row label="last speak" value={sinceSpeak === null ? "—" : `${(sinceSpeak / 1000).toFixed(1)}s`} />
              <Row label="last done"  value={sinceDone  === null ? "—" : `${(sinceDone  / 1000).toFixed(1)}s`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="tabular-nums font-medium" style={{ color: color ?? undefined }}>{value}</span>
    </div>
  );
}

/* ============================================================= */
/*  Cost donut                                                    */
/* ============================================================= */

function CostDonut({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const bucket = { director: 0, talker: 0 };
  for (const ch of CHANNELS) {
    const iters = byChannel[ch]?.monitor?.directorIters ?? [];
    const talker = byChannel[ch]?.monitor?.talkerResults ?? [];
    for (const i of iters) bucket.director += safeNum(i.cost);
    for (const t of talker) bucket.talker += safeNum(t.cost);
  }
  const data = [
    { name: "Director", value: bucket.director },
    { name: "Talker",   value: bucket.talker },
  ];
  const empty = data.every(d => d.value < 0.0001);
  const colors = ["#fb7185", "#c084fc"];
  const total = data.reduce((s, d) => s + d.value, 0);

  if (empty) return <Empty label="no cost data yet" />;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius="60%" outerRadius="88%"
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#0b1120", border: "1px solid #fbbf2466", fontSize: 11 }}
              formatter={(v) => `$${safeNum(v).toFixed(4)}`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint">Total</div>
          <div className="text-lg font-bold tabular-nums text-amber-300" style={{ textShadow: "0 0 10px rgba(251,191,36,0.5)" }}>
            ${total.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1 text-[11px]">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i], boxShadow: `0 0 4px ${colors[i]}` }} />
            <span className="text-text-muted">{d.name}</span>
            <span className="ml-auto tabular-nums font-medium" style={{ color: colors[i] }}>
              ${d.value.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Top supporters                                                */
/* ============================================================= */

function TopSupporters({ byChannel }: { byChannel: Record<Channel, ChannelLive | null> }) {
  const byUser = new Map<string, { user: string; channel: Channel; amount: number; count: number }>();
  for (const ch of CHANNELS) {
    const comments = byChannel[ch]?.monitor?.comments ?? [];
    for (const c of comments) {
      if (!c.is_superchat) continue;
      const key = `${ch}:${c.author_channel_id ?? c.display_name}`;
      const prev = byUser.get(key) ?? { user: c.nickname || c.display_name, channel: ch, amount: 0, count: 0 };
      prev.amount += safeNum(c.amount);
      prev.count += 1;
      byUser.set(key, prev);
    }
  }
  const rows = [...byUser.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  if (rows.length === 0) return <Empty label="no superchats yet" />;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 text-[12px]">
          <span className="text-text-faint tabular-nums w-4">{i + 1}</span>
          <span className="rounded px-1 text-[9px] font-semibold" style={{ color: CHANNEL_COLOR[r.channel], background: `${CHANNEL_COLOR[r.channel]}18` }}>
            {CHANNEL_LABEL[r.channel]}
          </span>
          <span className="truncate flex-1">{r.user}</span>
          <span className="text-text-faint tabular-nums text-[10px]">×{r.count}</span>
          <span className="tabular-nums font-medium text-amber-300" style={{ textShadow: "0 0 6px rgba(251,191,36,0.5)" }}>
            ${r.amount.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================= */
/*  Empty state                                                   */
/* ============================================================= */

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-24 text-[11px] text-text-faint italic">
      {label}
    </div>
  );
}
