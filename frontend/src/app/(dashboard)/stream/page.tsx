"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiFetch } from "@/components/use-api";
import { useAdminWs } from "@/components/use-admin-ws";

/* ─────────────────────────── types ─────────────────────────── */

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];
const CHANNEL_LABEL: Record<Channel, string> = { ja: "JA", en: "EN" };

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

/* ─────────────────────────── helpers ───────────────────────── */

function safeNum(x: unknown): number {
  const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : 0;
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

function phaseColor(phase: string | undefined | null): { bg: string; ring: string; text: string } {
  switch (phase) {
    case "live":
      return { bg: "bg-emerald-500/15", ring: "ring-emerald-500/40", text: "text-emerald-400" };
    case "prep":
      return { bg: "bg-sky-500/15", ring: "ring-sky-500/40", text: "text-sky-400" };
    case "closing":
      return { bg: "bg-amber-500/15", ring: "ring-amber-500/40", text: "text-amber-400" };
    case "ending":
      return { bg: "bg-fuchsia-500/15", ring: "ring-fuchsia-500/40", text: "text-fuchsia-400" };
    case "idle":
    default:
      return { bg: "bg-zinc-500/10", ring: "ring-zinc-500/30", text: "text-text-muted" };
  }
}

/* ─────────────────────────── page ──────────────────────────── */

export default function LiveStreamMonitorPage() {
  const [byChannel, setByChannel] = useState<Record<Channel, ChannelLive | null>>({
    ja: null, en: null,
  });
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // 1s tick for elapsed counters + rolling window refresh
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<LiveStateResp>("/stream/live-state");
      const next: Record<Channel, ChannelLive | null> = { ja: null, en: null };
      for (const c of data.channels) next[c.channel] = c;
      setByChannel(next);
    } catch { /* toast already handled */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll every 30s for hydration drift
  useEffect(() => {
    const h = setInterval(() => void load(), 30_000);
    return () => clearInterval(h);
  }, [load]);

  // Real-time WS pushes
  const onWsMessage = useCallback((event: string, data: unknown) => {
    const m = /^stream:(ja|en):(.+)$/.exec(event);
    if (!m) return;
    const channel = m[1] as Channel;
    const rawType = m[2]!;
    const eventType = rawType.replace(":", "_") as EventType;

    setByChannel((prev) => {
      const cur = prev[channel];
      const base: ChannelLive = cur ?? {
        channel,
        sessionId: null,
        status: null,
        statusAt: null,
        events: [],
        monitor: null,
      };

      const evt: StreamEvent = {
        event_type: eventType,
        session_id: null,
        payload: data,
        emitted_at: null,
        recorded_at: new Date().toISOString(),
      };

      // Status events update channel status inline
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

      const events = [...base.events, evt].slice(-500);

      return { ...prev, [channel]: { ...base, events, status, sessionId, statusAt } };
    });
  }, []);

  const { connected } = useAdminWs(onWsMessage);

  return (
    <div className="flex flex-col gap-5 h-full">
      <TopBar connected={connected} loading={loading} nowMs={now} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 min-h-0">
        {CHANNELS.map((ch) => (
          <ChannelPanel key={ch} channel={ch} data={byChannel[ch]} nowMs={now} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── top bar ───────────────────────── */

function TopBar({ connected, loading, nowMs }: { connected: boolean; loading: boolean; nowMs: number }) {
  return (
    <div className="flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Live stream monitor</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Redis realtime + admin-db event log + Railway session detail を集約
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
          <span className="text-text-muted">{connected ? "WS connected" : "WS disconnected"}</span>
        </div>
        <div className="tabular-nums text-text-faint">
          {new Date(nowMs).toLocaleTimeString()}
        </div>
        {loading && <span className="text-text-faint">loading…</span>}
      </div>
    </div>
  );
}

/* ────────────────────── channel panel ──────────────────────── */

function ChannelPanel({
  channel, data, nowMs,
}: {
  channel: Channel;
  data: ChannelLive | null;
  nowMs: number;
}) {
  const status = data?.status?.status ?? "idle";
  const color = phaseColor(status);
  const title = data?.status?.title || data?.monitor?.stream.title || "—";
  const program = data?.status?.program;
  const startedAt = data?.monitor?.stream.started_at
    ? new Date(data.monitor.stream.started_at).getTime()
    : null;
  const isActive = status !== "idle" && !!startedAt;
  const elapsedMs = isActive && startedAt ? nowMs - startedAt : 0;

  // Derive per-minute activity for chart from events over last hour.
  const activity = useMemo(() => buildActivitySeries(data?.events ?? [], nowMs), [data?.events, nowMs]);

  // Theme history from director iters (prefer payload from stream_events control/status
  // is not tracked, so rely on director.thinking first line per iter if present).
  const themeHistory = useMemo(() => buildThemeHistory(data?.monitor?.directorIters ?? []), [data?.monitor?.directorIters]);

  const counts = data?.monitor?.counts;
  const targetMin = data?.monitor?.stream.target_minutes ?? 0;
  const elapsedMin = elapsedMs / 60_000;

  return (
    <section
      className={[
        "relative flex flex-col gap-4 rounded-2xl border border-border bg-panel p-4 ring-1",
        color.ring,
        "transition-all",
      ].join(" ")}
    >
      {/* header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PhaseBadge status={status} channel={channel} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{title}</div>
            <div className="text-[11px] text-text-faint tabular-nums flex items-center gap-2">
              {program && <span className="text-text-muted">{program}</span>}
              {data?.sessionId && <span>· {data.sessionId}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-semibold tabular-nums ${color.text}`}>
            {isActive ? formatElapsed(elapsedMs) : "—"}
          </div>
          {targetMin > 0 && (
            <div className="text-[10px] text-text-faint tabular-nums">
              target {targetMin}m
            </div>
          )}
        </div>
      </header>

      {/* progress bar vs target */}
      {targetMin > 0 && isActive && (
        <div className="h-1 w-full bg-panel-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${color.text.replace("text-", "bg-")}`}
            style={{ width: `${Math.min(100, (elapsedMin / targetMin) * 100)}%` }}
          />
        </div>
      )}

      {/* stats row */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Comments" value={counts?.comment_count ?? 0} />
        <Stat label="Viewers" value={counts?.unique_viewers ?? 0} />
        <Stat label="Superchats" value={counts?.superchat_count ?? 0} />
        <Stat label="$ Total" value={`$${safeNum(counts?.superchat_total).toFixed(2)}`} />
      </div>

      {/* theme timeline */}
      <ThemeTimeline items={themeHistory} />

      {/* activity chart */}
      <ActivityChart series={activity} />

      {/* bottom grid: feeds + iters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
        <CommentsFeed comments={mergeRealtimeComments(data)} />
        <UtterancesFeed talker={data?.monitor?.talkerResults ?? []} events={data?.events ?? []} />
      </div>

      <DirectorIterList iters={data?.monitor?.directorIters ?? []} />

      <TtsHealth events={data?.events ?? []} nowMs={nowMs} />
    </section>
  );
}

/* ────────────────────── small primitives ───────────────────── */

function PhaseBadge({ status, channel }: { status: string; channel: Channel }) {
  const color = phaseColor(status);
  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        color.bg, color.text,
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-1.5 w-1.5 rounded-full",
          color.text.replace("text-", "bg-"),
          status === "live" || status === "closing" ? "animate-pulse" : "",
        ].join(" ")}
      />
      {CHANNEL_LABEL[channel]} · {status}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-panel-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-text-faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums transition-all">{value}</div>
    </div>
  );
}

/* ────────────────────── theme timeline ─────────────────────── */

interface ThemeSegment {
  theme: string;
  startedAt: number;
  endedAt: number | null;
}

function buildThemeHistory(iters: DirectorIter[]): ThemeSegment[] {
  // Director iters currently carry thinking text; theme is usually the
  // first line. This is a best-effort visualization until yuna-api
  // surfaces a dedicated theme column.
  const out: ThemeSegment[] = [];
  const sorted = [...iters].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  for (const it of sorted) {
    const theme = extractTheme(it);
    if (!theme) continue;
    const ts = new Date(it.created_at).getTime();
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
  const th = it.thinking ?? "";
  const firstLine = th.split("\n")[0]?.trim();
  if (firstLine && firstLine.length < 80) return firstLine;
  return null;
}

function ThemeTimeline({ items }: { items: ThemeSegment[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-panel-2 px-3 py-2 text-[11px] text-text-faint">
        theme history —
      </div>
    );
  }
  const first = items[0]!.startedAt;
  const last = items[items.length - 1]!.endedAt ?? Date.now();
  const span = Math.max(1, last - first);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">Theme timeline</div>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-panel-2">
        {items.map((seg, i) => {
          const end = seg.endedAt ?? last;
          const width = ((end - seg.startedAt) / span) * 100;
          const isCurrent = seg.endedAt === null;
          return (
            <div
              key={i}
              title={`${seg.theme}`}
              className={[
                "flex items-center justify-center px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis border-r border-bg/40 transition-all",
                isCurrent ? "bg-accent/30 text-accent" : "bg-panel text-text-muted",
              ].join(" ")}
              style={{ width: `${Math.max(3, width)}%` }}
            >
              {seg.theme}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────── activity chart ─────────────────────── */

interface ActivityPoint {
  t: number;      // minute bucket (unix ms)
  comments: number;
  utterances: number;
}

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

function ActivityChart({ series }: { series: ActivityPoint[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-text-faint">Activity (last 30m)</div>
      <div className="h-36 w-full rounded-md bg-panel-2 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="gradC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradU" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={24}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
            />
            <Area type="monotone" dataKey="comments" stroke="#38bdf8" fill="url(#gradC)" strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="utterances" stroke="#a855f7" fill="url(#gradU)" strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ────────────────────── feeds ──────────────────────────────── */

interface UiComment {
  id: string;
  user: string;
  text: string;
  isSuperchat: boolean;
  amount?: string | number;
  at: number;
}

function mergeRealtimeComments(data: ChannelLive | null): UiComment[] {
  if (!data) return [];
  // start with monitor comments (already sorted DESC by commented_at)
  const fromMonitor: UiComment[] = (data.monitor?.comments ?? []).map((c, i) => ({
    id: `m-${i}-${c.commented_at}`,
    user: c.nickname || c.display_name,
    text: c.text,
    isSuperchat: c.is_superchat,
    amount: c.amount ?? undefined,
    at: Date.parse(c.commented_at),
  }));
  // append realtime events that happened after the most recent monitor entry
  const latestMonitorAt = fromMonitor[0]?.at ?? 0;
  const fromEvents: UiComment[] = [];
  for (const e of data.events) {
    if (e.event_type !== "comments") continue;
    const p = e.payload as Record<string, unknown> | null;
    if (!p) continue;
    const at = typeof p["timestamp"] === "number" ? (p["timestamp"] as number)
             : Date.parse(e.recorded_at);
    if (at <= latestMonitorAt) continue;
    fromEvents.push({
      id: `e-${String(p["id"] ?? at)}`,
      user: String(p["user"] ?? "?"),
      text: String(p["text"] ?? ""),
      isSuperchat: Boolean(p["isSuperchat"]),
      amount: p["amount"] as string | undefined,
      at,
    });
  }
  return [...fromEvents, ...fromMonitor].slice(0, 40);
}

function CommentsFeed({ comments }: { comments: UiComment[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div className="rounded-lg bg-panel-2 p-2 flex flex-col min-h-0">
      <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1 px-1">Comments</div>
      <div ref={scrollRef} className="flex flex-col gap-1 overflow-y-auto max-h-64 scrollbar-none">
        {comments.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-text-faint">no comments yet</div>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className={[
              "group rounded-md px-2 py-1 text-[12px] leading-snug transition",
              c.isSuperchat ? "bg-amber-500/10 border border-amber-500/30" : "hover:bg-panel",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              {c.isSuperchat && <span className="text-amber-400">★ ${c.amount ?? ""}</span>}
              <span className="truncate">{c.user}</span>
              <span className="text-text-faint">{new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="text-text break-all">{c.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UtterancesFeed({
  talker, events,
}: {
  talker: TalkerResult[];
  events: StreamEvent[];
}) {
  // Merge DB talker results with real-time speak events.
  const dbRows = talker.map((t, i) => ({
    id: `t-${i}`,
    texts: t.utterances.map(u => u.text),
    expression: t.utterances[0]?.expression,
    isReply: Boolean(t.comment_text),
    at: Date.parse(t.created_at),
    via: "db",
  }));
  const eventRows: Array<typeof dbRows[number]> = [];
  for (const e of events) {
    if (e.event_type !== "speak") continue;
    const p = e.payload as Record<string, unknown> | null;
    if (!p) continue;
    const utterances = Array.isArray(p["utterances"]) ? p["utterances"] as Array<Record<string, unknown>> : [];
    eventRows.push({
      id: `se-${e.id ?? e.recorded_at}`,
      texts: utterances.map(u => String(u["text"] ?? "")),
      expression: utterances[0]?.["expression"] as string | undefined,
      isReply: Boolean(utterances[0]?.["comment"]),
      at: Date.parse(e.recorded_at),
      via: "ws",
    });
  }
  const merged = [...eventRows, ...dbRows]
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);

  return (
    <div className="rounded-lg bg-panel-2 p-2 flex flex-col min-h-0">
      <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1 px-1">YUNA utterances</div>
      <div className="flex flex-col gap-1 overflow-y-auto max-h-64 scrollbar-none">
        {merged.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-text-faint">no utterances yet</div>
        )}
        {merged.map((r) => (
          <div key={r.id} className="rounded-md px-2 py-1 hover:bg-panel transition">
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              {r.expression && <span className="rounded px-1 bg-panel text-accent">{r.expression}</span>}
              {r.isReply && <span className="text-sky-400">reply</span>}
              <span className="text-text-faint">{new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {r.texts.map((t, i) => (
              <div key={i} className="text-[12px] text-text leading-snug break-all">{t}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────── director iter list ─────────────────── */

function DirectorIterList({ iters }: { iters: DirectorIter[] }) {
  const rows = [...iters].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ).slice(0, 10);

  return (
    <div className="rounded-lg bg-panel-2 p-2">
      <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1 px-1">Director iters</div>
      <div className="overflow-y-auto max-h-40 scrollbar-none">
        {rows.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-text-faint">no director activity yet</div>
        )}
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map((it, i) => {
              const actions = it.actions as Record<string, unknown> | null;
              const theme = actions && typeof actions["currentTheme"] === "string" ? actions["currentTheme"] : "—";
              const pick = actions && typeof actions["pickComments"] === "number" ? actions["pickComments"] : 0;
              const close = Boolean(actions && actions["shouldClose"]);
              const emergency = Boolean(it.emergency_reason);
              return (
                <tr key={i} className="hover:bg-panel transition">
                  <td className="px-1 py-1 tabular-nums text-text-faint w-16">
                    {new Date(it.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="px-1 py-1 tabular-nums text-text-muted w-8">#{it.iteration}</td>
                  <td className="px-1 py-1 text-text truncate max-w-[200px]" title={String(theme)}>{String(theme)}</td>
                  <td className="px-1 py-1 w-10 text-right tabular-nums text-text-muted">{String(pick)}</td>
                  <td className="px-1 py-1 w-20">
                    {close && <span className="rounded bg-amber-500/20 text-amber-400 px-1 text-[10px]">close</span>}
                    {emergency && <span className="ml-1 rounded bg-rose-500/20 text-rose-400 px-1 text-[10px]">emg</span>}
                  </td>
                  <td className="px-1 py-1 w-16 text-right tabular-nums text-text-faint">${safeNum(it.cost).toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────── tts health ─────────────────────────── */

function TtsHealth({ events, nowMs }: { events: StreamEvent[]; nowMs: number }) {
  const lastSpeak = [...events].reverse().find(e => e.event_type === "speak");
  const lastDone = [...events].reverse().find(e => e.event_type === "speak_done");
  const lastExpr = [...events].reverse().find(e => e.event_type === "expression");

  const speakAt = lastSpeak ? Date.parse(lastSpeak.recorded_at) : 0;
  const doneAt = lastDone ? Date.parse(lastDone.recorded_at) : 0;
  const exprPayload = lastExpr?.payload as Record<string, unknown> | undefined;
  const expression = exprPayload && typeof exprPayload["expression"] === "string"
    ? exprPayload["expression"]
    : null;

  const sinceSpeak = speakAt ? nowMs - speakAt : null;
  const sinceDone = doneAt ? nowMs - doneAt : null;
  const queued = speakAt > doneAt;

  return (
    <div className="grid grid-cols-3 gap-2 text-[11px]">
      <div className="rounded-lg bg-panel-2 p-2">
        <div className="text-[10px] uppercase tracking-wider text-text-faint">Last expression</div>
        <div className="mt-0.5 text-sm font-medium text-accent">{expression ?? "—"}</div>
      </div>
      <div className="rounded-lg bg-panel-2 p-2">
        <div className="text-[10px] uppercase tracking-wider text-text-faint">Since last speak</div>
        <div className="mt-0.5 text-sm font-medium tabular-nums">
          {sinceSpeak === null ? "—" : `${(sinceSpeak / 1000).toFixed(1)}s`}
        </div>
      </div>
      <div className={`rounded-lg p-2 ${queued ? "bg-sky-500/10 ring-1 ring-sky-500/30" : "bg-panel-2"}`}>
        <div className="text-[10px] uppercase tracking-wider text-text-faint">TTS state</div>
        <div className="mt-0.5 text-sm font-medium">
          {queued ? <span className="text-sky-400">playing</span> : <span className="text-text-muted">idle</span>}
          {sinceDone !== null && !queued && (
            <span className="ml-1 text-[10px] text-text-faint tabular-nums">({(sinceDone / 1000).toFixed(1)}s ago)</span>
          )}
        </div>
      </div>
    </div>
  );
}
