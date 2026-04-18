/**
 * /worker/{tweets,donations,engagement} — thin proxies to
 * yuna-api /api/admin/*. Surfaces Twitter / donation / engagement
 * worker state for the admin dashboard's Worker section.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

async function proxy<T>(
  req: Request, res: Response, upstreamPath: string,
): Promise<void> {
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

router.get("/tweets",          (req, res) => proxy(req, res, "/api/admin/tweets"));
router.get("/donations",       (req, res) => proxy(req, res, "/api/admin/donations"));
router.get("/engagement",      (req, res) => proxy(req, res, "/api/admin/engagement"));
router.get("/engagement/:id",  (req, res) => proxy(req, res, `/api/admin/engagement/${encodeURIComponent(String(req.params["id"]))}`));

export default router;
