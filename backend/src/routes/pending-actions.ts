/**
 * /pending-actions — proxy to yuna-api /api/admin/pending-actions.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[pending-actions] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const qs = new URLSearchParams();
    for (const k of ["filter", "action_type", "subject_key", "page", "limit", "sort", "order"]) {
      const v = req.query[k];
      if (typeof v === "string") qs.set(k, v);
    }
    const path = `/api/admin/pending-actions${qs.toString() ? `?${qs}` : ""}`;
    res.json(await yunaApi(path));
  } catch (err) { forwardError(res, err); }
});

router.get("/:actionId", async (req, res) => {
  try {
    res.json(await yunaApi(`/api/admin/pending-actions/${encodeURIComponent(req.params.actionId)}`));
  } catch (err) { forwardError(res, err); }
});

router.post("/:actionId/resolve", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/pending-actions/${encodeURIComponent(req.params.actionId)}/resolve`, {
      method: "POST",
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

export default router;
