/**
 * /stream/youtube — YouTube broadcast credential persistence.
 *
 * Used internally by yuna-stream backend (over the local docker network)
 * to persist OAuth refresh tokens and the current active broadcast per
 * channel. Authenticated by a shared `STREAM_ADMIN_TOKEN` header rather
 * than the dashboard JWT, since the caller is a service, not a user.
 *
 * Tables:
 *   stream_youtube_credentials — refresh_token + client config per channel
 *   stream_youtube_broadcasts  — current active broadcast per channel
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { query } from "../db/client.js";

const router = Router();

const STREAM_ADMIN_TOKEN = process.env["STREAM_ADMIN_TOKEN"] ?? "";

function requireStreamAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!STREAM_ADMIN_TOKEN) {
    res.status(503).json({ error: "STREAM_ADMIN_TOKEN not configured" });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== STREAM_ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireStreamAdmin);

type Channel = "ja" | "en";
function isChannel(v: unknown): v is Channel {
  return v === "ja" || v === "en";
}

// ── Credentials ────────────────────────────────────────────────

router.get("/credentials/:channel", async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const r = await query(
    `SELECT channel, refresh_token, client_id, client_secret, channel_id, channel_title, linked_at, updated_at
     FROM stream_youtube_credentials WHERE channel = $1`,
    [channel],
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not linked" });
    return;
  }
  res.json(r.rows[0]);
});

router.put("/credentials/:channel", async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const { refresh_token, client_id, client_secret, channel_id, channel_title } = req.body as Record<string, string | undefined>;
  if (!refresh_token || !client_id || !client_secret || !channel_id || !channel_title) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  await query(
    `INSERT INTO stream_youtube_credentials (channel, refresh_token, client_id, client_secret, channel_id, channel_title, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (channel) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       client_id = EXCLUDED.client_id,
       client_secret = EXCLUDED.client_secret,
       channel_id = EXCLUDED.channel_id,
       channel_title = EXCLUDED.channel_title,
       updated_at = NOW()`,
    [channel, refresh_token, client_id, client_secret, channel_id, channel_title],
  );
  res.json({ ok: true });
});

router.delete("/credentials/:channel", async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  await query("DELETE FROM stream_youtube_credentials WHERE channel = $1", [channel]);
  res.json({ ok: true });
});

// ── Active broadcast ───────────────────────────────────────────

router.get("/broadcast/:channel", async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const r = await query(
    `SELECT channel, broadcast_id, stream_id, rtmp_url, ingest_address, stream_key, title, switched_at
     FROM stream_youtube_broadcasts WHERE channel = $1`,
    [channel],
  );
  res.json(r.rows[0] ?? null);
});

router.put("/broadcast/:channel", async (req: Request, res: Response) => {
  const { channel } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const { broadcast_id, stream_id, rtmp_url, ingest_address, stream_key, title } = req.body as Record<string, string | undefined>;
  if (!broadcast_id || !stream_id || !rtmp_url || !ingest_address || !stream_key) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  await query(
    `INSERT INTO stream_youtube_broadcasts (channel, broadcast_id, stream_id, rtmp_url, ingest_address, stream_key, title, switched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (channel) DO UPDATE SET
       broadcast_id = EXCLUDED.broadcast_id,
       stream_id = EXCLUDED.stream_id,
       rtmp_url = EXCLUDED.rtmp_url,
       ingest_address = EXCLUDED.ingest_address,
       stream_key = EXCLUDED.stream_key,
       title = EXCLUDED.title,
       switched_at = NOW()`,
    [channel, broadcast_id, stream_id, rtmp_url, ingest_address, stream_key, title ?? null],
  );
  res.json({ ok: true });
});

export default router;
