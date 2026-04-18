/**
 * /crawl — thin proxy to yuna-api /crawl.
 *
 * Surfaces the crawler's `crawl_sources` and `crawl_articles` tables
 * for the admin dashboard's Worker → Crawl pages.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

async function proxy<T>(
  req: Request,
  res: Response,
  upstreamPath: string,
): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const full = qs.toString() ? `${upstreamPath}?${qs}` : upstreamPath;
  const init: RequestInit = { method: req.method };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = JSON.stringify(req.body ?? {});
  }
  try {
    res.json(await yunaApi<T>(full, init));
  } catch (err) {
    if (err instanceof YunaApiError) {
      res.status(err.status).json({ error: err.message });
    } else {
      res.status(502).json({ error: "Upstream error" });
    }
  }
}

// Articles
router.get("/articles", (req, res) => proxy(req, res, "/crawl/articles"));
router.get("/articles/stats", (req, res) => proxy(req, res, "/crawl/articles/stats"));
router.get("/articles/:id", (req, res) => proxy(req, res, `/crawl/articles/${encodeURIComponent(String(req.params["id"]))}`));

// Sources (CRUD)
router.get("/sources", (req, res) => proxy(req, res, "/crawl/sources"));
router.post("/sources", (req, res) => proxy(req, res, "/crawl/sources"));
router.put("/sources/:id", (req, res) => proxy(req, res, `/crawl/sources/${encodeURIComponent(String(req.params["id"]))}`));
router.delete("/sources/:id", (req, res) => proxy(req, res, `/crawl/sources/${encodeURIComponent(String(req.params["id"]))}`));

export default router;
