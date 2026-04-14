import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

// GET /schedules
router.get("/", async (_req: Request, res: Response) => {
  const result = await query(
    "SELECT * FROM stream_schedules ORDER BY repeat_type, channel, start_minutes",
  );
  res.json({ schedules: result.rows });
});

// POST /schedules
router.post("/", async (req: Request, res: Response) => {
  const { channel, repeatType, repeatDays, date, startMinutes, endMinutes, program, label, title } = req.body as {
    channel: string;
    repeatType: string;
    repeatDays?: number[];
    date?: string | null;
    startMinutes: number;
    endMinutes: number;
    program: string;
    label: string;
    title?: string;
  };

  if (!channel || !repeatType || startMinutes == null || endMinutes == null || !program || !label) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const result = await query(
    `INSERT INTO stream_schedules (channel, repeat_type, repeat_days, date, start_minutes, end_minutes, program, label, title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [channel, repeatType, repeatDays ?? [], date ?? null, startMinutes, endMinutes, program, label, title ?? ""],
  );
  res.json({ ok: true, schedule: result.rows[0] });
});

// PUT /schedules/:id
router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { channel, repeatType, repeatDays, date, endsOn, startMinutes, endMinutes, program, label, title, enabled } = req.body as {
    channel?: string;
    repeatType?: string;
    repeatDays?: number[];
    date?: string | null;
    endsOn?: string | null;
    startMinutes?: number;
    endMinutes?: number;
    program?: string;
    label?: string;
    title?: string;
    enabled?: boolean;
  };

  // Distinguish "not provided" from "null". Explicit null clears ends_on.
  const endsOnProvided = Object.prototype.hasOwnProperty.call(req.body, "endsOn");

  const result = await query(
    `UPDATE stream_schedules
     SET channel = COALESCE($1, channel),
         repeat_type = COALESCE($2, repeat_type),
         repeat_days = COALESCE($3, repeat_days),
         date = COALESCE($4, date),
         start_minutes = COALESCE($5, start_minutes),
         end_minutes = COALESCE($6, end_minutes),
         program = COALESCE($7, program),
         label = COALESCE($8, label),
         title = COALESCE($9, title),
         enabled = COALESCE($10, enabled),
         ends_on = CASE WHEN $12::boolean THEN $11::date ELSE ends_on END,
         updated_at = NOW()
     WHERE id = $13 RETURNING *`,
    [channel, repeatType, repeatDays, date, startMinutes, endMinutes, program, label, title, enabled, endsOn ?? null, endsOnProvided, id],
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
