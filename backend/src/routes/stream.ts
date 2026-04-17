/**
 * /stream — Live monitor aggregator.
 *
 * GET /stream/live-state
 *   Single hydration endpoint for the Live monitor page. Returns, per
 *   channel (ja/en):
 *     - status     — latest status payload (phase / title / program)
 *     - sessionId  — current YUNA session id if known
 *     - monitor    — yuna-api `/streams/:sessionId/monitor` response
 *                    (stream row, recent director iters, talker results,
 *                    comments, counts) when a session is active
 *     - events     — last hour of raw stream_events from admin-db
 *                    (phase / expression / speak / speak_done / control
 *                    timing — the volatile signals Railway PG never
 *                    receives).
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db/client.js";
import { yunaApi, YunaApiError } from "../yuna-api.js";
import { getCurrentStreamSessionId } from "../stream-state.js";

const router = Router();

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];

router.get("/live-state", async (_req: Request, res: Response) => {
  const now = new Date();
  const sinceMs = 60 * 60 * 1000;
  const since = new Date(now.getTime() - sinceMs);

  try {
    const perChannel = await Promise.all(
      CHANNELS.map(async (channel) => {
        const sessionId = getCurrentStreamSessionId(channel);

        // Last status per channel (even if older than 1h).
        const latestStatus = await query<{ payload: unknown; recorded_at: Date }>(
          `SELECT payload, recorded_at
           FROM stream_events
           WHERE channel = $1 AND event_type = 'status'
           ORDER BY recorded_at DESC
           LIMIT 1`,
          [channel],
        );

        // Last hour of events on this channel.
        const events = await query<{
          id: number;
          event_type: string;
          session_id: string | null;
          payload: unknown;
          emitted_at: Date | null;
          recorded_at: Date;
        }>(
          `SELECT id, event_type, session_id, payload, emitted_at, recorded_at
           FROM stream_events
           WHERE channel = $1 AND recorded_at >= $2
           ORDER BY recorded_at ASC`,
          [channel, since],
        );

        let monitor: unknown = null;
        if (sessionId) {
          try {
            monitor = await yunaApi(`/streams/${encodeURIComponent(sessionId)}/monitor`);
          } catch (err) {
            if (!(err instanceof YunaApiError) || err.status !== 404) {
              console.warn(`[stream/live-state] monitor fetch failed for ${channel}/${sessionId}:`,
                err instanceof Error ? err.message : err);
            }
          }
        }

        return {
          channel,
          sessionId,
          status: latestStatus.rows[0]?.payload ?? null,
          statusAt: latestStatus.rows[0]?.recorded_at ?? null,
          events: events.rows,
          monitor,
        };
      }),
    );

    res.json({ now: now.toISOString(), channels: perChannel });
  } catch (err) {
    console.error("[stream/live-state] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Failed to load live state" });
  }
});

/**
 * GET /stream/activity
 *   Time-bucketed counts from admin-db.stream_events. Used by the Live
 *   monitor's Activity chart for its 1m / 15m / 1h / 4h / 24h candles.
 *
 *   Query:
 *     channel  — "ja" | "en" (required)
 *     bucketMinutes — bucket width in minutes (1, 15, 60, 240, 1440)
 *     buckets  — how many buckets to return (default 30, max 120)
 *     kind     — "activity" (comments + speak) or "viewers" (viewers event_type)
 */
router.get("/activity", async (req: Request, res: Response) => {
  const channel = String(req.query["channel"] ?? "");
  if (channel !== "ja" && channel !== "en") {
    res.status(400).json({ error: "channel must be ja or en" });
    return;
  }
  const bucketMinutes = Math.max(1, Math.min(1440, parseInt(String(req.query["bucketMinutes"] ?? "1"), 10) || 1));
  const buckets = Math.max(1, Math.min(120, parseInt(String(req.query["buckets"] ?? "30"), 10) || 30));
  const kind = String(req.query["kind"] ?? "activity");

  try {
    if (kind === "viewers") {
      // viewers event carries a numeric count in payload.count
      const rows = await query<{ bucket_start: Date; avg_count: string; max_count: string }>(
        `WITH range AS (
           SELECT NOW() - ($1::int * $2::int || ' minutes')::interval AS start_at,
                  NOW() AS end_at
         ),
         g AS (
           SELECT generate_series(
             (SELECT start_at FROM range),
             (SELECT end_at FROM range),
             ($1::int || ' minutes')::interval
           ) AS bucket_start
         )
         SELECT g.bucket_start,
                COALESCE(AVG((se.payload->>'count')::int), 0) AS avg_count,
                COALESCE(MAX((se.payload->>'count')::int), 0) AS max_count
         FROM g
         LEFT JOIN stream_events se
           ON se.channel = $3
          AND se.event_type = 'viewers'
          AND se.recorded_at >= g.bucket_start
          AND se.recorded_at <  g.bucket_start + ($1::int || ' minutes')::interval
         GROUP BY g.bucket_start
         ORDER BY g.bucket_start ASC`,
        [bucketMinutes, buckets, channel],
      );
      res.json({
        channel, bucketMinutes, buckets,
        kind: "viewers",
        series: rows.rows.map(r => ({
          t: r.bucket_start.getTime(),
          avg: Math.round(parseFloat(r.avg_count) || 0),
          max: Math.round(parseFloat(r.max_count) || 0),
        })),
      });
      return;
    }

    // activity = count of comments + count of speak events
    const rows = await query<{ bucket_start: Date; comments: string; utterances: string }>(
      `WITH range AS (
         SELECT NOW() - ($1::int * $2::int || ' minutes')::interval AS start_at,
                NOW() AS end_at
       ),
       g AS (
         SELECT generate_series(
           (SELECT start_at FROM range),
           (SELECT end_at FROM range),
           ($1::int || ' minutes')::interval
         ) AS bucket_start
       )
       SELECT g.bucket_start,
              COUNT(*) FILTER (WHERE se.event_type = 'comments') AS comments,
              COUNT(*) FILTER (WHERE se.event_type = 'speak')    AS utterances
       FROM g
       LEFT JOIN stream_events se
         ON se.channel = $3
        AND se.recorded_at >= g.bucket_start
        AND se.recorded_at <  g.bucket_start + ($1::int || ' minutes')::interval
       GROUP BY g.bucket_start
       ORDER BY g.bucket_start ASC`,
      [bucketMinutes, buckets, channel],
    );
    res.json({
      channel, bucketMinutes, buckets,
      kind: "activity",
      series: rows.rows.map(r => ({
        t: r.bucket_start.getTime(),
        comments: parseInt(r.comments, 10) || 0,
        utterances: parseInt(r.utterances, 10) || 0,
      })),
    });
  } catch (err) {
    console.error("[stream/activity] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

export default router;
