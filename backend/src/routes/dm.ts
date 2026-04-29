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
      // upstream の JSON body をそのまま forward (debug 情報の env / twitter* を保持)
      const body = (err.body && typeof err.body === "object")
        ? err.body as Record<string, unknown>
        : { error: err.message };
      res.status(err.status).json(body);
    } else {
      console.error("[dm] upstream error:", err instanceof Error ? err.message : err);
      res.status(502).json({ error: "Upstream error", message: err instanceof Error ? err.message : String(err) });
    }
  }
});

export default router;
