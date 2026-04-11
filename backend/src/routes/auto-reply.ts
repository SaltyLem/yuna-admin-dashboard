import { Router, Request, Response } from "express";
import { getConfig, setConfig, startSpeakSubscriber } from "../auto-reply.js";

const router = Router();
let subscriberStarted = false;

router.get("/config", (_req: Request, res: Response) => {
  res.json(getConfig());
});

router.post("/config", (req: Request, res: Response) => {
  setConfig(req.body);

  // 初回有効化時に subscriber を開始
  if (!subscriberStarted && req.body.enabled) {
    startSpeakSubscriber();
    subscriberStarted = true;
  }

  res.json({ ok: true, config: getConfig() });
});

export default router;
