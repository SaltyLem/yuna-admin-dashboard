import { initDb } from "./db/client.js";
import { initSqlite } from "./db/sqlite.js";
import schedulesRoutes from "./routes/schedules.js";
import commentsRoutes from "./routes/comments.js";
import personsRoutes from "./routes/persons.js";
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
app.use(requireAuth);
app.use("/schedules", schedulesRoutes);
app.use("/programs", programsRoutes);
app.use("/comments", commentsRoutes);
app.use("/persons", personsRoutes);
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
async function startRedisSubscriber(): Promise<void> {
  const sub = new Redis(REDIS_STREAM_URL);

  sub.on("error", (err) => {
    console.error("[redis-sub] error:", err.message);
  });

  sub.on("connect", () => {
    console.log("[redis-sub] connected to", REDIS_STREAM_URL);
  });

  await sub.subscribe("stream:comments", "stream:status", "stream:speak");

  sub.on("message", (channel, message) => {
    try {
      const data = JSON.parse(message);
      broadcast(channel, data);
    } catch {
      // ignore parse errors
    }
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
