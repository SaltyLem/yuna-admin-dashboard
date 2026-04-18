/**
 * /metrics — system observability API.
 *
 * Query endpoints take an optional ?host=<label> filter (default
 * "linux-3080"). Remote hosts push their samples via /ingest.
 *
 * GET  /metrics/hosts
 *   Distinct host labels present in the table (for the UI switcher).
 *
 * GET  /metrics/series
 *   Time-bucketed series for one (host, kind, subject?, metric) tuple.
 *
 * GET  /metrics/latest
 *   Most recent value per (kind, subject, metric) for one host.
 *
 * GET  /metrics/containers
 *   Latest CPU/MEM per Docker container for one host.
 *
 * POST /metrics/ingest
 *   Bulk insert samples from a remote collector:
 *     { host: string, samples: [{kind, subject?, metric, value, recordedAt?}] }
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db/client.js";

const router = Router();

const DEFAULT_HOST = "linux-3080";

function parseHost(req: Request): string {
  const h = req.query["host"];
  return typeof h === "string" && h !== "" ? h : DEFAULT_HOST;
}

router.get("/hosts", async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ host: string }>(
      `SELECT DISTINCT host
         FROM metrics_samples
        WHERE recorded_at > NOW() - INTERVAL '1 day'
        ORDER BY host ASC`,
    );
    res.json({ hosts: rows.rows.map(r => r.host) });
  } catch (err) {
    console.error("[metrics/hosts] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/series", async (req: Request, res: Response) => {
  const host = parseHost(req);
  const kind = String(req.query["kind"] ?? "");
  const subject = typeof req.query["subject"] === "string" && req.query["subject"] !== ""
    ? req.query["subject"] : null;
  const metric = String(req.query["metric"] ?? "");
  const rangeMinutes = Math.max(1, Math.min(60 * 24 * 7, parseInt(String(req.query["rangeMinutes"] ?? "60"), 10) || 60));
  const bucketSeconds = Math.max(5, Math.min(3600, parseInt(String(req.query["bucketSeconds"] ?? "30"), 10) || 30));
  if (!kind || !metric) {
    res.status(400).json({ error: "kind and metric are required" });
    return;
  }

  try {
    const subjectClause = subject === null
      ? `AND subject IS NULL`
      : `AND subject = $6`;
    const params: unknown[] = [kind, metric, rangeMinutes, bucketSeconds, host];
    if (subject !== null) params.push(subject);

    const rows = await query<{ bucket_start: Date; avg: string; min: string; max: string }>(
      `WITH range AS (
         SELECT NOW() - ($3::int || ' minutes')::interval AS start_at,
                NOW() AS end_at
       ),
       g AS (
         SELECT generate_series(
           date_trunc('second', (SELECT start_at FROM range)),
           (SELECT end_at FROM range),
           ($4::int || ' seconds')::interval
         ) AS bucket_start
       )
       SELECT g.bucket_start,
              COALESCE(AVG(m.value), 0)::numeric AS avg,
              COALESCE(MIN(m.value), 0)::numeric AS min,
              COALESCE(MAX(m.value), 0)::numeric AS max
       FROM g
       LEFT JOIN metrics_samples m
         ON m.host = $5 AND m.kind = $1 AND m.metric = $2
        ${subjectClause}
        AND m.recorded_at >= g.bucket_start
        AND m.recorded_at <  g.bucket_start + ($4::int || ' seconds')::interval
       GROUP BY g.bucket_start
       ORDER BY g.bucket_start ASC`,
      params,
    );

    res.json({
      host, kind, subject, metric, rangeMinutes, bucketSeconds,
      series: rows.rows.map(r => ({
        t: r.bucket_start.getTime(),
        avg: parseFloat(r.avg) || 0,
        min: parseFloat(r.min) || 0,
        max: parseFloat(r.max) || 0,
      })),
    });
  } catch (err) {
    console.error("[metrics/series] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/latest", async (req: Request, res: Response) => {
  const host = parseHost(req);
  try {
    const rows = await query<{ kind: string; subject: string | null; metric: string; value: string; recorded_at: Date }>(
      `SELECT DISTINCT ON (kind, subject, metric)
              kind, subject, metric, value, recorded_at
         FROM metrics_samples
        WHERE host = $1
          AND recorded_at > NOW() - INTERVAL '5 minutes'
        ORDER BY kind, subject, metric, recorded_at DESC`,
      [host],
    );
    res.json({
      host,
      samples: rows.rows.map(r => ({
        kind: r.kind,
        subject: r.subject,
        metric: r.metric,
        value: parseFloat(r.value) || 0,
        recordedAt: r.recorded_at.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[metrics/latest] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/containers", async (req: Request, res: Response) => {
  const host = parseHost(req);
  try {
    const rows = await query<{ subject: string; cpu_pct: string; mem_mb: string; mem_pct: string; recorded_at: Date }>(
      `SELECT DISTINCT ON (subject)
              subject,
              MAX(CASE WHEN metric = 'cpu_pct'     THEN value END) AS cpu_pct,
              MAX(CASE WHEN metric = 'mem_used_mb' THEN value END) AS mem_mb,
              MAX(CASE WHEN metric = 'mem_pct'     THEN value END) AS mem_pct,
              MAX(recorded_at) AS recorded_at
         FROM metrics_samples
        WHERE host = $1
          AND kind = 'docker'
          AND recorded_at > NOW() - INTERVAL '2 minutes'
        GROUP BY subject
        ORDER BY subject, recorded_at DESC`,
      [host],
    );
    const containers = rows.rows
      .map(r => ({
        subject: r.subject,
        cpuPct: parseFloat(r.cpu_pct ?? "0") || 0,
        memMb: parseFloat(r.mem_mb ?? "0") || 0,
        memPct: parseFloat(r.mem_pct ?? "0") || 0,
        recordedAt: r.recorded_at.toISOString(),
      }))
      .sort((a, b) => b.cpuPct - a.cpuPct);
    res.json({ host, containers });
  } catch (err) {
    console.error("[metrics/containers] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal error" });
  }
});

interface IngestSample {
  kind: string;
  subject?: string | null;
  metric: string;
  value: number;
  recordedAt?: string;
}

/**
 * Bulk-insert samples from a remote agent. Mounted separately in
 * index.ts before the session-auth middleware and guarded by a shared
 * secret so remote hosts can push without a login session.
 */
