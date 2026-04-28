import { initDb } from "./db/client.js";
import { initSqlite } from "./db/sqlite.js";
import schedulesRoutes from "./routes/schedules.js";
import commentsRoutes from "./routes/comments.js";
import personsRoutes from "./routes/persons.js";
import streamRoutes from "./routes/stream.js";
import streamYouTubeRoutes from "./routes/stream-youtube.js";
import streamYouTubeThumbnailRoutes from "./routes/stream-youtube-thumbnail.js";
import streamYouTubeThumbnailScheduleRoutes from "./routes/stream-youtube-thumbnail-schedule.js";
import forexRoutes from "./routes/forex.js";
import metricsRoutes, { ingestHandler as metricsIngestHandler } from "./routes/metrics.js";
import { primeForex } from "./forex-client.js";
import { startMetricsCollector } from "./metrics-collector.js";
import autoReplyRoutes from "./routes/auto-reply.js";
import aapRoutes from "./routes/additional-auto-play.js";
import programsRoutes from "./routes/programs.js";
import goalsRoutes from "./routes/goals.js";
import memoryRoutes from "./routes/memory.js";
import immediateRulesRoutes from "./routes/immediate-rules.js";
import hypothesesRoutes from "./routes/hypotheses.js";
import stateRoutes from "./routes/state.js";
import pendingActionsRoutes from "./routes/pending-actions.js";
import cycleBlocksRoutes from "./routes/cycle-blocks.js";
import apiUsageRoutes from "./routes/api-usage.js";
import dockerLogsRoutes from "./routes/docker-logs.js";
import ttsReadingRulesRoutes from "./routes/tts-reading-rules.js";
import announcementsRoutes from "./routes/announcements.js";
import videoRoutes, { videoFileHandler } from "./routes/video.js";
import crawlRoutes from "./routes/crawl.js";
import workerDataRoutes from "./routes/worker-data.js";
import tradeRoutes from "./routes/trade.js";
import { query } from "./db/client.js";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cors from "cors";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Redis } from "ioredis";

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env["PORT"] ?? "4100", 10);
const ADMIN_DASHBOARD_PASSWORD = process.env["ADMIN_DASHBOARD_PASSWORD"] ?? "admin";
/**
 * 内部サービス間認証用の長寿命 token. session token とは別系統で、
 * Yuna container 等が固定の Bearer header で /schedules 等を叩くために使う.
 * 未設定なら無効 (session token 必須に戻る).
 */
const ADMIN_SERVICE_TOKEN = process.env["ADMIN_SERVICE_TOKEN"] ?? "";
const REDIS_STREAM_URL = process.env["REDIS_STREAM_URL"] ?? "redis://localhost:6381";

// ── セッション管理（インメモリ） ──
const sessions = new Map<string, number>();
const SESSION_TTL = 24 * 60 * 60 * 1000;

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token ?? "");
    return false;
  }
  return true;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  // session token (人間 dashboard 用) または service token (内部 service 間) で通す.
  if (isValidToken(token)) return next();
  if (ADMIN_SERVICE_TOKEN && token === ADMIN_SERVICE_TOKEN) return next();
  res.status(401).json({ error: "Unauthorized" });
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── 認証不要 ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "yuna-admin" });
});

app.post("/auth/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_DASHBOARD_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  res.json({ token });
});

app.post("/auth/verify", requireAuth, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ── 以降のルートは認証必須 ──
// 認証不要（内部ネットワークから scheduler が取得）
//
// 指定 date (= 各 schedule の timezone における暦日) に有効な slot を
// materialize して返す。once は絶対 TIMESTAMPTZ をそのまま、daily/weekly は
// date + start_time/end_time を timezone で合成して starts_at/ends_at を導出。
// end_time <= start_time は overnight とみなし、ends_at を翌日へ繰り上げる。
//
// 同じ channel + date に once slot が存在する場合は、その date の recurring を
// 落として once を優先する (旧挙動と同じ)。
app.get("/schedules/active", async (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date=YYYY-MM-DD required" });
    return;
  }
  const result = await query(
    `SELECT s.*, p.overlay_path
     FROM stream_schedules s
     LEFT JOIN stream_programs p ON p.name = s.program
     WHERE s.enabled = true
       AND (s.ends_on IS NULL OR s.ends_on >= $1)`,
    [date],
  );
  res.json({ schedules: materializeSchedules(result.rows as unknown as RawScheduleRow[], date) });
});

// date を timezone の暦日として扱って starts_at/ends_at を導出する。
// Node の Intl は "timezone offset in minutes at a given instant" を直接返さない
// ので、"その timezone での同じ wall clock" を一旦 UTC と仮定してから offset で
// 補正するトリック (Intl で tz の hour/min/sec を抽出 → UTC 想定との差分を取る).
function tzOffsetMs(utcInstant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(utcInstant);
  const get = (t: string): number => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - utcInstant.getTime();
}

