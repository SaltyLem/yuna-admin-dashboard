import { initDb } from "./db/client.js";
import { initSqlite } from "./db/sqlite.js";
import schedulesRoutes from "./routes/schedules.js";
import commentsRoutes from "./routes/comments.js";
import personsRoutes from "./routes/persons.js";
import streamRoutes from "./routes/stream.js";
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
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
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
app.get("/schedules/active", async (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  const result = await query(
    `SELECT s.*, p.overlay_path FROM stream_schedules s
     LEFT JOIN stream_programs p ON p.name = s.program
     WHERE s.enabled = true
       AND (s.ends_on IS NULL OR s.ends_on >= $1)
       AND (s.date = $1 OR (s.date IS NULL AND NOT EXISTS (
         SELECT 1 FROM stream_schedules s2
         WHERE s2.channel = s.channel
           AND s2.date = $1
           AND s2.enabled = true
       )))
     ORDER BY s.channel, s.start_minutes`,
    [date],
  );
  res.json({ schedules: result.rows });
});
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
app.use("/persons", personsRoutes);
app.use("/forex", forexRoutes);
app.use("/metrics", metricsRoutes);
app.use("/video", videoRoutes);
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
