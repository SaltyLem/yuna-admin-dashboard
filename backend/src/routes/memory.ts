/**
 * /memory/* — admin dashboard proxy to yuna-api /api/admin/memory.
 */

import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

function forwardError(res: Response, err: unknown) {
  if (err instanceof YunaApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("[memory] upstream error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Upstream error" });
  }
}

const LIST_QUERY_KEYS = ["page", "limit", "sort", "order"];
const EPISODE_FILTERS = ["spatial", "depth", "subject_key"];
const FACT_FILTERS = ["fact_type", "domain", "source"];
const SITUATION_FILTERS = ["status", "depth", "spatial", "subject_key"];

function buildQs(req: Request, extraKeys: string[]): string {
  const qs = new URLSearchParams();
  for (const k of [...LIST_QUERY_KEYS, ...extraKeys]) {
    const v = req.query[k];
    if (typeof v === "string") qs.set(k, v);
  }
  return qs.toString();
}

// ───────── episodes (v2) ─────────

router.get("/episodes", async (req, res) => {
  try {
    const qs = buildQs(req, EPISODE_FILTERS);
    const data = await yunaApi(`/api/admin/memory/episodes${qs ? `?${qs}` : ""}`);
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.get("/episodes/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/episodes/${req.params.id}`);
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.post("/episodes", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/episodes`, {
      method: "POST",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.status(201).json(data);
  } catch (err) { forwardError(res, err); }
});

router.patch("/episodes/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/episodes/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.delete("/episodes/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/episodes/${req.params.id}`, {
      method: "DELETE",
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

// ───────── semantic facts ─────────

router.get("/semantic-facts", async (req, res) => {
  try {
    const qs = buildQs(req, FACT_FILTERS);
    const data = await yunaApi(`/api/admin/memory/semantic-facts${qs ? `?${qs}` : ""}`);
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.delete("/semantic-facts/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/semantic-facts/${req.params.id}`, {
      method: "DELETE",
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

// ───────── situations (v2) ─────────

router.get("/situations", async (req, res) => {
  try {
    const qs = buildQs(req, SITUATION_FILTERS);
    const data = await yunaApi(`/api/admin/memory/situations${qs ? `?${qs}` : ""}`);
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.get("/situations/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/situations/${req.params.id}`);
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.post("/situations", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/situations`, {
      method: "POST",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.status(201).json(data);
  } catch (err) { forwardError(res, err); }
});

router.patch("/situations/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/situations/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify(req.body),
      headers: { "Content-Type": "application/json" },
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

router.delete("/situations/:id", async (req, res) => {
  try {
    const data = await yunaApi(`/api/admin/memory/situations/${req.params.id}`, {
      method: "DELETE",
    });
    res.json(data);
  } catch (err) { forwardError(res, err); }
});

export default router;