function composeInTz(dateStr: string, timeStr: string, timeZone: string): Date {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM" or "HH:MM:SS"
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi, s] = timeStr.split(":").map(Number);
  // 目標 wall clock を UTC と仮定した instant
  const naiveUtc = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
  // 同 instant を timeZone で表示したときの offset (ms) を使って補正
  const offset = tzOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset);
}

function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function dateInTz(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(instant);
}

function dowInTz(dateStr: string, timeZone: string): number {
  // dateStr は timeZone における暦日。該当日の 12:00 local を作って getUTCDay は使えない
  // ので、Intl で weekday short を引いて番号に変換。
  const instant = composeInTz(dateStr, "12:00:00", timeZone);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short",
  }).format(instant);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

interface RawScheduleRow {
  id: number;
  channel: string;
  repeat_type: "once" | "daily" | "weekly";
  repeat_days: number[] | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  start_time: string | null;   // "HH:MM:SS"
  end_time: string | null;
  timezone: string;
  ends_on: string | null;
  program: string;
  label: string;
  title: string;
  intent: string;
  enabled: boolean;
  overlay_path?: string | null;
  [k: string]: unknown;
}

interface MaterializedSlot {
  id: number;
  channel: string;
  repeat_type: "once" | "daily" | "weekly";
  starts_at: string;  // ISO
  ends_at: string;    // ISO
  program: string;
  label: string;
  title: string;
  intent: string;
  enabled: boolean;
  overlay_path: string | null;
  timezone: string;
}

