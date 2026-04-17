import { Router, Request, Response } from "express";
import { query } from "../db/client.js";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[persons] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "");
  if (q.length < 2) {
    res.json({ persons: [] });
    return;
  }

  const pattern = `%${q}%`;
  try {
    const result = await query(
      `SELECT DISTINCT p.id, p.primary_name, p.nickname,
              pi.platform, pi.platform_uid, pi.display_name
       FROM persons p
       LEFT JOIN person_identities pi ON pi.person_id = p.id
       WHERE p.primary_name ILIKE $1
          OR pi.display_name ILIKE $1
          OR pi.platform_uid ILIKE $1
       ORDER BY p.primary_name
       LIMIT 20`,
      [pattern],
    );

    // person ごとにグループ化
    const map = new Map<string, { id: string; primaryName: string; nickname: string | null; identities: Array<{ platform: string; platformUid: string }> }>();
    for (const row of result.rows as Array<Record<string, unknown>>) {
      const id = String(row.id);
      if (!map.has(id)) {
        map.set(id, {
          id,
          primaryName: String(row.primary_name ?? ""),
          nickname: row.nickname ? String(row.nickname) : null,
          identities: [],
        });
      }
      if (row.platform && row.platform_uid) {
        map.get(id)!.identities.push({
          platform: String(row.platform),
          platformUid: String(row.platform_uid),
        });
      }
    }

    res.json({ persons: [...map.values()] });
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

// ───────── yuna-api proxy (admin CRUD on persons table) ─────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const qs = new URLSearchParams();
    for (const k of ["type", "page", "limit", "sort", "order"]) {
      const v = req.query[k];
      if (typeof v === "string") qs.set(k, v);
    }
    const path = `/api/admin/persons${qs.toString() ? `?${qs}` : ""}`;
    res.json(await yunaApi(path));
  } catch (err) { forwardError(res, err); }
});

router.get("/levels", async (_req, res) => {
  try {
    res.json(await yunaApi(`/api/admin/persons/levels`));
  } catch (err) { forwardError(res, err); }
});

router.get("/:id", async (req, res) => {
  // Avoid swallowing /search and /levels (handled above).
  if (req.params.id === "search" || req.params.id === "levels") {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    res.json(await yunaApi(`/api/admin/persons/${encodeURIComponent(req.params.id)}`));
  } catch (err) { forwardError(res, err); }
});

router.patch("/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/persons/${encodeURIComponent(req.params.id)}`, {
      method: "PATCH",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

export default router;
