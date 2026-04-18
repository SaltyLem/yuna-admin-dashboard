import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getPublisher } from "../redis-pub.js";
import { toUsd } from "../forex-client.js";

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

  // When superchat, resolve USD up front at the scraper boundary so
  // every downstream consumer sees a number in USD.
  const amt = isSuperchat ? await toUsd(amount ?? null) : {
    amount_raw: null, amount_currency: null, amount_value: null, amount_usd: null,
  };

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
    amount_raw: amt.amount_raw,
    amount_currency: amt.amount_currency,
    amount_value: amt.amount_value,
    amount_usd: amt.amount_usd,
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
