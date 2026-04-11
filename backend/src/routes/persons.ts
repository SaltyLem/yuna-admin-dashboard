import { Router, Request, Response } from "express";
import { query } from "../db/client.js";

const router = Router();

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

export default router;
