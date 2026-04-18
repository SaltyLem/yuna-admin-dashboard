/**
 * /forex — thin proxy to yuna-api /api/admin/forex.
 *
 * Admin dashboard and the frontend KPI use this to convert superchat
 * amounts in arbitrary currencies to USD without each consumer having
 * to know the underlying FX source.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json(await yunaApi(`/api/admin/forex`));
  } catch (err) {
    if (err instanceof YunaApiError) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(502).json({ error: "Upstream error" });
    }
  }
});

export default router;
