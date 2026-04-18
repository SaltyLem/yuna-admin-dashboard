import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

interface Row {
  id: number;
  message: string;
  enabled: boolean;
  priority: number;
  locale: "ja" | "en" | null;
  created_at: string;
  updated_at: string;
}

// GET /announcements?active=1&locale=ja (overlay polls — public)
//   - active=1 → enabled only
//   - locale=ja → rows where locale IS NULL OR locale='ja' (NULL = show everywhere)
router.get("/", async (req: Request, res: Response) => {
  const activeOnly = req.query.active === "1";
  const rawLocale = typeof req.query.locale === "string" ? req.query.locale : null;
  const locale = rawLocale === "ja" || rawLocale === "en" ? rawLocale : null;

  const conds: string[] = [];
  const params: unknown[] = [];
  if (activeOnly) conds.push("enabled = TRUE");
  if (locale) {
    params.push(locale);
    conds.push(`(locale IS NULL OR locale = $${params.length})`);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const result = await query<Row>(
    `SELECT id, message, enabled, priority, locale, created_at, updated_at
     FROM admin_announcements ${where}
     ORDER BY priority ASC, id DESC`,
    params,
  );
  res.json({ announcements: result.rows });
});

function normalizeLocale(v: unknown): "ja" | "en" | null {
  if (v === "ja" || v === "en") return v;
  return null;
}

// POST /announcements (auth)
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as Partial<Row>;
  const message = body.message;
  const enabled = body.enabled ?? true;
  const priority = body.priority ?? 100;
  const locale = normalizeLocale(body.locale);
  if (!message || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  const result = await query<Row>(
    `INSERT INTO admin_announcements (message, enabled, priority, locale)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [message, enabled, priority, locale],
  );
  res.json({ ok: true, announcement: result.rows[0] });
});

// PATCH /announcements/:id (auth)
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Partial<Row>;
  // locale: "ja" | "en" | null ("all"). Treat undefined = keep; null or other = set NULL.
  const localeProvided = Object.prototype.hasOwnProperty.call(body, "locale");
  const locale = localeProvided ? normalizeLocale(body.locale) : undefined;
  const result = await query<Row>(
    `UPDATE admin_announcements SET
       message    = COALESCE($1, message),
       enabled    = COALESCE($2, enabled),
       priority   = COALESCE($3, priority),
       locale     = CASE WHEN $5::boolean THEN $4 ELSE locale END,
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [
      body.message ?? null,
      body.enabled ?? null,
      body.priority ?? null,
      locale ?? null,
      localeProvided,
      id,
    ],
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
