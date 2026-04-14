/**
 * /goals — admin dashboard proxy to yuna-api /api/admin/goals.
 * The upstream endpoint accepts requireAdminOrApiKey, so we pass the API key
 * in the yuna-api helper. Session auth is enforced at index.ts.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[goals] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const qs = new URLSearchParams();
    for (const k of ["status", "type", "page", "limit", "sort", "order"]) {
      const v = req.query[k];
      if (typeof v === "string") qs.set(k, v);
    }
    const path = `/api/admin/goals${qs.toString() ? `?${qs}` : ""}`;
    const data = await yunaApi(path);
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = await yunaApi("/api/admin/goals", {
      method: "POST",
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const data = await yunaApi(`/api/admin/goals/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const data = await yunaApi(`/api/admin/goals/${req.params.id}`, {
      method: "DELETE",
    });
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

export default router;