function materializeSchedules(rows: RawScheduleRow[], date: string): MaterializedSlot[] {
  const onceHits = new Set<string>(); // `${channel}` that has a once slot on this date.
  const onceSlots: MaterializedSlot[] = [];
  const recurringSlots: MaterializedSlot[] = [];

  for (const r of rows) {
    if (r.repeat_type === "once") {
      if (!r.starts_at || !r.ends_at) continue;
      const startsIso = new Date(r.starts_at).toISOString();
      const endsIso = new Date(r.ends_at).toISOString();
      // once は [starts_at, ends_at) の live 区間が date の 00:00-24:00 local と
      // 交差する日に出現させる (overnight slot 23:00→01:00 なら前日と当日の両方)。
      const dayStart = composeInTz(date, "00:00:00", r.timezone).getTime();
      const dayEnd = composeInTz(addDaysISO(date, 1), "00:00:00", r.timezone).getTime();
      const startMs = new Date(r.starts_at).getTime();
      const endMs = new Date(r.ends_at).getTime();
      if (endMs <= dayStart || startMs >= dayEnd) continue;
      onceHits.add(r.channel);
      onceSlots.push({
        id: r.id, channel: r.channel, repeat_type: "once",
        starts_at: startsIso, ends_at: endsIso,
        program: r.program, label: r.label, title: r.title, intent: r.intent ?? "", enabled: r.enabled,
        overlay_path: (r.overlay_path as string | null) ?? null,
        timezone: r.timezone,
      });
      continue;
    }

    // daily / weekly
    if (!r.start_time || !r.end_time) continue;
    if (r.repeat_type === "weekly") {
      const dow = dowInTz(date, r.timezone);
      if (!(r.repeat_days ?? []).includes(dow)) continue;
    }
    const startsAt = composeInTz(date, r.start_time, r.timezone);
    // end_time <= start_time → overnight (翌日へ)
    const endDate = r.end_time <= r.start_time ? addDaysISO(date, 1) : date;
    const endsAt = composeInTz(endDate, r.end_time, r.timezone);
    recurringSlots.push({
      id: r.id, channel: r.channel, repeat_type: r.repeat_type,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      program: r.program, label: r.label, title: r.title, intent: r.intent ?? "", enabled: r.enabled,
      overlay_path: (r.overlay_path as string | null) ?? null,
      timezone: r.timezone,
    });
  }

  // 同 channel + date に once があったら recurring を drop
  const filteredRecurring = recurringSlots.filter((s) => !onceHits.has(s.channel));
  return [...onceSlots, ...filteredRecurring].sort((a, b) =>
    a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : a.starts_at < b.starts_at ? -1 : 1,
  );
}
// Docker logs: SSE で EventSource を使うため、Authorization ヘッダの代わりに
// ?token= も受け付ける専用 middleware で守る。`app.use(requireAuth)` の前に mount。
function requireAuthHeaderOrQuery(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  let token: string | undefined;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  if (!token && typeof req.query.token === "string") token = req.query.token;
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
app.use("/docker", requireAuthHeaderOrQuery, dockerLogsRoutes);

// TTS reading rules: GET is public (TTS wrapper polls without auth from
// internal network); writes require auth.
function authForWrites(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET") { next(); return; }
  requireAuth(req, res, next);
}
app.use("/tts/reading-rules", authForWrites, ttsReadingRulesRoutes);

// Admin → Overlay announcements: GET is public (overlay polls), writes auth.
app.use("/announcements", authForWrites, announcementsRoutes);

// Metrics ingest from remote agents (e.g. the 5090 box). Guarded by a
// shared secret header so it doesn't need a session token. Registered
// before `requireAuth` so it bypasses the session-token middleware.
const METRICS_INGEST_TOKEN = process.env["METRICS_INGEST_TOKEN"] ?? "";
function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  if (!METRICS_INGEST_TOKEN) {
    res.status(503).json({ error: "Ingest disabled (no token configured)" });
    return;
  }
  const provided = req.headers["x-metrics-ingest-token"];
  if (typeof provided !== "string" || provided !== METRICS_INGEST_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
app.post("/metrics/ingest", requireIngestToken, metricsIngestHandler);

// Local mp4 / scenario preview — uses ?token= because <video> tags
// cannot send Authorization headers.
app.get("/video/file/:kind/:name", requireAuthHeaderOrQuery, videoFileHandler);

app.use(requireAuth);
app.use("/schedules", schedulesRoutes);
app.use("/programs", programsRoutes);
app.use("/comments", commentsRoutes);
app.use("/stream", streamRoutes);
app.use("/stream/youtube", streamYouTubeRoutes);
app.use("/stream/youtube/thumbnail", streamYouTubeThumbnailRoutes);
app.use("/stream/youtube/thumbnail-schedule", streamYouTubeThumbnailScheduleRoutes);
app.use("/persons", personsRoutes);
app.use("/forex", forexRoutes);
app.use("/metrics", metricsRoutes);
app.use("/video", videoRoutes);
app.use("/crawl", crawlRoutes);
app.use("/worker", workerDataRoutes);
app.use("/trade", tradeRoutes);
app.use("/auto-reply", autoReplyRoutes);
app.use("/additional-auto-play", aapRoutes);
app.use("/goals", goalsRoutes);
app.use("/memory", memoryRoutes);
app.use("/immediate-rules", immediateRulesRoutes);
app.use("/hypotheses", hypothesesRoutes);
app.use("/state", stateRoutes);
app.use("/pending-actions", pendingActionsRoutes);
app.use("/cycle-blocks", cycleBlocksRoutes);
app.use("/api-usage", apiUsageRoutes);

// ── Ollama proxy ──
const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://192.168.11.17:11434";

app.post("/ollama/api/:endpoint", async (req: Request, res: Response) => {
  const path = `api/${req.params.endpoint}`;
  try {
    const upstream = await fetch(`${OLLAMA_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (req.body?.stream) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Transfer-Encoding", "chunked");
      const reader = upstream.body?.getReader();
      if (!reader) { res.status(500).end(); return; }
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      req.on("close", () => reader.cancel());
      await pump();
    } else {
      const data = await upstream.text();
      res.status(upstream.status).set("Content-Type", "application/json").send(data);
    }
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── WebSocket (認証付き) ──
const wss = new WebSocketServer({ server, path: "/ws" });
const wsClients = new Set<WebSocket>();

wss.on("connection", (ws, req) => {
  // URLパラメータからトークンを取得
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const token = url.searchParams.get("token");

  if (!isValidToken(token ?? undefined)) {
    ws.close(4001, "Unauthorized");
    return;
  }

  wsClients.add(ws);
  console.log(`[ws] client connected (${wsClients.size} total)`);

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[ws] client disconnected (${wsClients.size} total)`);
  });
});

function broadcast(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ── Redis subscribe (stream-redis) ──

/**
 * Every Redis message on the stream:{channel}:{type} pattern is
 * persisted to admin-db.stream_events and forwarded to all connected
 * admin WS clients. The persisted log is how the Live monitor hydrates
 * after reconnects / restarts and how post-mortem tooling rebuilds a
 * session timeline — Railway PG only stores data scoped to a YUNA
 * session, which misses idle-time activity and timing of phase /
 * expression / speak:done events.
 */

import {
  type StreamChannel,
  getCurrentStreamSessionId,
  setCurrentStreamSessionId,
} from "./stream-state.js";

type StreamEventType =
  | "comments"
  | "status"
  | "speak"
  | "speak_done"
  | "expression"
  | "control";

const STREAM_EVENT_TYPES: StreamEventType[] = [
  "comments", "status", "speak", "speak_done", "expression", "control",
];
const STREAM_CHANNELS: StreamChannel[] = ["ja", "en"];

function parseChannel(redisChannel: string): { channel: StreamChannel; type: StreamEventType } | null {
  // stream:{ja|en}:{type}  — speak:done is 4 segments.
  const parts = redisChannel.split(":");
  if (parts[0] !== "stream") return null;
  const ch = parts[1];
  if (ch !== "ja" && ch !== "en") return null;
  const type = parts.slice(2).join("_"); // "speak:done" -> "speak_done"
  if (!STREAM_EVENT_TYPES.includes(type as StreamEventType)) return null;
  return { channel: ch, type: type as StreamEventType };
}

function inferSessionId(type: StreamEventType, payload: unknown, channel: StreamChannel): string | null {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p["sessionId"] === "string") return p["sessionId"];
    if (typeof p["session_id"] === "string") return p["session_id"];
  }
  // Fall back to the channel-scoped tracker (updated by status events).
  return getCurrentStreamSessionId(channel);
}

