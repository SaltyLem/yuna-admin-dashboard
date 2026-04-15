import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[cycle-blocks] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const qs = new URLSearchParams();
    for (const k of ["status", "page", "limit", "sort", "order"]) {
      const v = req.query[k];
      if (typeof v === "string") qs.set(k, v);
    }
    const path = `/api/admin/cycle-blocks${qs.toString() ? `?${qs}` : ""}`;
    res.json(await yunaApi(path));
  } catch (err) { forwardError(res, err); }
});

router.get("/:id", async (req, res) => {
  try {
    res.json(await yunaApi(`/api/admin/cycle-blocks/${encodeURIComponent(req.params.id)}`));
  } catch (err) { forwardError(res, err); }
});

export default router;
