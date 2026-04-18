/**
 * /video — admin-dashboard view of the video-generation pipeline.
 *
 * Combines three sources:
 *   - yuna-api  (Railway DB)   — sessions, posts, questions, stats
 *   - yuna-redis (local queue) — video:build (waiting), video:processing (running)
 *   - yuna-video out/ volume    — raw mp4 + scenario JSON for preview
 *
 * Admin-dashboard mustn't touch Railway directly, so DB views proxy
 * through yuna-api. The queue and files are local, so we hit them
 * directly from here.
 */

import { Router, type Request, type Response } from "express";
import { Redis } from "ioredis";
import fs from "fs";
import path from "path";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

const YUNA_REDIS_URL = process.env["YUNA_REDIS_URL"] ?? "redis://yuna-redis:6379";
const VIDEO_OUT_DIR = process.env["VIDEO_OUT_DIR"] ?? "/video-out";
const BUILD_QUEUE = "video:build";
const PROCESSING_LIST = "video:processing";

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(YUNA_REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
    redis.on("error", (err) => console.warn("[video/redis] error:", err.message));
  }
  return redis;
}

/* ==================== Queue ==================== */

router.get("/queue", async (_req: Request, res: Response) => {
  try {
    const r = getRedis();
    const [depth, processingRaw] = await Promise.all([
      r.llen(BUILD_QUEUE),
      r.lrange(PROCESSING_LIST, 0, -1),
    ]);
    const processing = processingRaw.map((raw) => {
      try { return JSON.parse(raw); } catch { return { raw }; }
    });
    res.json({ depth, processing });
  } catch (err) {
    console.warn("[video/queue] error:", err instanceof Error ? err.message : err);
    res.json({ depth: 0, processing: [], error: "queue unavailable" });
  }
});

/**
 * Re-enqueue a job. Body accepts a full VideoScenario payload or, if
 * `sessionId` + minimal fields are given, constructs one. The dashboard
 * retry button just passes through whatever it pulled from the session.
 */
router.post("/queue/push", async (req: Request, res: Response) => {
  const body = req.body as { sessionId?: unknown; scenario?: unknown; language?: unknown; direction?: unknown };
  const sessionId = typeof body.sessionId === "number" ? body.sessionId : null;
  const scenario = body.scenario;
  if (!sessionId || !scenario || typeof scenario !== "object") {
    res.status(400).json({ error: "sessionId (number) and scenario (object) are required" });
    return;
  }
  const job = {
    sessionId,
    scenario,
    language: body.language ?? (scenario as { language?: string }).language ?? "ja",
    direction: body.direction ?? {},
  };
  try {
    const r = getRedis();
    await r.lpush(BUILD_QUEUE, JSON.stringify(job));
    res.json({ ok: true });
  } catch (err) {
    console.warn("[video/queue/push] error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "queue unavailable" });
  }
});

router.post("/queue/clear-processing", async (_req: Request, res: Response) => {
  try {
    const r = getRedis();
    const removed = await r.del(PROCESSING_LIST);
    res.json({ ok: true, removed });
  } catch (err) {
    console.warn("[video/queue/clear] error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "queue unavailable" });
  }
});

/* ==================== Proxy to yuna-api ==================== */

async function proxy<T>(req: Request, res: Response, upstreamPath: string): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const full = qs.toString() ? `${upstreamPath}?${qs}` : upstreamPath;
  try {
    res.json(await yunaApi<T>(full));
  } catch (err) {
    if (err instanceof YunaApiError) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(502).json({ error: "Upstream error" });
    }
  }
}

router.get("/sessions", (req, res) => proxy(req, res, "/api/admin/video/sessions"));
router.get("/sessions/:id", (req, res) => proxy(req, res, `/api/admin/video/sessions/${encodeURIComponent(String(req.params["id"]))}`));
router.get("/posts", (req, res) => proxy(req, res, "/api/admin/video/posts"));
router.get("/questions", (req, res) => proxy(req, res, "/api/admin/video/questions"));
router.get("/stats", (req, res) => proxy(req, res, "/api/admin/video/stats"));

export default router;

/* ==================== Local file preview (public router) ==================== */

/**
 * Serve a generated mp4 or its scenario JSON. Exported as a separate
 * handler so index.ts can mount it before the session-auth middleware
 * and guard it with a ?token= query (needed because <video> tags can't
 * attach Authorization headers).
 */
export function videoFileHandler(req: Request, res: Response): void {
  const kind = String(req.params["kind"] ?? "");
  const name = String(req.params["name"] ?? "");
  if (!/^(videos|scenarios)$/.test(kind)) {
    res.status(400).json({ error: "Invalid kind" });
    return;
  }
  if (!/^[a-z0-9_-]+\.(mp4|json)$/i.test(name)) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  const full = path.join(VIDEO_OUT_DIR, kind, name);
  if (!full.startsWith(path.resolve(VIDEO_OUT_DIR))) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const ext = path.extname(name).toLowerCase();
    res.setHeader("Content-Type", ext === ".mp4" ? "video/mp4" : "application/json");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(full).pipe(res);
  });
}
