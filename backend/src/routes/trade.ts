/**
 * /trade — proxy to yuna-api /api/admin/trade.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

async function proxy<T>(req: Request, res: Response, upstreamPath: string): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const full = qs.toString() ? `${upstreamPath}?${qs}` : upstreamPath;
  try {
    res.json(await yunaApi<T>(full));
  } catch (err) {
    if (err instanceof YunaApiError) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(502).json({ error: "Upstream error" });
    }
  }
}

router.get("/treasury", (req, res) => proxy(req, res, "/api/admin/trade/treasury"));
router.get("/history",  (req, res) => proxy(req, res, "/api/admin/trade/history"));
router.get("/wallets",  (req, res) => proxy(req, res, "/api/admin/trade/wallets"));
router.get("/tokens",   (req, res) => proxy(req, res, "/api/admin/trade/tokens"));

export default router;
