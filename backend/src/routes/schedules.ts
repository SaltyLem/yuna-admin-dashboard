import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

// GET /schedules — 編集画面で一覧に使う。recurring/once 区別は行に入ってる。
router.get("/", async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT * FROM stream_schedules
     ORDER BY repeat_type, channel, COALESCE(start_time, starts_at::time)`,
  );
  res.json({ schedules: result.rows });
});

interface ScheduleBody {
  channel?: string;
  repeatType?: "once" | "daily" | "weekly";
  repeatDays?: number[];
  // once only
  startsAt?: string | null;
  endsAt?: string | null;
  // daily / weekly only
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  endsOn?: string | null;
  program?: string;
  label?: string;
  title?: string;
  enabled?: boolean;
}

// POST /schedules
router.post("/", async (req: Request, res: Response) => {
  const b = req.body as ScheduleBody;

  if (!b.channel || !b.repeatType || !b.program || !b.label) {
    res.status(400).json({ error: "channel / repeatType / program / label required" });
    return;
  }

  if (b.repeatType === "once") {
    if (!b.startsAt || !b.endsAt) {
      res.status(400).json({ error: "once schedule requires startsAt + endsAt" });
      return;
    }
    const result = await query(
      `INSERT INTO stream_schedules
         (channel, repeat_type, repeat_days, starts_at, ends_at, timezone, program, label, title)
       VALUES ($1, 'once', '{}', $2::timestamptz, $3::timestamptz, $4, $5, $6, $7)
       RETURNING *`,
      [b.channel, b.startsAt, b.endsAt, b.timezone ?? "Asia/Tokyo", b.program, b.label, b.title ?? ""],
    );
    res.json({ ok: true, schedule: result.rows[0] });
    return;
  }

  // daily / weekly
  if (!b.startTime || !b.endTime) {
    res.status(400).json({ error: "recurring schedule requires startTime + endTime" });
    return;
  }
  const result = await query(
    `INSERT INTO stream_schedules
       (channel, repeat_type, repeat_days, start_time, end_time, timezone, program, label, title)
     VALUES ($1, $2, $3, $4::time, $5::time, $6, $7, $8, $9)
     RETURNING *`,
    [
      b.channel,
      b.repeatType,
      b.repeatDays ?? [],
      b.startTime,
      b.endTime,
      b.timezone ?? "Asia/Tokyo",
      b.program,
      b.label,
      b.title ?? "",
    ],
  );
  res.json({ ok: true, schedule: result.rows[0] });
});

// PUT /schedules/:id
// 全フィールド optional。undefined なら既存値保持、明示 null で clear (endsOn のみ)。
router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const b = req.body as ScheduleBody;
  const endsOnProvided = Object.prototype.hasOwnProperty.call(req.body, "endsOn");

  const result = await query(
    `UPDATE stream_schedules
     SET channel     = COALESCE($1, channel),
         repeat_type = COALESCE($2, repeat_type),
         repeat_days = COALESCE($3, repeat_days),
         starts_at   = COALESCE($4::timestamptz, starts_at),
         ends_at     = COALESCE($5::timestamptz, ends_at),
         start_time  = COALESCE($6::time, start_time),
         end_time    = COALESCE($7::time, end_time),
         timezone    = COALESCE($8, timezone),
         program     = COALESCE($9, program),
         label       = COALESCE($10, label),
         title       = COALESCE($11, title),
         enabled     = COALESCE($12, enabled),
         ends_on     = CASE WHEN $14::boolean THEN $13::date ELSE ends_on END,
         updated_at  = NOW()
     WHERE id = $15
     RETURNING *`,
    [
      b.channel ?? null,
      b.repeatType ?? null,
      b.repeatDays ?? null,
      b.startsAt ?? null,
      b.endsAt ?? null,
      b.startTime ?? null,
      b.endTime ?? null,
      b.timezone ?? null,
      b.program ?? null,
      b.label ?? null,
      b.title ?? null,
      b.enabled ?? null,
      b.endsOn ?? null,
      endsOnProvided,
      id,
    ],
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, schedule: result.rows[0] });
});

// DELETE /schedules/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await query("DELETE FROM stream_schedules WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
