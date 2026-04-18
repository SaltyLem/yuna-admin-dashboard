import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

interface Row {
  id: number;
  message: string;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

// GET /announcements?active=1 (overlay polls — public)
router.get("/", async (req: Request, res: Response) => {
  const activeOnly = req.query.active === "1";
  const where = activeOnly ? "WHERE enabled = TRUE" : "";
  const result = await query<Row>(
    `SELECT id, message, enabled, priority, created_at, updated_at
     FROM admin_announcements ${where}
     ORDER BY priority ASC, id DESC`,
  );
  res.json({ announcements: result.rows });
});

// POST /announcements (auth)
router.post("/", async (req: Request, res: Response) => {
  const { message, enabled = true, priority = 100 } = req.body as Partial<Row>;
  if (!message || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  const result = await query<Row>(
    `INSERT INTO admin_announcements (message, enabled, priority)
     VALUES ($1, $2, $3) RETURNING *`,
    [message, enabled, priority],
  );
  res.json({ ok: true, announcement: result.rows[0] });
});

// PATCH /announcements/:id (auth)
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Partial<Row>;
  const result = await query<Row>(
    `UPDATE admin_announcements SET
       message    = COALESCE($1, message),
       enabled    = COALESCE($2, enabled),
       priority   = COALESCE($3, priority),
       updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [body.message ?? null, body.enabled ?? null, body.priority ?? null, id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true, announcement: result.rows[0] });
});

// DELETE /announcements/:id (auth)
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await query("DELETE FROM admin_announcements WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
