/**
 * /stream/youtube — YouTube broadcast slot management.
 *
 * - OAuth start: returns Google OAuth URL with state
 * - Credentials: persistent in admin-db (refresh_token + client config per channel)
 * - Status: current credentials + active broadcast
 * - Switch: create new broadcast + bound stream + persist + publish Redis signal
 *
 * The OAuth callback itself lives in yuna-stream backend (port 3006) because
 * Google must hit a specific redirect URI; that callback POSTs back here to
 * persist the resulting refresh_token.
 *
 * Auth:
 *   - Routes mounted under `app.use(requireAuth)` in index.ts → JWT or
 *     ADMIN_SERVICE_TOKEN accepted.
 *   - The internal `/credentials/:channel` PUT used by yuna-stream after
 *     OAuth callback uses ADMIN_SERVICE_TOKEN.
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { Redis } from "ioredis";
import { query } from "../db/client.js";
import { generateSwitchBackground, pickSwitchExpression, renderThumbnailPng } from "./stream-youtube-thumbnail.js";
import { getReservedThumbnailUrl } from "./stream-youtube-thumbnail-schedule.js";

const router = Router();

const GOOGLE_CLIENT_ID = process.env["YOUTUBE_OAUTH_CLIENT_ID"] ?? "";
const GOOGLE_CLIENT_SECRET = process.env["YOUTUBE_OAUTH_CLIENT_SECRET"] ?? "";
const OAUTH_CALLBACK_URL = process.env["YOUTUBE_OAUTH_CALLBACK_URL"] ?? "http://localhost:3006/admin/youtube/oauth/callback";
const REDIS_STREAM_URL = process.env["REDIS_STREAM_URL"] ?? "redis://localhost:6381";

const SCOPES = ["https://www.googleapis.com/auth/youtube"];

let redisPub: Redis | null = null;
function getRedisPub(): Redis {
  if (!redisPub) redisPub = new Redis(REDIS_STREAM_URL);
  return redisPub;
}

type Channel = "ja" | "en";
function isChannel(v: unknown): v is Channel {
  return v === "ja" || v === "en";
}

type Credentials = {
  channel: Channel;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  channel_id: string;
  channel_title: string;
  linked_at: string;
  updated_at: string;
  reusable_stream_id: string | null;
  reusable_stream_key: string | null;
  reusable_ingest_address: string | null;
};

// ── OAuth state (in-memory; small TTL so persistence not needed) ──

const oauthStates = new Map<string, { channel: Channel; expiresAt: number }>();
function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [s, v] of oauthStates) if (v.expiresAt < now) oauthStates.delete(s);
}

router.post("/oauth/start", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "YOUTUBE_OAUTH_CLIENT_ID not configured" });
    return;
  }
  const channel = (req.body as { channel?: unknown })?.channel;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel (must be 'ja' or 'en')" });
    return;
  }
  cleanExpiredStates();
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, { channel, expiresAt: Date.now() + 10 * 60_000 });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_CALLBACK_URL,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// State validation for the OAuth callback handled by yuna-stream backend.
router.get("/oauth/state/:state", (req: Request, res: Response) => {
  const stateKey = req.params.state as string;
  const info = oauthStates.get(stateKey);
  if (!info || info.expiresAt < Date.now()) {
    res.status(404).json({ error: "Invalid or expired state" });
    return;
  }
  oauthStates.delete(stateKey);
  res.json({ channel: info.channel });
});

// ── Credentials persistence ────────────────────────────────────

async function getCredentials(channel: Channel): Promise<Credentials | null> {
  const r = await query<Credentials>(
    `SELECT channel, refresh_token, client_id, client_secret, channel_id, channel_title,
            linked_at, updated_at, reusable_stream_id, reusable_stream_key, reusable_ingest_address
     FROM stream_youtube_credentials WHERE channel = $1`,
    [channel],
  );
  return r.rows[0] ?? null;
}

router.get("/credentials/:channel", async (req: Request, res: Response) => {
  if (!isChannel(req.params.channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const c = await getCredentials(req.params.channel);
  if (!c) {
    res.status(404).json({ error: "Not linked" });
    return;
  }
  res.json(c);
});

router.put("/credentials/:channel", async (req: Request, res: Response) => {
  if (!isChannel(req.params.channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const { refresh_token, client_id, client_secret, channel_id, channel_title } =
    (req.body as Record<string, string | undefined>) ?? {};
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
    [req.params.channel, refresh_token, client_id, client_secret, channel_id, channel_title],
  );
  res.json({ ok: true });
});

router.delete("/credentials/:channel", async (req: Request, res: Response) => {
  if (!isChannel(req.params.channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  await query("DELETE FROM stream_youtube_credentials WHERE channel = $1", [req.params.channel]);
  res.json({ ok: true });
});

// ── Templates ──────────────────────────────────────────────────

type Template = {
  channel: Channel;
  title_template: string;
  description_template: string;
  updated_at: string;
};

router.get("/template/:channel", async (req: Request, res: Response) => {
  if (!isChannel(req.params.channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const r = await query<Template>(
    `SELECT channel, title_template, description_template, updated_at
     FROM stream_youtube_templates WHERE channel = $1`,
    [req.params.channel],
  );
  res.json(r.rows[0] ?? { channel: req.params.channel, title_template: "", description_template: "", updated_at: null });
});

router.put("/template/:channel", async (req: Request, res: Response) => {
  if (!isChannel(req.params.channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const { title_template, description_template } = (req.body as Record<string, string | undefined>) ?? {};
  if (typeof title_template !== "string" || typeof description_template !== "string") {
    res.status(400).json({ error: "title_template and description_template required" });
    return;
  }
  await query(
    `INSERT INTO stream_youtube_templates (channel, title_template, description_template, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (channel) DO UPDATE SET
       title_template = EXCLUDED.title_template,
       description_template = EXCLUDED.description_template,
       updated_at = NOW()`,
    [req.params.channel, title_template, description_template],
  );
  res.json({ ok: true });
});

const WEEKDAYS_JA = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function applyTemplate(tpl: string, channel: Channel): string {
  const now = new Date();
  // JST output (UTC+9). Server timezone may vary so format manually.
  const jst = new Date(now.getTime() + 9 * 60 * 60_000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  const dow = jst.getUTCDay();
  const date = `${yyyy}/${mm}/${dd}`;
  const time = `${hh}:${mi}`;
  const weekday = (channel === "ja" ? WEEKDAYS_JA : WEEKDAYS_EN)[dow];
  return tpl
    .replaceAll("{date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{weekday}", weekday)
    .replaceAll("{datetime}", `${date} ${time}`);
}

async function getTemplate(channel: Channel): Promise<Template | null> {
  const r = await query<Template>(
    `SELECT channel, title_template, description_template, updated_at
     FROM stream_youtube_templates WHERE channel = $1`,
    [channel],
  );
  return r.rows[0] ?? null;
}

// ── Status ─────────────────────────────────────────────────────

router.get("/status", async (req: Request, res: Response) => {
  const channel = req.query.channel as string | undefined;
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const creds = await getCredentials(channel);
  const r = await query<{
    broadcast_id: string;
    rtmp_url: string;
    switched_at: string;
  }>(
    `SELECT broadcast_id, rtmp_url, switched_at FROM stream_youtube_broadcasts WHERE channel = $1`,
    [channel],
  );
  const bc = r.rows[0];
  res.json({
    channel,
    linked: !!creds,
    channel_id: creds?.channel_id ?? null,
    channel_title: creds?.channel_title ?? null,
    linked_at: creds?.linked_at ?? null,
    reusable_stream_key: creds?.reusable_stream_key ?? null,
    reusable_rtmp_url: creds?.reusable_stream_key
      ? `${creds.reusable_ingest_address}/${creds.reusable_stream_key}`
      : null,
    current_broadcast: bc?.broadcast_id ?? null,
    current_rtmp: bc?.rtmp_url ?? null,
    last_switch_at: bc?.switched_at ?? null,
  });
});

// ── Switch ─────────────────────────────────────────────────────

async function refreshAccessToken(creds: Credentials): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Refresh failed: ${await r.text()}`);
  const data = (await r.json()) as { access_token: string };
  return data.access_token;
}

async function ensureReusableStream(
  channel: Channel,
  creds: Credentials,
  accessToken: string,
): Promise<{ stream_id: string; stream_key: string; ingest_address: string; created: boolean }> {
  if (creds.reusable_stream_id && creds.reusable_stream_key && creds.reusable_ingest_address) {
    return {
      stream_id: creds.reusable_stream_id,
      stream_key: creds.reusable_stream_key,
      ingest_address: creds.reusable_ingest_address,
      created: false,
    };
  }
  // First-time setup: create a reusable stream
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: { title: `YUNA ${channel.toUpperCase()} reusable stream` },
        cdn: { format: "1080p", ingestionType: "rtmp", frameRate: "30fps", resolution: "1080p" },
        contentDetails: { isReusable: true },
      }),
    },
  );
  if (!r.ok) throw new Error(`Failed to create reusable stream: ${await r.text()}`);
  const data = (await r.json()) as {
    id: string;
    cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } };
  };
  const ingestAddress = data.cdn.ingestionInfo.ingestionAddress;
  const streamKey = data.cdn.ingestionInfo.streamName;
  await query(
    `UPDATE stream_youtube_credentials
     SET reusable_stream_id = $1, reusable_stream_key = $2, reusable_ingest_address = $3, updated_at = NOW()
     WHERE channel = $4`,
    [data.id, streamKey, ingestAddress, channel],
  );
  return { stream_id: data.id, stream_key: streamKey, ingest_address: ingestAddress, created: true };
}

async function endActiveBroadcast(channel: Channel, accessToken: string): Promise<void> {
  const r = await query<{ broadcast_id: string }>(
    `SELECT broadcast_id FROM stream_youtube_broadcasts WHERE channel = $1`,
    [channel],
  );
  const prevId = r.rows[0]?.broadcast_id;
  if (!prevId) return;
  // Transition to "complete" — ignore errors (broadcast may already be ended)
  await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${prevId}&part=id,status`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  ).catch(() => {});
}

// ── Lifecycle helpers (shared by /switch, /reserve, /golive, /complete) ──

/** liveBroadcasts.insert. bind / transition は別関数. */
async function createBroadcast(args: {
  accessToken: string;
  title: string;
  description: string;
  privacyStatus: string;
  scheduledStartTime: string;
}): Promise<{ id: string; title: string }> {
  const auth = { Authorization: `Bearer ${args.accessToken}`, "Content-Type": "application/json" };
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
    {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        snippet: {
          title: args.title.slice(0, 100),
          description: args.description,
          scheduledStartTime: args.scheduledStartTime,
        },
        status: { privacyStatus: args.privacyStatus, selfDeclaredMadeForKids: false },
        contentDetails: {
          enableAutoStart: false,
          enableAutoStop: false,
          enableDvr: true,
          monitorStream: { enableMonitorStream: false },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to create broadcast: ${(await res.text()).slice(0, 500)}`);
  }
  const bc = (await res.json()) as { id: string; snippet: { title: string } };
  return { id: bc.id, title: bc.snippet.title };
}

async function bindBroadcastToStream(args: {
  accessToken: string;
  broadcastId: string;
  streamId: string;
}): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?part=id,contentDetails&id=${args.broadcastId}&streamId=${args.streamId}`,
    { method: "POST", headers: { Authorization: `Bearer ${args.accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to bind: ${(await res.text()).slice(0, 500)}`);
  }
}

/** stream が active になるまで再試行しながら transition→live を打つ. */
async function transitionToLiveWithRetry(args: {
  accessToken: string;
  broadcastId: string;
  channel: Channel;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const tRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${args.broadcastId}&part=id,status`,
      { method: "POST", headers: { Authorization: `Bearer ${args.accessToken}` } },
    );
    if (tRes.ok) return true;
    const errBody = await tRes.text();
    if (errBody.includes("redundantTransition")) return true;
    // stream not yet active 系は retry. それ以外も attempt 切れまで黙って retry.
    if (
      !errBody.includes("redundantTransition") &&
      !errBody.includes("invalidTransition") &&
      !errBody.includes("errorStreamInactive") &&
      attempt === 5
    ) {
      console.warn(`[golive:${args.channel}] transition to live failed after retries: ${errBody.slice(0, 300)}`);
    }
  }
  return false;
}

async function transitionToComplete(args: {
  accessToken: string;
  broadcastId: string;
}): Promise<void> {
  await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${args.broadcastId}&part=id,status`,
    { method: "POST", headers: { Authorization: `Bearer ${args.accessToken}` } },
  ).catch(() => {});
}

async function persistBroadcastRow(args: {
  channel: Channel;
  broadcastId: string;
  streamId: string;
  ingestAddress: string;
  streamKey: string;
  title: string;
}): Promise<void> {
  const fullRtmpUrl = `${args.ingestAddress}/${args.streamKey}`;
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
    [args.channel, args.broadcastId, args.streamId, fullRtmpUrl, args.ingestAddress, args.streamKey, args.title],
  );
}

/** 当日 (channel) に予約があれば R2 から fetch、無ければ render fallback で
 *  PNG を作って YouTube thumbnails.set に upload. best-effort で例外飲む. */
async function uploadThumbnailForBroadcast(args: {
  channel: Channel;
  broadcastId: string;
  accessToken: string;
}): Promise<void> {
  try {
    const reserved = await getReservedThumbnailUrl(args.channel);
    let png: Buffer;
    let source: string;
    if (reserved) {
      const r = await fetch(reserved, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`reserved fetch ${r.status}`);
      png = Buffer.from(await r.arrayBuffer());
      source = `reserved (${reserved})`;
    } else {
      const expr = pickSwitchExpression();
      const bgUrl = await generateSwitchBackground();
      png = await renderThumbnailPng({ channel: args.channel, expr, tod: "day", bg: bgUrl ?? undefined });
      source = `rendered (expr=${expr}, bg=${bgUrl ? "fal" : "default"})`;
    }
    const upRes = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${args.broadcastId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${args.accessToken}`, "Content-Type": "image/png" },
        body: new Uint8Array(png),
      },
    );
    if (!upRes.ok) {
      const errText = await upRes.text();
      console.warn(`[thumbnail:${args.channel}] upload failed (${upRes.status}): ${errText.slice(0, 300)}`);
    } else {
      console.log(`[thumbnail:${args.channel}] ✓ uploaded — ${source}`);
    }
  } catch (err) {
    console.warn(`[thumbnail:${args.channel}] error:`, err instanceof Error ? err.message : String(err));
  }
}

/** broadcaster に command publish. action: 'rtmp_reconnect' (= YouTube tee 復活)
 *  / 'youtube_stop' (= en は pump-only restart, ja は ffmpeg 停止). */
async function publishBroadcasterCommand(channel: Channel, action: string): Promise<void> {
  await getRedisPub().publish(
    `stream:broadcast:${channel}:command`,
    JSON.stringify({ action }),
  );
}

function resolveTitleAndDescription(
  channel: Channel,
  override: { title?: string; description?: string },
  tpl: Template | null,
): { title: string; description: string } {
  const title = override.title
    ?? (tpl?.title_template ? applyTemplate(tpl.title_template, channel) : `YUNA Live ${new Date().toISOString().slice(0, 10)}`);
  const description = override.description
    ?? (tpl?.description_template ? applyTemplate(tpl.description_template, channel) : "");
  return { title: title.slice(0, 100), description };
}

// ── /switch — backward-compat: create + bind + go-live + thumbnail in 1 call ──
// 04:00 daily auto-switch を捨てる予定だが、手動 switch / dashboard 操作のため残す.

router.post("/switch", async (req: Request, res: Response) => {
  const { channel, title, description, privacyStatus, endPrevious } = (req.body ?? {}) as {
    channel?: unknown;
    title?: string;
    description?: string;
    privacyStatus?: string;
    endPrevious?: boolean;
  };
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const creds = await getCredentials(channel);
  if (!creds) {
    res.status(400).json({ error: `Channel ${channel} not linked` });
    return;
  }
  const tpl = await getTemplate(channel);
  const { title: finalTitle, description: finalDescription } = resolveTitleAndDescription(channel, { title, description }, tpl);
  const finalPrivacy = privacyStatus ?? "public";

  try {
    const accessToken = await refreshAccessToken(creds);
    const stream = await ensureReusableStream(channel, creds, accessToken);

    if (endPrevious !== false) {
      await endActiveBroadcast(channel, accessToken);
    }

    // 1分後 scheduled. /switch は即 live 化するので scheduledStartTime はほぼ
    // formality だが、YouTube が要求するので埋める.
    const startTime = new Date(Date.now() + 60_000).toISOString();
    const broadcast = await createBroadcast({
      accessToken,
      title: finalTitle,
      description: finalDescription,
      privacyStatus: finalPrivacy,
      scheduledStartTime: startTime,
    });

    await bindBroadcastToStream({ accessToken, broadcastId: broadcast.id, streamId: stream.stream_id });
    const liveOk = await transitionToLiveWithRetry({ accessToken, broadcastId: broadcast.id, channel });

    await persistBroadcastRow({
      channel,
      broadcastId: broadcast.id,
      streamId: stream.stream_id,
      ingestAddress: stream.ingest_address,
      streamKey: stream.stream_key,
      title: broadcast.title,
    });
    await uploadThumbnailForBroadcast({ channel, broadcastId: broadcast.id, accessToken });

    const fullRtmpUrl = `${stream.ingest_address}/${stream.stream_key}`;
    await getRedisPub().publish(
      "stream:rtmp-switch",
      JSON.stringify({ channel, broadcast_id: broadcast.id, rtmp_url: fullRtmpUrl }),
    );
    await publishBroadcasterCommand(channel, "rtmp_reconnect");

    res.json({
      ok: true,
      broadcast_id: broadcast.id,
      stream_id: stream.stream_id,
      rtmp_url: fullRtmpUrl,
      stream_key: stream.stream_key,
      stream_created: stream.created,
      transitioned_to_live: liveOk,
      title: broadcast.title,
      watch_url: `https://www.youtube.com/watch?v=${broadcast.id}`,
    });
  } catch (err) {
    console.error("[stream/youtube/switch]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── /reserve — create broadcast WITHOUT binding/transitioning ──
// scheduler が prep の N 分前に呼ぶ. watch_url を確定させて DB に書くだけ.
// 実 live 化は /golive で行う.
router.post("/reserve", async (req: Request, res: Response) => {
  const { channel, scheduledStartTime, title, description, privacyStatus } = (req.body ?? {}) as {
    channel?: unknown;
    scheduledStartTime?: string;
    title?: string;
    description?: string;
    privacyStatus?: string;
  };
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const creds = await getCredentials(channel);
  if (!creds) {
    res.status(400).json({ error: `Channel ${channel} not linked` });
    return;
  }

  const tpl = await getTemplate(channel);
  const { title: finalTitle, description: finalDescription } = resolveTitleAndDescription(channel, { title, description }, tpl);
  const finalPrivacy = privacyStatus ?? "public";
  const startTime = scheduledStartTime ?? new Date(Date.now() + 5 * 60_000).toISOString();

  try {
    const accessToken = await refreshAccessToken(creds);
    // 前回の broadcast がまだ DB に残っていたら、念のため終わらせておく.
    // (前 slot の /complete が網羅的に走ってるはずだが防御的に.)
    await endActiveBroadcast(channel, accessToken);

    // reusable stream は事前に存在するはず. 無ければここで作る (初回のみ).
    const stream = await ensureReusableStream(channel, creds, accessToken);

    const broadcast = await createBroadcast({
      accessToken,
      title: finalTitle,
      description: finalDescription,
      privacyStatus: finalPrivacy,
      scheduledStartTime: startTime,
    });

    await persistBroadcastRow({
      channel,
      broadcastId: broadcast.id,
      streamId: stream.stream_id,
      ingestAddress: stream.ingest_address,
      streamKey: stream.stream_key,
      title: broadcast.title,
    });
    // サムネ upload は ここで完結させる (= prep 開始時には完了済みの状態を作る).
    await uploadThumbnailForBroadcast({ channel, broadcastId: broadcast.id, accessToken });

    res.json({
      ok: true,
      broadcast_id: broadcast.id,
      title: broadcast.title,
      scheduled_start_time: startTime,
      watch_url: `https://www.youtube.com/watch?v=${broadcast.id}`,
    });
  } catch (err) {
    console.error("[stream/youtube/reserve]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── /golive — bind reserved broadcast + transition to live + restart ffmpeg ──
// scheduler が prep に入った時点で呼ぶ.
router.post("/golive", async (req: Request, res: Response) => {
  const { channel } = (req.body ?? {}) as { channel?: unknown };
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const creds = await getCredentials(channel);
  if (!creds) {
    res.status(400).json({ error: `Channel ${channel} not linked` });
    return;
  }
  const r = await query<{ broadcast_id: string; stream_id: string; rtmp_url: string }>(
    `SELECT broadcast_id, stream_id, rtmp_url FROM stream_youtube_broadcasts WHERE channel = $1`,
    [channel],
  );
  const row = r.rows[0];
  if (!row?.broadcast_id) {
    res.status(400).json({ error: "No reserved broadcast found — call /reserve first" });
    return;
  }

  try {
    const accessToken = await refreshAccessToken(creds);
    await bindBroadcastToStream({
      accessToken,
      broadcastId: row.broadcast_id,
      streamId: row.stream_id,
    });
    const liveOk = await transitionToLiveWithRetry({
      accessToken,
      broadcastId: row.broadcast_id,
      channel,
    });

    await getRedisPub().publish(
      "stream:rtmp-switch",
      JSON.stringify({ channel, broadcast_id: row.broadcast_id, rtmp_url: row.rtmp_url }),
    );
    // broadcaster 側に YouTube tee を有効化させる (en は both mode、ja は ffmpeg start).
    await publishBroadcasterCommand(channel, "rtmp_reconnect");

    res.json({
      ok: true,
      broadcast_id: row.broadcast_id,
      transitioned_to_live: liveOk,
      watch_url: `https://www.youtube.com/watch?v=${row.broadcast_id}`,
    });
  } catch (err) {
    console.error("[stream/youtube/golive]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── /complete — end current broadcast + tell broadcaster to drop YouTube ──
// scheduler が idle に戻った時点で呼ぶ.
router.post("/complete", async (req: Request, res: Response) => {
  const { channel } = (req.body ?? {}) as { channel?: unknown };
  if (!isChannel(channel)) {
    res.status(400).json({ error: "Invalid channel" });
    return;
  }
  const creds = await getCredentials(channel);
  if (!creds) {
    res.status(400).json({ error: `Channel ${channel} not linked` });
    return;
  }
  const r = await query<{ broadcast_id: string }>(
    `SELECT broadcast_id FROM stream_youtube_broadcasts WHERE channel = $1`,
    [channel],
  );
  const broadcastId = r.rows[0]?.broadcast_id ?? null;

  try {
    if (broadcastId) {
      const accessToken = await refreshAccessToken(creds);
      await transitionToComplete({ accessToken, broadcastId });
      // DB row は完了マークだけしておく (削除しない). 次回 /reserve が UPSERT で上書きする.
      await query(
        `UPDATE stream_youtube_broadcasts SET switched_at = switched_at WHERE channel = $1`,
        [channel],
      );
    }
    // broadcaster へ YouTube push 停止を通知 (en は pump-only restart、ja は ffmpeg 停止).
    await publishBroadcasterCommand(channel, "youtube_stop");

    res.json({ ok: true, broadcast_id: broadcastId, completed: !!broadcastId });
  } catch (err) {
    console.error("[stream/youtube/complete]", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
