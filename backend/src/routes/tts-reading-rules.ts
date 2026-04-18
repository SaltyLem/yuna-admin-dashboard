import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

interface RuleRow {
  id: number;
  language: string;
  scope: "pre" | "post";
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  enabled: boolean;
  note: string;
  created_at: string;
  updated_at: string;
}

// GET /tts/reading-rules?language=ja
// Wrapper polls this every minute. Returns enabled-only by default.
router.get("/", async (req: Request, res: Response) => {
  const language = typeof req.query.language === "string" ? req.query.language : "ja";
  const includeDisabled = req.query.all === "1";
  const where = includeDisabled
    ? "WHERE language = $1"
    : "WHERE language = $1 AND enabled = TRUE";
  const result = await query<RuleRow>(
    `SELECT id, language, scope, pattern, replacement, flags, priority, enabled, note, created_at, updated_at
     FROM tts_reading_rules
     ${where}
     ORDER BY scope DESC, priority ASC, id ASC`,
    [language],
  );
  res.json({ rules: result.rows });
});

// POST /tts/reading-rules
router.post("/", async (req: Request, res: Response) => {
  const {
    language = "ja",
    scope = "post",
    pattern,
    replacement,
    flags = "",
    priority = 100,
    enabled = true,
    note = "",
  } = req.body as Partial<RuleRow>;
  if (!pattern || replacement === undefined) {
    res.status(400).json({ error: "pattern and replacement are required" });
    return;
  }
  try {
    new RegExp(pattern); // sanity check
  } catch (err) {
    res.status(400).json({ error: "invalid regex", detail: String(err) });
    return;
  }
  const result = await query<RuleRow>(
    `INSERT INTO tts_reading_rules (language, scope, pattern, replacement, flags, priority, enabled, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [language, scope, pattern, replacement, flags, priority, enabled, note],
  );
  res.json({ ok: true, rule: result.rows[0] });
});

// PATCH /tts/reading-rules/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const body = req.body as Partial<RuleRow>;
  if (body.pattern) {
    try { new RegExp(body.pattern); }
    catch (err) {
      res.status(400).json({ error: "invalid regex", detail: String(err) });
      return;
    }
  }
  const result = await query<RuleRow>(
    `UPDATE tts_reading_rules SET
       language    = COALESCE($1, language),
       scope       = COALESCE($2, scope),
       pattern     = COALESCE($3, pattern),
       replacement = COALESCE($4, replacement),
       flags       = COALESCE($5, flags),
       priority    = COALESCE($6, priority),
       enabled     = COALESCE($7, enabled),
       note        = COALESCE($8, note),
       updated_at  = NOW()
     WHERE id = $9 RETURNING *`,
    [
      body.language ?? null,
      body.scope ?? null,
      body.pattern ?? null,
      body.replacement ?? null,
      body.flags ?? null,
      body.priority ?? null,
      body.enabled ?? null,
      body.note ?? null,
      id,
    ],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true, rule: result.rows[0] });
});

// DELETE /tts/reading-rules/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await query("DELETE FROM tts_reading_rules WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