function inferEmittedAt(payload: unknown): Date | null {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const t = p["timestamp"];
    if (typeof t === "number") return new Date(t);
    if (typeof t === "string") {
      const d = new Date(t);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

async function persistEvent(
  channel: StreamChannel,
  type: StreamEventType,
  payload: unknown,
): Promise<void> {
  const sessionId = inferSessionId(type, payload, channel);
  const emittedAt = inferEmittedAt(payload);
  try {
    await query(
      `INSERT INTO stream_events (channel, event_type, session_id, payload, emitted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [channel, type, sessionId, JSON.stringify(payload ?? null), emittedAt],
    );
  } catch (err) {
    console.error("[stream-events] insert failed:", err instanceof Error ? err.message : err);
  }
}

async function startRedisSubscriber(): Promise<void> {
  const sub = new Redis(REDIS_STREAM_URL);

  sub.on("error", (err) => {
    console.error("[redis-sub] error:", err.message);
  });

  sub.on("connect", () => {
    console.log("[redis-sub] connected to", REDIS_STREAM_URL);
  });

  const channels: string[] = [];
  for (const ch of STREAM_CHANNELS) {
    for (const t of STREAM_EVENT_TYPES) {
      channels.push(`stream:${ch}:${t.replace("_", ":")}`);
    }
  }
  await sub.subscribe(...channels);

  sub.on("message", (redisChannel, message) => {
    let data: unknown = null;
    try {
      data = message ? JSON.parse(message) : null;
    } catch {
      // speak:done often has empty body — keep null
    }
    const parsed = parseChannel(redisChannel);
    if (!parsed) {
      broadcast(redisChannel, data);
      return;
    }
    // Track current session id off status payloads so later speak /
    // expression / speak_done / control events can be tagged.
    if (parsed.type === "status" && data && typeof data === "object") {
      const p = data as Record<string, unknown>;
      const sid = typeof p["sessionId"] === "string" ? p["sessionId"]
        : typeof p["session_id"] === "string" ? p["session_id"]
        : null;
      if (sid) setCurrentStreamSessionId(parsed.channel, sid);
      // idle clears the session pointer
      if (p["status"] === "idle") setCurrentStreamSessionId(parsed.channel, null);
    }
    void persistEvent(parsed.channel, parsed.type, data);
    broadcast(redisChannel, data);
  });
}

// ── Start ──
server.listen(PORT, () => {
  console.log(`[yuna-admin] Running on http://localhost:${PORT}`);
});

initSqlite();

initDb().catch((err) => console.error("[db] init failed:", err.message));

startRedisSubscriber().catch((err) => {
  console.error("[redis-sub] failed to start:", err.message);
});

// Warm the FX cache so the first dummy superchat doesn't race.
primeForex();

// Start host/GPU/container metrics collector (writes to metrics_samples).
startMetricsCollector();

// ── stream_events retention (nightly) ──
// speak payloads in particular are big — keep 30 days of history so the
// Live monitor can hydrate a full day and post-mortem tooling can look
// back a few weeks without the table growing without bound.
const STREAM_EVENTS_RETENTION_DAYS = 30;
const ONE_HOUR_MS = 60 * 60 * 1000;

async function pruneStreamEvents(): Promise<void> {
  try {
    const result = await query(
      `DELETE FROM stream_events
       WHERE recorded_at < NOW() - ($1::int || ' days')::interval`,
      [STREAM_EVENTS_RETENTION_DAYS],
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[stream-events] pruned ${result.rowCount} rows older than ${STREAM_EVENTS_RETENTION_DAYS}d`);
    }
  } catch (err) {
    console.error("[stream-events] prune failed:", err instanceof Error ? err.message : err);
  }
}

setTimeout(() => {
  void pruneStreamEvents();
  setInterval(() => void pruneStreamEvents(), 6 * ONE_HOUR_MS);
}, 60_000);
