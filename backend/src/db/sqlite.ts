import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = process.env["SQLITE_PATH"] ?? "/data/viewers.db";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export function initSqlite(): void {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS virtual_viewers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      author_channel_id TEXT UNIQUE NOT NULL,
      location TEXT NOT NULL CHECK(location IN ('ja', 'en')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quick_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL CHECK(location IN ('ja', 'en')),
      text TEXT NOT NULL
    );
  `);

  // シードがなければ初期データ投入
  const viewerCount = (d.prepare("SELECT COUNT(*) as c FROM virtual_viewers").get() as { c: number }).c;
  if (viewerCount === 0) {
    seedViewers(d);
    console.log("[sqlite] seeded virtual viewers");
  }

  const reactionCount = (d.prepare("SELECT COUNT(*) as c FROM quick_reactions").get() as { c: number }).c;
  if (reactionCount === 0) {
    seedReactions(d);
    console.log("[sqlite] seeded quick reactions");
  }

  console.log("[sqlite] initialized at " + DB_PATH);
}

function randomChannelId(): string {
  return "x_" + crypto.randomBytes(6).toString("hex");
}

function seedViewers(d: Database.Database): void {
  const jaLastNames = ["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","松本","井上","木村","林","清水","山崎","池田","阿部","森","橋本","石川","前田","藤田","岡田","後藤","長谷川","村上","近藤"];
  const jaFirstNames = ["太郎","花子","翔","陽菜","蓮","さくら","悠真","結衣","大翔","葵","陸","美咲","颯太","凛","健太","彩","拓海","七海","優","真央"];
  const jaSuffixes = ["","ch","_official","TV","_gaming","0123","_ch","888","desu","kun","san","dayo","_love","mania","fan"];

  const enFirstNames = ["Alex","Jordan","Sam","Taylor","Morgan","Casey","Riley","Quinn","Avery","Skyler","Max","Charlie","Kai","Luna","Nova","Sage","River","Phoenix","Ember","Storm","Jade","Blake","Drew","Ash","Finn","Zion","Eden","Cruz","Wren","Remy"];
  const enSuffixes = ["","_yt","123","_gaming","TV","official","_live","99","xd","_fan","plays","vibes","_real","zone","hub"];

  const insert = d.prepare("INSERT INTO virtual_viewers (name, author_channel_id, location) VALUES (?, ?, ?)");
  const tx = d.transaction(() => {
    // JA 500
    for (let i = 0; i < 500; i++) {
      const last = jaLastNames[Math.floor(Math.random() * jaLastNames.length)];
      const first = jaFirstNames[Math.floor(Math.random() * jaFirstNames.length)];
      const suffix = jaSuffixes[Math.floor(Math.random() * jaSuffixes.length)];
      const name = Math.random() > 0.5 ? last + first + suffix : first + suffix;
      insert.run(name, randomChannelId(), "ja");
    }
    // EN 500
    for (let i = 0; i < 500; i++) {
      const first = enFirstNames[Math.floor(Math.random() * enFirstNames.length)];
      const suffix = enSuffixes[Math.floor(Math.random() * enSuffixes.length)];
      const num = Math.random() > 0.5 ? String(Math.floor(Math.random() * 999)) : "";
      insert.run(first + suffix + num, randomChannelId(), "en");
    }
  });
  tx();
}

function seedReactions(d: Database.Database): void {
  const jaReactions = ["草","わかる","それな","www","すごい","かわいい","やば","えー","おお","なるほど","良き","神","マジ","最高","ワロタ","えぐい","うける","へー","ほんそれ","あー","いいね","確かに","わろた","まじか","ほう","おもろ","えw","ふむふむ","きた","おー","よき","せやな","ないわ","すこ","ぴえん","エモい","尊い","はえー","ほんま","やるやん","天才","笑","激アツ","ナイス","わかりみ","泣ける","きたー","まじ","おつ","888"];
  const enReactions = ["lol","nice","wow","true","same","lmao","haha","fr","based","facts","bruh","gg","W","lets go","no way","sick","mood","real","yoo","goated","fire","sheesh","nah","bet","cap","ong","rip","pog","kek","oof","yep","nope","dang","ayy","lmfao","ikr","slay","bussin","vibes","sus","yo","big W","L","ez","cracked","clutch","insane","wait what","deadass","lessgo"];

  const insert = d.prepare("INSERT INTO quick_reactions (location, text) VALUES (?, ?)");
  const tx = d.transaction(() => {
    for (const r of jaReactions) insert.run("ja", r);
    for (const r of enReactions) insert.run("en", r);
  });
  tx();
}
