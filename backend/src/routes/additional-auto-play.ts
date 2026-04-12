import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "../db/sqlite.js";
import { getAAPConfig, setAAPConfig, startAAPSubscriber } from "../additional-auto-play.js";

const router = Router();

// ── Config ──
router.get("/config", (_req: Request, res: Response) => {
  res.json(getAAPConfig());
});

router.post("/config", (req: Request, res: Response) => {
  setAAPConfig(req.body);
  if (req.body.enabled) startAAPSubscriber();
  res.json({ ok: true, config: getAAPConfig() });
});

// ── Viewers ──
router.get("/viewers", (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page ?? "1"), 10);
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
  const location = req.query.location ? String(req.query.location) : null;
  const offset = (page - 1) * limit;

  const db = getDb();
  const where = location ? "WHERE location = ?" : "";
  const params = location ? [location, limit, offset] : [limit, offset];

  const viewers = db.prepare(
    "SELECT * FROM virtual_viewers " + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
  ).all(...params);

  const total = (db.prepare(
    "SELECT COUNT(*) as c FROM virtual_viewers " + where
  ).get(...(location ? [location] : [])) as { c: number }).c;

  res.json({ viewers, total, page, limit });
});

router.post("/viewers", (req: Request, res: Response) => {
  const db = getDb();
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insert = db.prepare(
    "INSERT INTO virtual_viewers (name, author_channel_id, location) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const item of items) {
      const cid = item.authorChannelId || ("x_" + crypto.randomBytes(6).toString("hex"));
      insert.run(item.name, cid, item.location ?? "ja");
    }
  });
  tx();
  res.json({ ok: true, count: items.length });
});

router.delete("/viewers", (req: Request, res: Response) => {
  const { ids } = req.body as { ids: number[] };
  if (!ids || ids.length === 0) { res.status(400).json({ error: "ids required" }); return; }
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare("DELETE FROM virtual_viewers WHERE id IN (" + placeholders + ")").run(...ids);
  res.json({ ok: true, deleted: ids.length });
});

router.post("/viewers/generate", (req: Request, res: Response) => {
  const { count, location } = req.body as { count: number; location: "ja" | "en" };
  if (!count || !location) { res.status(400).json({ error: "count and location required" }); return; }

  const db = getDb();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO virtual_viewers (name, author_channel_id, location) VALUES (?, ?, ?)"
  );

  const jaLast = ["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","松本","井上","木村","林","清水","池田","森","橋本"];
  const jaFirst = ["太郎","花子","翔","陽菜","蓮","さくら","悠真","結衣","大翔","葵","優","真央","健太","彩","拓海","七海"];
  const jaSuffix = ["","ch","TV","_gaming","0123","888","desu","_love","fan"];
  const enFirst = ["Alex","Jordan","Sam","Taylor","Morgan","Casey","Riley","Max","Charlie","Kai","Luna","Nova","Sage","River","Phoenix","Ember","Jade","Blake","Finn","Wren"];
  const enSuffix = ["","_yt","123","_gaming","TV","_live","99","xd","plays","vibes"];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const name = location === "ja"
        ? (Math.random() > 0.5 ? pick(jaLast) + pick(jaFirst) : pick(jaFirst)) + pick(jaSuffix)
        : pick(enFirst) + pick(enSuffix) + (Math.random() > 0.5 ? String(Math.floor(Math.random() * 999)) : "");
      insert.run(name, "x_" + crypto.randomBytes(6).toString("hex"), location);
    }
  });
  tx();
  res.json({ ok: true, generated: count });
});

// ── Reactions ──
router.get("/reactions", (req: Request, res: Response) => {
  const location = req.query.location ? String(req.query.location) : null;
  const db = getDb();
  const rows = location
    ? db.prepare("SELECT * FROM quick_reactions WHERE location = ? ORDER BY id").all(location)
    : db.prepare("SELECT * FROM quick_reactions ORDER BY location, id").all();
  res.json({ reactions: rows });
});

router.post("/reactions", (req: Request, res: Response) => {
  const db = getDb();
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insert = db.prepare("INSERT INTO quick_reactions (location, text) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const item of items) insert.run(item.location ?? "ja", item.text);
  });
  tx();
  res.json({ ok: true, count: items.length });
});

router.delete("/reactions", (req: Request, res: Response) => {
  const { ids } = req.body as { ids: number[] };
  if (!ids || ids.length === 0) { res.status(400).json({ error: "ids required" }); return; }
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare("DELETE FROM quick_reactions WHERE id IN (" + placeholders + ")").run(...ids);
  res.json({ ok: true, deleted: ids.length });
});

export default router;
