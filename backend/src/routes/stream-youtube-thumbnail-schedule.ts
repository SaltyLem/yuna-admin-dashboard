/**
 * /stream/youtube/thumbnail-schedule — 日付ごとの完成サムネ予約.
 *
 * 運営が事前に PNG/JPEG/WEBP をアップロード → yuna-api 経由 R2 永続化 →
 * (channel, JST date, image_url) を DB に保存. 当日 04:00 JST の auto-switch
 * 時に /switch endpoint がこの DB を参照し、予約があれば render を skip して
 * その PNG をそのまま YouTube thumbnails.set に upload する.
 */

import { Router, raw as expressRaw, type Request, type Response } from "express";
import { query } from "../db/client.js";

const router = Router();

const YUNA_API_URL = process.env["YUNA_API_URL"] ?? "https://api.yunaonchain.com";
const YUNA_API_KEY = process.env["YUNA_API_KEY"] ?? "";

type Channel = "ja" | "en";
function isChannel(v: unknown): v is Channel {
  return v === "ja" || v === "en";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Row {
  channel: Channel;
  date: string;
  image_url: string;
  source: string;
  created_at: string;
  updated_at: string;
}

// ── List ──
//   GET /stream/youtube/thumbnail-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
//   from/to 省略時は当月 (JST) を返す.
router.get("/", async (req: Request, res: Response) => {
  const from = typeof req.query["from"] === "string" ? req.query["from"] : "";
  const to = typeof req.query["to"] === "string" ? req.query["to"] : "";
  const fromOk = DATE_RE.test(from);
  const toOk = DATE_RE.test(to);
  const today = new Date(Date.now() + 9 * 60 * 60_000);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const defFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const defTo = `${y}-${String(m + 2).padStart(2, "0")}-01`;
  const r = await query<Row>(
    `SELECT channel, to_char(date, 'YYYY-MM-DD') as date, image_url, source, created_at, updated_at
     FROM stream_youtube_thumbnails
     WHERE date >= $1::date AND date < $2::date
     ORDER BY date, channel`,
    [fromOk ? from : defFrom, toOk ? to : defTo],
  );
  res.json({ items: r.rows });
});

// ── Upload + Save ──
//   PUT /stream/youtube/thumbnail-schedule/:date/:channel
//   Content-Type: image/png | image/jpeg | image/webp
//   raw body = 画像バイト. yuna-api /yuna/upload-image に forward して R2 へ.
router.put(
  "/:date/:channel",
  expressRaw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "8mb" }),
  async (req: Request, res: Response) => {
    const date = String(req.params["date"] ?? "");
    const channel = String(req.params["channel"] ?? "");
    if (!DATE_RE.test(date)) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    if (!isChannel(channel)) {
      res.status(400).json({ error: "channel must be 'ja' or 'en'" });
      return;
    }
    if (!YUNA_API_KEY) {
      res.status(503).json({ error: "YUNA_API_KEY not configured on admin-backend" });
      return;
    }
    const ct = req.headers["content-type"] ?? "";
    if (!/^image\/(png|jpeg|webp)/.test(ct)) {
      res.status(400).json({ error: "Content-Type must be image/png|jpeg|webp" });
      return;
    }
    const buf = req.body as Buffer | undefined;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: "Empty body" });
      return;
    }

    // 1. R2 にアップロード via yuna-api
    let imageUrl: string;
    try {
      const upRes = await fetch(`${YUNA_API_URL.replace(/\/$/, "")}/yuna/upload-image?prefix=thumbnails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${YUNA_API_KEY}`,
          "Content-Type": ct.split(";")[0]!.trim(),
        },
        body: new Uint8Array(buf),
        signal: AbortSignal.timeout(60_000),
      });
      if (!upRes.ok) {
        const err = await upRes.text();
        res.status(502).json({ error: "R2 upload failed", detail: err.slice(0, 300) });
        return;
      }
      const data = (await upRes.json()) as { url?: string };
      if (!data.url) {
        res.status(502).json({ error: "yuna-api returned no url" });
        return;
      }
      imageUrl = data.url;
    } catch (err) {
      res.status(500).json({ error: "upload error", detail: err instanceof Error ? err.message : String(err) });
      return;
    }

    // 2. DB upsert
    await query(
      `INSERT INTO stream_youtube_thumbnails (channel, date, image_url, source)
       VALUES ($1, $2::date, $3, 'upload')
       ON CONFLICT (channel, date) DO UPDATE
         SET image_url = EXCLUDED.image_url,
             source = EXCLUDED.source,
             updated_at = NOW()`,
      [channel, date, imageUrl],
    );

    res.json({ ok: true, channel, date, image_url: imageUrl });
  },
);

// ── Delete ──
router.delete("/:date/:channel", async (req: Request, res: Response) => {
  const date = String(req.params["date"] ?? "");
  const channel = String(req.params["channel"] ?? "");
  if (!DATE_RE.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  if (!isChannel(channel)) {
    res.status(400).json({ error: "channel must be 'ja' or 'en'" });
    return;
  }
  await query(
    `DELETE FROM stream_youtube_thumbnails WHERE channel = $1 AND date = $2::date`,
    [channel, date],
  );
  res.json({ ok: true });
});

// ── Lookup helper for /switch ──
//   今日 (JST) の channel について予約があれば image_url を返す.
export async function getReservedThumbnailUrl(channel: Channel): Promise<string | null> {
  const jst = new Date(Date.now() + 9 * 60 * 60_000);
  const date = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
  try {
    const r = await query<{ image_url: string }>(
      `SELECT image_url FROM stream_youtube_thumbnails WHERE channel = $1 AND date = $2::date`,
      [channel, date],
    );
    return r.rows[0]?.image_url ?? null;
  } catch {
    return null;
  }
}

export default router;
