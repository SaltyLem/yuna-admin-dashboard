"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiFetch } from "@/components/use-api";
import { useAdminWs } from "@/components/use-admin-ws";
import { modal } from "@/components/modal";

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
  prompt?: string | null;
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

/* ---------- FX helpers (Super $ KPI currency conversion) ---------- */

type FxRates = Record<string, number>;

const FX_FALLBACK: FxRates = {
  USD: 1, JPY: 150, EUR: 0.92, GBP: 0.79,
  KRW: 1350, TWD: 32, HKD: 7.8, CNY: 7.2,
  AUD: 1.55, CAD: 1.37, NZD: 1.70, SGD: 1.34,
  THB: 36, PHP: 58, MYR: 4.7, IDR: 16000, VND: 25000,
  INR: 84, BRL: 5.1, MXN: 17.5,
};

// Currency glyph → ISO. Ambiguous symbols ($ / ¥ can mean JPY or CNY)
// default to the most common YouTube Superchat interpretation.
const CURRENCY_GLYPHS: Array<[RegExp, string]> = [
  [/JP¥|JPY|円|¥/, "JPY"],
  [/US\$|USD|\$/, "USD"],
  [/EUR|€/,       "EUR"],
  [/GBP|£/,       "GBP"],
  [/KRW|₩/,       "KRW"],
  [/TWD|NT\$/,    "TWD"],
  [/HKD|HK\$/,    "HKD"],
  [/CNY|RMB/,     "CNY"],
  [/AUD|A\$/,     "AUD"],
  [/CAD|C\$/,     "CAD"],
  [/NZD|NZ\$/,    "NZD"],
  [/SGD|S\$/,     "SGD"],
  [/THB|฿/,       "THB"],
  [/PHP|₱/,       "PHP"],
  [/INR|₹/,       "INR"],
  [/BRL|R\$/,     "BRL"],
  [/MXN/,         "MXN"],
  [/IDR|Rp/,      "IDR"],
  [/VND|₫/,       "VND"],
  [/MYR|RM/,      "MYR"],
];

/**
 * Parse an amount string like "¥500" or "$5.00" or "JPY 500" into a
 * USD value using the supplied rate table. Rates are expressed as
 * "units per 1 USD" (so JPY=150 means 1 USD = 150 JPY).
 * Returns null if amount can't be parsed at all.
 */
function toUsd(raw: unknown, rates: FxRates): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    // No currency context — assume USD, caller accepts.
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Detect currency code by scanning glyphs. First hit wins.
  let code = "USD";
  for (const [re, c] of CURRENCY_GLYPHS) {
    if (re.test(s)) { code = c; break; }
  }
  // Strip non-numeric (keep digits + decimal point).
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return null;

  const rate = rates[code] ?? FX_FALLBACK[code] ?? 1;
  return num / rate;
}

/** Fetches /forex on mount + every 10min. Returns live rates (or fallback). */
function useFxRates(): FxRates {
  const [rates, setRates] = useState<FxRates>(FX_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ rates: FxRates }>("/forex", { silent: true });
        if (!cancelled && d.rates) setRates({ ...FX_FALLBACK, ...d.rates });
      } catch { /* keep fallback */ }
    }
    void run();
    const h = setInterval(run, 10 * 60_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);
  return rates;
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

      {/* Top section (~55%): stats + JA act + EN act on the left, combined
          JA+EN viewer chart on the right.
          Bottom section (~45%): Theme Timeline / Comments / Utterances / Director. */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-2">

        {/* TOP */}
        <div className="flex-[1.7] min-h-0 grid grid-cols-12 gap-2">
          <PanelFrame className="col-span-3" title="Status" accent="#a855f7">
            <StatsPanel
              byChannel={byChannel}
              yunaState={yunaState}
              connected={connected}
              loading={loading}
              nowMs={now}
            />
          </PanelFrame>

          <PanelFrame className="col-span-9" accent="#22d3ee">
            <ChartsGallery />
          </PanelFrame>
        </div>

        {/* BOTTOM — 4 panels, each internally split into JA | EN columns */}
        <div className="flex-1 min-h-0 grid grid-cols-4 gap-2">
          <PanelFrame title="Theme Timeline" accent="#fbbf24">
            <ChannelSplit>
              <ThemeTimelineColumn channel="ja" data={byChannel.ja} loading={loading} />
              <ThemeTimelineColumn channel="en" data={byChannel.en} loading={loading} />
            </ChannelSplit>
          </PanelFrame>
          <PanelFrame title="Comments" accent="#38bdf8">
            <ChannelSplit>
              <CommentsFeedColumn channel="ja" data={byChannel.ja} loading={loading} />
              <CommentsFeedColumn channel="en" data={byChannel.en} loading={loading} />
            </ChannelSplit>
          </PanelFrame>
          <PanelFrame title="YUNA Utterances" accent="#c084fc">
            <ChannelSplit>
              <UtterancesFeedColumn channel="ja" data={byChannel.ja} loading={loading} />
              <UtterancesFeedColumn channel="en" data={byChannel.en} loading={loading} />
            </ChannelSplit>
          </PanelFrame>
          <PanelFrame title="Director" accent="#fb7185">
            <ChannelSplit>
              <DirectorColumn channel="ja" data={byChannel.ja} loading={loading} />
              <DirectorColumn channel="en" data={byChannel.en} loading={loading} />
            </ChannelSplit>
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}

/** Renders two children side-by-side with a thin vertical divider and
    a small JA/EN header on each side. */
