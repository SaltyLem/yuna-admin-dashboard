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

export default router;
