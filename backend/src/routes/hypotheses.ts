/**
 * /hypotheses — admin dashboard proxy to yuna-api /api/admin/hypotheses.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[hypotheses] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const qs = new URLSearchParams();
    for (const k of ["status", "category", "page", "limit", "sort", "order"]) {
      const v = req.query[k];
      if (typeof v === "string") qs.set(k, v);
    }
    const path = `/api/admin/hypotheses${qs.toString() ? `?${qs}` : ""}`;
    res.json(await yunaApi(path));
  } catch (err) { forwardError(res, err); }
});

router.get("/:id", async (req, res) => {
  try {
    res.json(await yunaApi(`/api/admin/hypotheses/${req.params.id}`));
  } catch (err) { forwardError(res, err); }
});

router.post("/", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/hypotheses`, {
      method: "POST",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.status(201).json(data);
  } catch (err) { forwardError(res, err); }
});

router.patch("/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/hypotheses/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.delete("/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/hypotheses/${req.params.id}`, { method: "DELETE" });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

export default router;