function ChannelSplit({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  return (
    <div className="grid grid-cols-2 gap-0 h-full">
      <div className="pr-1 flex flex-col min-h-0">
        <div className="shrink-0 mb-1 text-[9px] font-semibold tracking-[0.2em]" style={{ color: CHANNEL_COLOR.ja }}>JA</div>
        <div className="flex-1 min-h-0">{children[0]}</div>
      </div>
      <div className="pl-1 border-l border-white/5 flex flex-col min-h-0">
        <div className="shrink-0 mb-1 text-[9px] font-semibold tracking-[0.2em]" style={{ color: CHANNEL_COLOR.en }}>EN</div>
        <div className="flex-1 min-h-0">{children[1]}</div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Per-channel column variants (used inside ChannelSplit)        */
/* ============================================================= */

function ThemeTimelineColumn({ channel, data, loading }: { channel: Channel; data: ChannelLive | null; loading?: boolean }) {
  const segments = useMemo(
    () => buildThemeHistory(data?.monitor?.directorIters ?? []),
    [data?.monitor?.directorIters],
  );
  if (segments.length === 0) return loading && !data ? <Loader /> : <Empty label="no themes" />;
  const first = segments[0]!.startedAt;
  const last = segments[segments.length - 1]!.endedAt ?? Date.now();
  const span = Math.max(1, last - first);
  const color = CHANNEL_COLOR[channel];
  return (
    <div className="flex flex-col gap-1 h-full overflow-y-auto scrollbar-none">
      {segments.slice().reverse().map((seg, i) => {
        const end = seg.endedAt ?? last;
        const widthPct = ((end - seg.startedAt) / span) * 100;
        const isCurrent = seg.endedAt === null;
        return (
          <div
            key={i}
            title={seg.theme}
            className="rounded-sm px-1.5 py-1 text-[10px] overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              background: isCurrent ? `${color}30` : `${color}12`,
              color,
              borderLeft: `2px solid ${color}`,
              boxShadow: isCurrent ? `0 0 8px ${color}33` : undefined,
            }}
          >
            <span className="opacity-60 mr-1 tabular-nums text-[9px]">
              {Math.max(1, Math.round(widthPct))}%
            </span>
            {seg.theme}
          </div>
        );
      })}
    </div>
  );
}

function CommentsFeedColumn({ channel, data, loading }: { channel: Channel; data: ChannelLive | null; loading?: boolean }) {
  const rows = useMemo(() => {
    const filtered: Record<Channel, ChannelLive | null> = { ja: null, en: null };
    filtered[channel] = data;
    return mergeComments(filtered);
  }, [channel, data]);
  if (rows.length === 0) return loading && !data ? <Loader /> : <Empty label="no comments" />;
  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full scrollbar-none">
      {rows.map((c) => (
        <div
          key={c.id}
          onClick={() => openCommentDetail(c)}
          className={[
            "rounded-md px-1.5 py-1 text-[11px] border transition cursor-pointer",
            c.isSuperchat
              ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_8px_rgba(251,191,36,0.2)]"
              : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          <div className="flex items-center gap-1 text-[9px]">
            {c.isSuperchat && <span className="text-amber-300">★ {c.amount ?? ""}</span>}
            <span className="text-text-muted truncate">{c.user}</span>
            <span className="ml-auto tabular-nums text-text-faint">{formatTimeShort(c.at)}</span>
          </div>
          <div className="text-text break-all leading-snug">{c.text}</div>
        </div>
      ))}
    </div>
  );
}

function UtterancesFeedColumn({ channel, data, loading }: { channel: Channel; data: ChannelLive | null; loading?: boolean }) {
  type Row = {
    id: string;
    texts: string[];
    expression?: string;
    isReply: boolean;
    at: number;
    /** full DB talker result when available — powers the detail modal */
    talker?: TalkerResult;
    /** raw speak payload when only the WS event is known */
    speakPayload?: Record<string, unknown>;
  };
  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    const put = (key: string, r: Row) => { if (!byKey.has(key)) byKey.set(key, r); };
    if (!data) return [];
    // Dedup: same utterance text collapses across DB monitor talker
    // result and WS speak event. Timestamp bucketed to a minute so
    // DB-vs-WS clock skew doesn't split into two rows.
    (data.monitor?.talkerResults ?? []).forEach((t) => {
      const texts = t.utterances.map(u => u.text);
      const at = Date.parse(t.created_at);
      const bucket = Math.floor(at / 60_000);
      const key = `${bucket}|${texts.join("|")}`;
      put(key, {
        id: key,
        texts,
        expression: t.utterances[0]?.expression,
        isReply: Boolean(t.comment_text),
        at,
        talker: t,
      });
    });
    for (const e of data.events) {
      if (e.event_type !== "speak") continue;
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      const us = Array.isArray(p["utterances"]) ? p["utterances"] as Array<Record<string, unknown>> : [];
      const texts = us.map(u => String(u["text"] ?? ""));
      const at = Date.parse(e.recorded_at);
      const bucket = Math.floor(at / 60_000);
      const key = `${bucket}|${texts.join("|")}`;
      put(key, {
        id: key,
        texts,
        expression: us[0]?.["expression"] as string | undefined,
        isReply: Boolean(us[0]?.["comment"]),
        at,
        speakPayload: p,
      });
    }
    return [...byKey.values()].sort((a, b) => b.at - a.at).slice(0, 25);
  }, [data]);

  if (rows.length === 0) return loading && !data ? <Loader /> : <Empty label="no utterances" />;
  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full scrollbar-none">
      {rows.map((r) => (
        <div
          key={r.id}
          onClick={() => openUtteranceDetail(channel, r)}
          className="rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-1 hover:bg-white/[0.05] transition cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[9px]">
            {r.expression && <span className="rounded bg-fuchsia-500/10 text-fuchsia-300 px-1">{r.expression}</span>}
            {r.isReply && <span className="text-cyan-300">reply</span>}
            <span className="ml-auto tabular-nums text-text-faint">{formatTimeShort(r.at)}</span>
          </div>
          {r.texts.map((t, i) => (
            <div key={i} className="text-[11px] text-text leading-snug break-all">{t}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function openUtteranceDetail(
  channel: Channel,
  row: { texts: string[]; expression?: string; isReply: boolean; at: number; talker?: TalkerResult; speakPayload?: Record<string, unknown> },
): void {
  modal.open({
    title: `YUNA ${CHANNEL_LABEL[channel]} utterance`,
    size: "lg",
    content: <UtteranceDetail channel={channel} row={row} />,
  });
}

function UtteranceDetail({
  channel, row,
}: {
  channel: Channel;
  row: { texts: string[]; expression?: string; isReply: boolean; at: number; talker?: TalkerResult; speakPayload?: Record<string, unknown> };
}) {
  const t = row.talker;
  const p = row.speakPayload;
  // pull fields from whichever source is richer (DB monitor first, then WS speak payload)
  type UtteranceView = { text: string; expression?: string; isReply?: boolean };
  const utterances: UtteranceView[] = t
    ? t.utterances
    : Array.isArray(p?.["utterances"])
      ? (p!["utterances"] as Array<Record<string, unknown>>).map(u => ({
          text: String(u["text"] ?? ""),
          expression: u["expression"] as string | undefined,
          isReply: Boolean(u["comment"]),
        }))
      : row.texts.map(text => ({ text }));
  const commentText = t?.comment_text ?? null;
  const commentUser = t?.comment_user ?? null;
  const model = t?.model ?? null;
  const cost = t ? safeNum(t.cost) : null;
  const emotionDelta = t ? safeNum(t.emotion_delta) : null;

  return (
    <div className="space-y-4 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <Kv label="Channel" value={CHANNEL_LABEL[channel]} accent={CHANNEL_COLOR[channel]} />
        <Kv label="Time"    value={new Date(row.at).toLocaleString()} />
        {model && <Kv label="Model" value={model} />}
        {cost != null && <Kv label="Cost" value={`$${cost.toFixed(4)}`} accent="#fbbf24" />}
        {emotionDelta != null && <Kv label="Emotion Δ" value={emotionDelta.toFixed(3)} accent={emotionDelta >= 0 ? "#10b981" : "#ef4444"} />}
        <Kv label="Source" value={t ? "DB (talker_result)" : "WS (speak event)"} />
      </div>

      {(commentText || commentUser) && (
        <Section title="Responding to comment" accent="#38bdf8">
          {commentUser && <div className="text-[11px] text-cyan-300 mb-0.5">{commentUser}</div>}
          {commentText && <div className="text-text whitespace-pre-wrap">{commentText}</div>}
        </Section>
      )}

      <Section title="Utterances" accent="#c084fc">
        <div className="space-y-2">
          {utterances.map((u, i) => (
            <div key={i} className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
              <div className="flex items-center gap-1 text-[9px] mb-0.5">
                {u.expression && <span className="rounded bg-fuchsia-500/10 text-fuchsia-300 px-1">{u.expression}</span>}
                {u.isReply && <span className="text-cyan-300">reply</span>}
              </div>
              <div className="text-text whitespace-pre-wrap leading-relaxed">{u.text}</div>
            </div>
          ))}
        </div>
      </Section>

      {t?.recalled_memories != null && t.recalled_memories !== "" && (
        <RawJson label="recalled_memories" value={t.recalled_memories} />
      )}
      {t?.prompt && <RawJson label="prompt" value={t.prompt} />}
    </div>
  );
}

function DirectorColumn({ channel, data, loading }: { channel: Channel; data: ChannelLive | null; loading?: boolean }) {
  const rows = useMemo(() => {
    const iters = data?.monitor?.directorIters ?? [];
    return [...iters]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 12)
      .map((it) => {
        const info = extractDirectorInfo(it);
        return {
          it,
          id: `${it.created_at}-${it.iteration}`,
          at: Date.parse(it.created_at),
          theme: info.theme ?? "—",
          pick: info.pickComments ?? 0,
          close: info.shouldClose,
          emergency: Boolean(it.emergency_reason),
          cost: safeNum(it.cost),
          iter: it.iteration,
        };
      });
  }, [data]);
  if (rows.length === 0) return loading && !data ? <Loader /> : <Empty label="no director" />;
  return (
    <div className="overflow-y-auto h-full scrollbar-none">
      <table className="w-full text-[10px]">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => openDirectorDetail(channel, r.it)}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.05] transition cursor-pointer"
            >
              <td className="py-1 px-1 tabular-nums text-text-faint w-12">{formatTimeShort(r.at)}</td>
              <td className="py-1 px-1 tabular-nums text-text-muted w-6">#{r.iter}</td>
              <td className="py-1 px-1 text-text truncate max-w-[120px]" title={r.theme}>{r.theme}</td>
              <td className="py-1 px-1 w-10">
                {r.close && <span className="rounded bg-amber-500/20 text-amber-300 px-1 text-[9px]">close</span>}
                {r.emergency && <span className="ml-0.5 rounded bg-rose-500/20 text-rose-300 px-1 text-[9px]">emg</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function openDirectorDetail(channel: Channel, it: DirectorIter): void {
  const info = extractDirectorInfo(it);
  modal.open({
    title: `Director ${CHANNEL_LABEL[channel]} · iter #${it.iteration}`,
    size: "lg",
    content: <DirectorDetail channel={channel} it={it} info={info} />,
  });
}

function openCommentDetail(c: UiComment): void {
  modal.open({
    title: `Comment · ${c.user}`,
    size: "lg",
    content: <CommentDetail comment={c} />,
  });
}

interface PersonDetailResp {
  person: {
    id: string;
    primary_name: string;
    nickname: string | null;
    my_nickname: string | null;
    type: string;
    note: string | null;
    interaction_count: number;
    familiarity: number;
    sentiment: number;
    trust: number;
    gratitude: number;
    donation_total: number;
    relationship_level: number;
    first_seen_at: string;
    last_seen_at: string;
  } | null;
  identities: Array<{
    platform: string;
    platform_user_id: string;
    display_name: string | null;
    verified: boolean;
  }>;
  comments: Array<{
    text: string;
    is_superchat: boolean;
    amount: string | null;
    commented_at: string;
    display_name: string;
    nickname: string | null;
    session_id: string;
    language: string;
    title: string | null;
  }>;
}

function CommentDetail({ comment }: { comment: UiComment }) {
  const [loaded, setLoaded] = useState<PersonDetailResp | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!comment.authorChannelId) {
        setStatus("not_found");
        return;
      }
      try {
        const d = await apiFetch<PersonDetailResp>(
          `/persons/by-identity?platform=youtube&uid=${encodeURIComponent(comment.authorChannelId)}`,
          { silent: true },
        );
        if (cancelled) return;
        setLoaded(d);
        setStatus(d.person ? "ok" : "not_found");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [comment.authorChannelId]);

  const p = loaded?.person;

  return (
    <div className="space-y-4 text-[12px]">
      {/* the clicked comment itself */}
      <Section title="This comment" accent={comment.isSuperchat ? "#fbbf24" : "#38bdf8"}>
        <div className="flex items-center gap-2 text-[10px] text-text-muted mb-1">
          <span className="rounded px-1 text-[9px] font-semibold"
            style={{ color: CHANNEL_COLOR[comment.channel], background: `${CHANNEL_COLOR[comment.channel]}18` }}>
            {CHANNEL_LABEL[comment.channel]}
          </span>
          {comment.isSuperchat && <span className="text-amber-300">★ {comment.amount ?? ""}</span>}
          <span className="tabular-nums">{new Date(comment.at).toLocaleString()}</span>
        </div>
        <div className="text-text whitespace-pre-wrap">{comment.text}</div>
      </Section>

      {status === "loading" && <Loader />}

      {status === "not_found" && (
        <Section title="User" accent="#94a3b8">
          <div className="text-[12px] text-text-muted">
            {comment.authorChannelId
              ? "このユーザーは DB にまだ存在しません"
              : "authorChannelId が取得できませんでした"}
          </div>
          {comment.authorChannelId && (
            <div className="mt-1 text-[10px] text-text-faint break-all">
              youtube : {comment.authorChannelId}
            </div>
          )}
        </Section>
      )}

      {status === "error" && (
        <Section title="User" accent="#ef4444">
          <div className="text-rose-300 text-[12px]">lookup failed</div>
        </Section>
      )}

      {status === "ok" && p && (
        <>
          <Section title="User" accent={CHANNEL_COLOR[comment.channel]}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-text">{p.primary_name}</div>
                {p.nickname && <div className="text-[11px] text-text-muted">({p.nickname})</div>}
                {p.note && <div className="mt-1 text-[11px] text-text-muted whitespace-pre-wrap">{p.note}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[9px] uppercase tracking-wider text-text-faint">Lv.</div>
                <div className="text-2xl font-bold tabular-nums text-fuchsia-300"
                  style={{ textShadow: "0 0 10px rgba(232,121,249,0.5)" }}>
                  {p.relationship_level}
                </div>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-3 gap-2">
            <Kv label="Fam"     value={safeNum(p.familiarity).toFixed(2)} />
            <Kv label="Trust"   value={safeNum(p.trust).toFixed(2)} />
            <Kv label="Sent"    value={safeNum(p.sentiment).toFixed(2)} />
            <Kv label="Grat"    value={safeNum(p.gratitude).toFixed(2)} />
            <Kv label="Donated" value={`$${safeNum(p.donation_total).toFixed(0)}`} accent="#fbbf24" />
            <Kv label="Interactions" value={String(p.interaction_count)} />
          </div>

          {loaded!.identities.length > 0 && (
            <Section title="Identities" accent="#94a3b8">
              <div className="space-y-0.5">
                {loaded!.identities.map((i, idx) => (
                  <div key={idx} className="text-[11px] text-text-muted font-mono break-all">
                    <span className="text-text">{i.platform}</span> · {i.platform_user_id}
                    {i.display_name && <span className="text-text-faint"> · {i.display_name}</span>}
                    {i.verified && <span className="text-cyan-400"> ✓</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title={`Past comments (${loaded!.comments.length})`} accent="#38bdf8">
            {loaded!.comments.length === 0 ? (
              <div className="text-[11px] text-text-faint italic">配信コメント DB に履歴なし</div>
            ) : (
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto scrollbar-none">
                {loaded!.comments.map((row, i) => (
                  <div
                    key={i}
                    className={[
                      "rounded-md px-2 py-1 text-[11px] border",
                      row.is_superchat
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-white/[0.02] border-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
                      <span className="rounded px-1 text-[9px] font-semibold"
                        style={{ color: row.language === "ja" ? CHANNEL_COLOR.ja : CHANNEL_COLOR.en, background: `${row.language === "ja" ? CHANNEL_COLOR.ja : CHANNEL_COLOR.en}18` }}>
                        {row.language.toUpperCase()}
                      </span>
                      {row.is_superchat && <span className="text-amber-300">★ {row.amount ?? ""}</span>}
                      {row.title && <span className="truncate max-w-[200px]" title={row.title}>{row.title}</span>}
                      <span className="ml-auto tabular-nums">{new Date(row.commented_at).toLocaleString()}</span>
                    </div>
                    <div className="text-text break-all">{row.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function DirectorDetail({
  channel, it, info,
}: {
  channel: Channel;
  it: DirectorIter;
  info: ReturnType<typeof extractDirectorInfo>;
}) {
  return (
    <div className="space-y-4 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <Kv label="Channel"    value={CHANNEL_LABEL[channel]} accent={CHANNEL_COLOR[channel]} />
        <Kv label="Iteration"  value={`#${it.iteration}`} />
        <Kv label="Time"       value={new Date(it.created_at).toLocaleString()} />
        <Kv label="Phase"      value={it.phase} />
        <Kv label="Cost"       value={`$${safeNum(it.cost).toFixed(4)}`} accent="#fbbf24" />
        <Kv label="Done"       value={it.done ? "yes" : "no"} />
        {info.pickComments != null && <Kv label="pickComments" value={String(info.pickComments)} />}
        <Kv label="shouldClose" value={info.shouldClose ? "yes" : "no"} accent={info.shouldClose ? "#fbbf24" : undefined} />
      </div>

      {info.theme && (
        <Section title="Current theme" accent="#fb7185">
          <div className="text-[14px] font-semibold text-text">{info.theme}</div>
          {info.themeDirection && (
            <div className="mt-1 text-[12px] text-text-muted whitespace-pre-wrap">{info.themeDirection}</div>
          )}
        </Section>
      )}

      {it.emergency_reason && (
        <Section title="Emergency reason" accent="#f43f5e">
          <div className="text-rose-300 whitespace-pre-wrap">{it.emergency_reason}</div>
        </Section>
      )}

      {it.thinking && (
        <Section title="Thinking" accent="#22d3ee">
          <div className="text-text-soft whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto scrollbar-none">
            {it.thinking}
          </div>
        </Section>
      )}

      <RawJson label="action_results" value={it.action_results} />
      <RawJson label="actions"        value={it.actions} />
    </div>
  );
}

function Kv({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.15em] text-text-faint">{label}</div>
      <div
        className="mt-0.5 text-[13px] font-medium tabular-nums break-all"
        style={accent ? { color: accent, textShadow: `0 0 8px ${accent}44` } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, accent = "#22d3ee", children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block h-1 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: `${accent}cc` }}>{title}</div>
      </div>
      <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">{children}</div>
    </div>
  );
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <details className="rounded-md border border-white/5 bg-white/[0.02] group">
      <summary className="cursor-pointer px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-text-faint select-none">
        {label}
      </summary>
      <pre className="px-3 pb-2 text-[11px] text-text-muted whitespace-pre-wrap break-all max-h-48 overflow-y-auto scrollbar-none">
        {body}
      </pre>
    </details>
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
/*  Stats panel: per-channel status + 6 aggregate KPIs + WS/clock */
/* ============================================================= */

function StatsPanel({
  byChannel, yunaState, connected, loading, nowMs,
}: {
  byChannel: Record<Channel, ChannelLive | null>;
  yunaState: YunaState | null;
  connected: boolean;
  loading: boolean;
  nowMs: number;
}) {
  const fxRates = useFxRates();
  const channelInfo = (ch: Channel) => {
    const c = byChannel[ch];
    const status = c?.status?.status ?? "idle";
    const started = c?.monitor?.stream.started_at ? Date.parse(c.monitor.stream.started_at) : 0;
    const elapsed = started ? nowMs - started : 0;
    const active = status !== "idle" && started > 0;
    return { status, elapsed, active, title: c?.status?.title ?? c?.monitor?.stream.title ?? "" };
  };
  const ja = channelInfo("ja");
  const en = channelInfo("en");

  const category = yunaState?.emotion?.category ?? "—";

  // Preferred source: admin-db.stream_events (the raw Redis log),
  // aggregated client-side. yuna-api's stream_comments table is not
  // always populated (save path can silently drop), so we fall back
  // to monitor.counts only when the event aggregation gives zero.
  const counts = (ch: Channel) => byChannel[ch]?.monitor?.counts;
  const monitorSum = (key: keyof Counts) =>
    safeNum(counts("ja")?.[key]) + safeNum(counts("en")?.[key]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fxRates intentionally in deps
  const aggFromEvents = useMemo(() => {
    const agg = { comments: 0, superchat: 0, superUsd: 0, viewers: new Set<string>() };
    for (const ch of CHANNELS) {
      const events = byChannel[ch]?.events ?? [];
      for (const e of events) {
        if (e.event_type !== "comments") continue;
        const p = e.payload as Record<string, unknown> | null;
        if (!p) continue;
        agg.comments += 1;
        const key = typeof p["authorChannelId"] === "string" ? p["authorChannelId"]
                  : typeof p["user"] === "string"           ? p["user"]
                  : null;
        if (key) agg.viewers.add(`${ch}:${key}`);
        if (p["isSuperchat"]) {
          agg.superchat += 1;
          const usd = toUsd(p["amount"], fxRates);
          if (usd !== null) agg.superUsd += usd;
        }
      }
    }
    return { comments: agg.comments, superchat: agg.superchat, superUsd: agg.superUsd, viewers: agg.viewers.size };
  }, [byChannel, fxRates]);

  const totalComments = aggFromEvents.comments || monitorSum("comment_count");
  const totalViewers  = aggFromEvents.viewers  || monitorSum("unique_viewers");
  const totalSuper    = aggFromEvents.superchat || monitorSum("superchat_count");
  const totalSuperUsd = aggFromEvents.superUsd ||
    safeNum(counts("ja")?.superchat_total) + safeNum(counts("en")?.superchat_total);
  const todayCost = yunaState?.todayCostUsd;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* top utility row: WS + clock */}
      <div className="shrink-0 flex items-center justify-end gap-3 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-cyan-400 animate-pulse" : "bg-red-500"}`}
            style={connected ? { boxShadow: "0 0 8px #22d3ee" } : {}}
          />
          <span className={connected ? "text-cyan-300" : "text-red-400"}>
            {connected ? "WS ONLINE" : "WS OFFLINE"}
          </span>
          {loading && <span className="text-text-faint">·</span>}
        </div>
        <div className="tabular-nums text-text-muted">
          {new Date(nowMs).toLocaleTimeString()}
        </div>
      </div>

      {/* JA / EN per-channel cards */}
      <div className="shrink-0 grid grid-cols-2 gap-2 text-[11px]">
        {(["ja", "en"] as Channel[]).map((ch) => {
          const r = ch === "ja" ? ja : en;
          const pal = phasePalette(r.status);
          const color = CHANNEL_COLOR[ch];
          return (
            <div
              key={ch}
              className="rounded-md border px-2.5 py-2 flex items-center justify-between transition"
              style={{
                background: "#0b1120cc",
                borderColor: `${color}33`,
                boxShadow: r.active ? `0 0 14px -4px ${color}66, 0 0 1px ${color}66 inset` : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm" style={{ color, textShadow: `0 0 8px ${color}66` }}>
                  {CHANNEL_LABEL[ch]}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] ${pal.bg} ${pal.fg}`}>
                  {pal.label}
                </span>
              </div>
              <span className="tabular-nums text-[13px] font-medium" style={{ color }}>
                {r.active ? formatElapsed(r.elapsed) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* 6-KPI grid */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-px bg-white/5 rounded-md overflow-hidden border border-white/5">
        <MiniKpi label="Comments" value={totalComments}       accent="#22d3ee" />
        <MiniKpi label="Viewers"  value={totalViewers}        accent="#22d3ee" />
        <MiniKpi label="Super"    value={totalSuper}          accent="#fbbf24" />
        <MiniKpi label="Super $"  value={`$${totalSuperUsd.toFixed(0)}`} accent="#fbbf24" />
        <MiniKpi label="Emotion"  value={category}            accent="#e879f9" />
        <MiniKpi label="Today $"  value={todayCost == null ? "—" : `$${safeNum(todayCost).toFixed(2)}`} accent="#34d399" />
      </div>
    </div>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-[#0b1120]/90 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.15em] text-text-faint">{label}</div>
      <div
        className="mt-0.5 text-sm font-semibold tabular-nums truncate"
        style={{ color: accent, textShadow: `0 0 8px ${accent}44` }}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Timeframe chart (activity / viewers, selectable candle width) */
/* ============================================================= */

const TIMEFRAMES: Array<{ label: string; bucketMinutes: number }> = [
  { label: "1m",  bucketMinutes: 1 },
  { label: "15m", bucketMinutes: 15 },
  { label: "1h",  bucketMinutes: 60 },
  { label: "4h",  bucketMinutes: 240 },
  { label: "24h", bucketMinutes: 1440 },
];

interface ActivitySeriesResp {
  channel: Channel;
  bucketMinutes: number;
  buckets: number;
  kind: "activity" | "viewers";
  series: Array<{ t: number } & Record<string, number>>;
}

function refreshIntervalMs(bucketMinutes: number): number {
  // Refresh ~1/10 of a bucket so the latest bar updates smoothly, clamped.
  return Math.max(5_000, Math.min(bucketMinutes * 60_000 / 10, 60_000));
}

function TimeframeChart({
  channel, kind, color, compact = false,
}: {
  channel: Channel;
  kind: "activity" | "viewers";
  color: string;
  /** When true, hide the timeframe tab bar and shrink paddings/axes. */
  compact?: boolean;
}) {
  // Default to 15m: 30 × 15 min = 7.5 hour window, captures a typical
  // recent session even if YUNA is currently idle. 1m is for live mode.
  const [tfIdx, setTfIdx] = useState(1);
  const tf = TIMEFRAMES[tfIdx]!;
  const [data, setData] = useState<ActivitySeriesResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    async function fetchOnce() {
      try {
        const d = await apiFetch<ActivitySeriesResp>(
          `/stream/activity?channel=${channel}&kind=${kind}&bucketMinutes=${tf.bucketMinutes}&buckets=30`,
          { silent: true },
        );
        if (!cancelled) { setData(d); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    }
    void fetchOnce();
    const h = setInterval(fetchOnce, refreshIntervalMs(tf.bucketMinutes));
    return () => { cancelled = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, kind, tf.bucketMinutes]);

  const gid = `tc-${channel}-${kind}-${color.replace("#", "")}`;
  const series = data?.series ?? [];
  const isActivity = kind === "activity";
  const hasData = series.some(s =>
    isActivity
      ? (Number(s["comments"] ?? 0) + Number(s["utterances"] ?? 0)) > 0
      : (Number(s["avg"] ?? 0) + Number(s["max"] ?? 0)) > 0,
  );
  const windowLabel = (() => {
    const total = tf.bucketMinutes * 30;
    if (total >= 1440) return `${Math.round(total / 1440)}日`;
    if (total >= 60) return `${Math.round(total / 60)}時間`;
    return `${total}分`;
  })();

  return (
    <div className="flex flex-col h-full">
      {!compact && (
        <div className="shrink-0 flex items-center gap-1 text-[10px] mb-1">
          {TIMEFRAMES.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setTfIdx(i)}
              className={[
                "px-1.5 py-0.5 rounded tabular-nums tracking-wide transition",
                i === tfIdx
                  ? "text-[#05070d] font-semibold"
                  : "text-text-muted hover:text-text",
              ].join(" ")}
              style={i === tfIdx ? { background: color, boxShadow: `0 0 8px ${color}aa` } : { background: "transparent" }}
            >
              {t.label}足
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint">
            loading…
          </div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
            過去{windowLabel}の活動なし
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${gid}-b`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c084fc" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#c084fc" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => formatBucketTick(Number(v), tf.bucketMinutes)}
              stroke="#64748b"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} width={22} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0b1120", border: `1px solid ${color}66`, fontSize: 11 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            />
            {isActivity ? (
              <>
                <Area type="monotone" dataKey="comments"   stroke={color}   strokeWidth={1.6} fill={`url(#${gid})`}   isAnimationActive={false} />
                <Area type="monotone" dataKey="utterances" stroke="#c084fc" strokeWidth={1.2} fill={`url(#${gid}-b)`} isAnimationActive={false} />
              </>
            ) : (
              <>
                <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.6} fill={`url(#${gid})`} isAnimationActive={false} />
                <Area type="monotone" dataKey="max" stroke="#c084fc" strokeWidth={1.0} fill={`url(#${gid}-b)`} isAnimationActive={false} strokeDasharray="3 3" />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {!isActivity && !loading && !hasData && (
        <div className="shrink-0 text-[9px] text-text-faint mt-0.5 text-center">viewers source未接続</div>
      )}
    </div>
  );
}

function formatBucketTick(ms: number, bucketMinutes: number): string {
  const d = new Date(ms);
  if (bucketMinutes >= 1440) {
    return d.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
  }
  if (bucketMinutes >= 60) {
    return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ============================================================= */
/*  Combined JA + EN viewers chart                                */
/* ============================================================= */

interface CombinedPoint {
  t: number;
  ja: number;
  ja_max: number;
  en: number;
  en_max: number;
}

function CombinedViewersChart({ compact = false }: { compact?: boolean } = {}) {
  const [tfIdx, setTfIdx] = useState(1); // 15m default
  const tf = TIMEFRAMES[tfIdx]!;
  const [series, setSeries] = useState<CombinedPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function fetchOnce() {
      try {
        const qs = `kind=viewers&bucketMinutes=${tf.bucketMinutes}&buckets=30`;
        const [ja, en] = await Promise.all([
          apiFetch<ActivitySeriesResp>(`/stream/activity?channel=ja&${qs}`, { silent: true }),
          apiFetch<ActivitySeriesResp>(`/stream/activity?channel=en&${qs}`, { silent: true }),
        ]);
        if (cancelled) return;
        const enByT = new Map(en.series.map(s => [s.t, s]));
        const merged: CombinedPoint[] = ja.series.map(j => {
          const e = enByT.get(j.t);
          return {
            t: j.t,
            ja: Number(j["avg"] ?? 0),
            ja_max: Number(j["max"] ?? 0),
            en: Number(e?.["avg"] ?? 0),
            en_max: Number(e?.["max"] ?? 0),
          };
        });
        setSeries(merged);
        setLoading(false);
      } catch { if (!cancelled) setLoading(false); }
    }
    void fetchOnce();
    const h = setInterval(fetchOnce, refreshIntervalMs(tf.bucketMinutes));
    return () => { cancelled = true; clearInterval(h); };
  }, [tf.bucketMinutes]);

  const hasData = series.some(s => s.ja + s.en + s.ja_max + s.en_max > 0);

  return (
    <div className="flex flex-col h-full">
      {!compact && (
        <div className="shrink-0 flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-3 text-[10px]">
            <Legend color={CHANNEL_COLOR.ja} label="JA" />
            <Legend color={CHANNEL_COLOR.en} label="EN" />
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {TIMEFRAMES.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTfIdx(i)}
                className={[
                  "px-1.5 py-0.5 rounded tabular-nums tracking-wide transition",
                  i === tfIdx ? "text-[#05070d] font-semibold" : "text-text-muted hover:text-text",
                ].join(" ")}
                style={
                  i === tfIdx
                    ? { background: "#e879f9", boxShadow: "0 0 8px #e879f9aa" }
                    : { background: "transparent" }
                }
              >
                {t.label}足
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-text-faint">loading…</div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-text-faint pointer-events-none z-10 text-center">
            viewers source 未接続<br />
            <span className="text-[9px] mt-1">stream:{`{ja,en}`}:viewers に count を publish すると表示されます</span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cv-ja" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHANNEL_COLOR.ja} stopOpacity={0.55} />
                <stop offset="100%" stopColor={CHANNEL_COLOR.ja} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cv-en" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHANNEL_COLOR.en} stopOpacity={0.55} />
                <stop offset="100%" stopColor={CHANNEL_COLOR.en} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => formatBucketTick(Number(v), tf.bucketMinutes)}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0b1120", border: "1px solid #e879f966", fontSize: 11 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            />
            <Area type="monotone" dataKey="ja" name="JA viewers" stroke={CHANNEL_COLOR.ja} strokeWidth={1.6} fill="url(#cv-ja)" isAnimationActive={false} />
            <Area type="monotone" dataKey="en" name="EN viewers" stroke={CHANNEL_COLOR.en} strokeWidth={1.6} fill="url(#cv-en)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ color }}>{label}</span>
    </div>
  );
}

/* ============================================================= */
/*  Charts gallery: mini rail (click to select) + big selected    */
/* ============================================================= */

type ChartId = "ja-activity" | "en-activity" | "viewers";

interface ChartMeta {
  id: ChartId;
  label: string;
  accent: string;
}

const CHARTS: ChartMeta[] = [
  { id: "ja-activity", label: "JA Activity",     accent: CHANNEL_COLOR.ja },
  { id: "en-activity", label: "EN Activity",     accent: CHANNEL_COLOR.en },
  { id: "viewers",     label: "JA+EN 同時接続",   accent: "#e879f9" },
];

function ChartsGallery() {
  const [selected, setSelected] = useState<ChartId>("viewers");

  return (
    <div className="flex h-full gap-2">
      {/* Mini rail — full TimeframeChart / CombinedViewersChart with
          tabs hidden (compact). Tile becomes clickable via an absolute
          overlay so the chart itself still interacts (tooltip etc). */}
      <div className="shrink-0 w-60 flex flex-col gap-2">
        {CHARTS.map((c) => (
          <MiniChartTile
            key={c.id}
            chart={c}
            selected={selected === c.id}
            onClick={() => setSelected(c.id)}
          />
        ))}
      </div>

      {/* Big selected chart */}
      <div className="flex-1 min-w-0">
        {selected === "viewers" && <CombinedViewersChart />}
        {selected === "ja-activity" && (
          <TimeframeChart channel="ja" kind="activity" color={CHANNEL_COLOR.ja} />
        )}
        {selected === "en-activity" && (
          <TimeframeChart channel="en" kind="activity" color={CHANNEL_COLOR.en} />
        )}
      </div>
    </div>
  );
}

function MiniChartTile({
  chart, selected, onClick,
}: {
  chart: ChartMeta;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="relative flex-1 min-h-0 rounded-md border overflow-hidden transition flex flex-col"
      style={{
        background: selected ? `${chart.accent}10` : "#0b112066",
        borderColor: selected ? `${chart.accent}99` : "#ffffff10",
        boxShadow: selected ? `0 0 16px -4px ${chart.accent}88, 0 0 1px ${chart.accent}88 inset` : undefined,
      }}
    >
      <div className="shrink-0 flex items-center justify-between px-2 pt-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: selected ? chart.accent : `${chart.accent}cc` }}
        >
          {chart.label}
        </span>
        {selected && (
          <span className="text-[8px] text-text-faint uppercase tracking-wider">viewing</span>
        )}
      </div>
      <div className="flex-1 min-h-0 px-1.5 pb-1.5">
        {chart.id === "viewers" && <CombinedViewersChart compact />}
        {chart.id === "ja-activity" && (
          <TimeframeChart channel="ja" kind="activity" color={CHANNEL_COLOR.ja} compact />
        )}
        {chart.id === "en-activity" && (
          <TimeframeChart channel="en" kind="activity" color={CHANNEL_COLOR.en} compact />
        )}
      </div>
      {/* click overlay — doesn't block tooltip */}
      <button
        onClick={onClick}
        className="absolute inset-0 cursor-pointer"
        aria-label={`Show ${chart.label}`}
        style={{ background: "transparent" }}
      />
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
  return extractDirectorInfo(it).theme ?? null;
}

/**
 * yuna-core saves director output inside action_results[0].result as a
 * JSON string (see Yuna/src/cognition/stream/programs/chat/director/*).
 * Shape: `[{ tool: "director", params: {}, result: '{"currentTheme":...}' }]`
 * This helper normalizes both shapes (stringified payload + legacy
 * object-in-actions) and returns just the bits the UI needs.
 */
function extractDirectorInfo(it: DirectorIter): {
  theme: string | null;
  themeDirection: string | null;
  pickComments: number | null;
  shouldClose: boolean;
} {
  const result = {
    theme: null as string | null,
    themeDirection: null as string | null,
    pickComments: null as number | null,
    shouldClose: false,
  };

  // Legacy: actions was an object with currentTheme directly.
  const actions = it.actions as unknown;
  if (actions && typeof actions === "object" && !Array.isArray(actions) && "currentTheme" in actions) {
    const v = (actions as { currentTheme?: unknown }).currentTheme;
    if (typeof v === "string" && v.trim()) result.theme = v.trim();
  }

  // Current format: action_results[0].result is a JSON-stringified
  // payload { currentTheme, themeDirection, pickComments, shouldClose }.
  const ar = it.action_results as unknown;
  if (Array.isArray(ar) && ar.length > 0) {
    const first = ar[0] as { result?: unknown };
    const raw = first?.result;
    let parsed: Record<string, unknown> | null = null;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
    } else if (raw && typeof raw === "object") {
      parsed = raw as Record<string, unknown>;
    }
    if (parsed) {
      if (typeof parsed["currentTheme"] === "string" && parsed["currentTheme"].trim()) {
        result.theme = parsed["currentTheme"].trim();
      }
      if (typeof parsed["themeDirection"] === "string") {
        result.themeDirection = parsed["themeDirection"];
      }
      if (typeof parsed["pickComments"] === "number") {
        result.pickComments = parsed["pickComments"];
      }
      result.shouldClose = Boolean(parsed["shouldClose"]);
    }
  }

  return result;
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
  authorChannelId?: string | null;
  personId?: string | null;
}

function mergeComments(byChannel: Record<Channel, ChannelLive | null>): UiComment[] {
  // Dedupe by a natural key (channel + external id + text + at) — the same
  // comment can arrive from the DB monitor payload, the WS event stream,
  // and the periodic hydration poll; React requires stable unique keys.
  const byKey = new Map<string, UiComment>();
  const put = (key: string, c: UiComment) => {
    if (!byKey.has(key)) byKey.set(key, c);
  };
  for (const ch of CHANNELS) {
    const c = byChannel[ch];
    if (!c) continue;
    for (const m of (c.monitor?.comments ?? [])) {
      const idPart = m.author_channel_id ?? m.display_name ?? "?";
      const at = Date.parse(m.commented_at);
      // Unified dedup key: same user + same text collapses across
      // both sources (DB monitor + admin-db raw events). Timestamp
      // is bucketed to a minute so DB-vs-WS clock skew doesn't split.
      const bucket = Math.floor(at / 60_000);
      const key = `${ch}|${idPart}|${m.text}|${bucket}`;
      put(key, {
        id: key,
        channel: ch,
        user: m.nickname || m.display_name,
        text: m.text,
        isSuperchat: m.is_superchat,
        amount: m.amount ?? undefined,
        at,
        authorChannelId: m.author_channel_id ?? null,
        personId: m.person_id ?? null,
      });
    }
    // Dedup between DB snapshot and raw events is handled by the byKey
    // Map below (channel + extId + text). No time-based skip — a single
    // recent DB comment would otherwise hide an entire day of events.
    for (const e of c.events) {
      if (e.event_type !== "comments") continue;
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      const at = Date.parse(e.recorded_at);
      const idPart =
        typeof p["authorChannelId"] === "string" ? p["authorChannelId"] :
        typeof p["user"] === "string"            ? p["user"] :
        "?";
      const text = String(p["text"] ?? "");
      const bucket = Math.floor(at / 60_000);
      const key = `${ch}|${idPart}|${text}|${bucket}`;
      put(key, {
        id: key,
        channel: ch,
        user: String(p["user"] ?? "?"),
        text,
        isSuperchat: Boolean(p["isSuperchat"]),
        amount: p["amount"] as string | undefined,
        at,
        authorChannelId: typeof p["authorChannelId"] === "string" ? p["authorChannelId"] : null,
        personId: typeof p["personId"] === "string" ? p["personId"] : null,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.at - a.at).slice(0, 60);
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
  type Row = {
    id: string; channel: Channel; texts: string[]; expression?: string;
    isReply: boolean; at: number;
  };
  // Dedupe by (channel + joined-text + at); talker DB rows and speak WS
  // events carry the same utterances so without this keys collide.
  const byKey = new Map<string, Row>();
  const put = (key: string, r: Row) => { if (!byKey.has(key)) byKey.set(key, r); };

  for (const ch of CHANNELS) {
    const c = byChannel[ch];
    if (!c) continue;
    (c.monitor?.talkerResults ?? []).forEach((t) => {
      const texts = t.utterances.map(u => u.text);
      const at = Date.parse(t.created_at);
      const key = `${ch}|${at}|${texts.join("|")}`;
      put(key, {
        id: key,
        channel: ch,
        texts,
        expression: t.utterances[0]?.expression,
        isReply: Boolean(t.comment_text),
        at,
      });
    });
    for (const e of c.events) {
      if (e.event_type !== "speak") continue;
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      const us = Array.isArray(p["utterances"]) ? p["utterances"] as Array<Record<string, unknown>> : [];
      const texts = us.map(u => String(u["text"] ?? ""));
      const at = Date.parse(e.recorded_at);
      const key = `${ch}|${at}|${texts.join("|")}`;
      put(key, {
        id: key,
        channel: ch,
        texts,
        expression: us[0]?.["expression"] as string | undefined,
        isReply: Boolean(us[0]?.["comment"]),
        at,
      });
    }
  }
  const top = [...byKey.values()].sort((a, b) => b.at - a.at).slice(0, 25);
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
/*  Empty state                                                   */
/* ============================================================= */

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-24 text-[11px] text-text-faint italic">
      {label}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 6px #22d3ee", animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 6px #22d3ee", animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 6px #22d3ee", animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
