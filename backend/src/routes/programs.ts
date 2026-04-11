import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

// GET /programs
router.get("/", async (_req: Request, res: Response) => {
  const result = await query("SELECT * FROM stream_programs ORDER BY name");
  res.json({ programs: result.rows });
});

// POST /programs
router.post("/", async (req: Request, res: Response) => {
  const { name, overlayPath, description } = req.body as {
    name: string;
    overlayPath?: string;
    description?: string;
  };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const result = await query(
      "INSERT INTO stream_programs (name, overlay_path, description) VALUES ($1, $2, $3) RETURNING *",
      [name, overlayPath ?? "/default", description ?? ""],
    );
    res.json({ ok: true, program: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Program already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to create program" });
  }
});

// PUT /programs/:id
router.put("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const { name, overlayPath, description } = req.body as {
    name?: string;
    overlayPath?: string;
    description?: string;
  };
  const result = await query(
    `UPDATE stream_programs
     SET name = COALESCE($1, name),
         overlay_path = COALESCE($2, overlay_path),
         description = COALESCE($3, description)
     WHERE id = $4 RETURNING *`,
    [name, overlayPath, description, id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, program: result.rows[0] });
});

// DELETE /programs/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await query("DELETE FROM stream_programs WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
