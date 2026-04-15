/**
 * /state — admin dashboard proxy to yuna-api /api/admin/state.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[state] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json(await yunaApi(`/api/admin/state`));
  } catch (err) { forwardError(res, err); }
});

export default router;
