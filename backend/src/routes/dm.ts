import { Router, type Request, type Response } from "express";
import { yunaApi, YunaApiError } from "../yuna-api.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const result = await yunaApi("/api/admin/dm", {
      method: "POST",
      body: JSON.stringify(req.body ?? {}),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof YunaApiError) {
      res.status(err.status).json({ error: err.message, body: err.body });
    } else {
      console.error("[dm] upstream error:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "Upstream error" });
    }
  }
});

export default router;