export async function ingestHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { host?: unknown; samples?: unknown };
  const host = typeof body.host === "string" && body.host !== "" ? body.host : null;
  const samples = Array.isArray(body.samples) ? body.samples as IngestSample[] : null;
  if (!host || !samples) {
    res.status(400).json({ error: "host and samples[] are required" });
    return;
  }
  if (samples.length === 0) { res.json({ inserted: 0 }); return; }
  if (samples.length > 500) {
    res.status(400).json({ error: "samples[] too large (max 500)" });
    return;
  }

  const params: unknown[] = [];
  const tuples: string[] = [];
  for (const s of samples) {
    if (typeof s.kind !== "string" || typeof s.metric !== "string" || typeof s.value !== "number") continue;
    const base = params.length;
    if (s.recordedAt) {
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
      params.push(host, s.kind, s.subject ?? null, s.metric, s.value, new Date(s.recordedAt));
    } else {
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`);
      params.push(host, s.kind, s.subject ?? null, s.metric, s.value);
    }
  }
  if (tuples.length === 0) { res.json({ inserted: 0 }); return; }

  try {
    await query(
      `INSERT INTO metrics_samples (host, kind, subject, metric, value, recorded_at)
       VALUES ${tuples.join(", ")}`,
      params,
    );
    res.json({ inserted: tuples.length });
  } catch (err) {
    console.error("[metrics/ingest] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal error" });
  }
}

export default router;
