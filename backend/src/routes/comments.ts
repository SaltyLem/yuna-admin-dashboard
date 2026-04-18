import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getPublisher } from "../redis-pub.js";

const router = Router();

router.post("/send", async (req: Request, res: Response) => {
  const { channel, user, text, authorChannelId, isSuperchat, amount } = req.body as {
    channel?: string;
    user?: string;
    text?: string;
    authorChannelId?: string;
    isSuperchat?: boolean;
    amount?: string;
  };

  if (!channel || !user || !text) {
    res.status(400).json({ error: "channel, user, text are required" });
    return;
  }

  const id = `dummy_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const channelId = authorChannelId || `x_${crypto.randomBytes(4).toString("hex")}`;

  const payload = {
    platform: "youtube",
    channel,
    id,
    user,
    authorChannelId: channelId,
    authorPhoto: null,
    text,
    timestamp: Date.now(),
    isSuperchat: isSuperchat ?? false,
    amount: isSuperchat ? (amount ?? null) : null,
  };

  try {
    const pub = getPublisher();
    await pub.publish(`stream:${channel}:comments`, JSON.stringify(payload));
    res.json({ ok: true, id, authorChannelId: channelId });
  } catch (err) {
    res.status(500).json({ error: "Failed to publish comment" });
  }
});

export default router;
