/**
 * Additional Auto Play Worker
 *
 * 仮想視聴者プールからN人を選出し、確率的にコメントを生成して publish する。
 * クイックリアクション (LLMなし) と LLM生成を混合。
 */

import { Redis } from "ioredis";
import crypto from "crypto";
import { getPublisher } from "./redis-pub.js";
import { getDb } from "./db/sqlite.js";
import { generateJson, parseCommentsJson } from "./ollama.js";

const REDIS_STREAM_URL = process.env["REDIS_STREAM_URL"] ?? "redis://localhost:6381";

export interface AAPConfig {
  enabled: boolean;
  mode: "live" | "always";
  channel: "ja" | "en";
  activeViewerCount: number;
  reactionProbability: number;
  quickReactionRatio: number;
  minDelay: number;
  maxDelay: number;
}

let config: AAPConfig = {
  enabled: false,
  mode: "live",
  channel: "ja",
  activeViewerCount: 20,
  reactionProbability: 0.3,
  quickReactionRatio: 0.6,
  minDelay: 5,
  maxDelay: 30,
};

let lastSpeak: { text: string; timestamp: number } | null = null;
let lastProcessedTimestamp = 0;
let speakSub: Redis | null = null;

export function getAAPConfig(): AAPConfig {
  return { ...config };
}

export function setAAPConfig(c: Partial<AAPConfig>): void {
  if (c.enabled !== undefined) config.enabled = c.enabled;
  if (c.mode !== undefined) config.mode = c.mode;
  if (c.channel !== undefined) config.channel = c.channel;
  if (c.activeViewerCount !== undefined) config.activeViewerCount = c.activeViewerCount;
  if (c.reactionProbability !== undefined) config.reactionProbability = c.reactionProbability;
  if (c.quickReactionRatio !== undefined) config.quickReactionRatio = c.quickReactionRatio;
  if (c.minDelay !== undefined) config.minDelay = c.minDelay;
  if (c.maxDelay !== undefined) config.maxDelay = c.maxDelay;
}

let alwaysTimer: ReturnType<typeof setInterval> | null = null;

export function startAAPSubscriber(): void {
  if (speakSub) return;
  speakSub = new Redis(REDIS_STREAM_URL);
  speakSub.on("error", () => {});

  void speakSub.subscribe("stream:ja:speak", "stream:en:speak").then(() => {
    console.log("[aap] subscribed to stream:{ja,en}:speak");
  });

  speakSub.on("message", (_channel, message) => {
    try {
      const data = JSON.parse(message) as { utterances?: Array<{ text?: string }> };
      if (data.utterances && data.utterances.length > 0) {
        const texts = data.utterances.map((u) => u.text ?? "").filter(Boolean);
        if (texts.length > 0) {
          lastSpeak = { text: texts.join(" "), timestamp: Date.now() };
          if (config.enabled) void processSpeak();
        }
      }
    } catch {}
  });

  startAlwaysTimer();
}

function startAlwaysTimer(): void {
  if (alwaysTimer) clearInterval(alwaysTimer);
  alwaysTimer = setInterval(() => {
    if (config.enabled && config.mode === "always") {
      void processQuickOnly();
    }
  }, 15000);
}

async function processQuickOnly(): Promise<void> {
  const db = getDb();
  const viewers = db.prepare(
    "SELECT id, name, author_channel_id FROM virtual_viewers WHERE location = ? ORDER BY RANDOM() LIMIT ?"
  ).all(config.channel, config.activeViewerCount) as Array<{ id: number; name: string; author_channel_id: string }>;

  const reacting = viewers.filter(() => Math.random() < config.reactionProbability);
  if (reacting.length === 0) return;

  const pub = getPublisher();
  for (const viewer of reacting) {
    const reaction = db.prepare(
      "SELECT text FROM quick_reactions WHERE location = ? ORDER BY RANDOM() LIMIT 1"
    ).get(config.channel) as { text: string } | undefined;
    if (!reaction) continue;

    const delay = randomDelay();
    setTimeout(() => {
      const payload = buildPayload(viewer.name, viewer.author_channel_id, reaction.text);
      void pub.publish(`stream:${config.channel}:comments`, JSON.stringify(payload));
      console.log("[aap:always] " + viewer.name + ": " + reaction.text);
    }, delay);
  }
}

async function processSpeak(): Promise<void> {
  if (!lastSpeak || lastSpeak.timestamp === lastProcessedTimestamp) return;
  lastProcessedTimestamp = lastSpeak.timestamp;
  const speakText = lastSpeak.text;

  const db = getDb();

  // 1. N人をランダム選出
  const viewers = db.prepare(
    "SELECT id, name, author_channel_id FROM virtual_viewers WHERE location = ? ORDER BY RANDOM() LIMIT ?"
  ).all(config.channel, config.activeViewerCount) as Array<{ id: number; name: string; author_channel_id: string }>;

  if (viewers.length === 0) return;

  // 2. 確率でスキップ
  const reacting = viewers.filter(() => Math.random() < config.reactionProbability);
  if (reacting.length === 0) return;

  // 3. クイック組 / LLM組に分割
  const splitIdx = Math.floor(reacting.length * config.quickReactionRatio);
  const quickGroup = reacting.slice(0, splitIdx);
  const llmGroup = reacting.slice(splitIdx);

  const pub = getPublisher();

  // クイック組: DBからランダムリアクション
  for (const viewer of quickGroup) {
    const reaction = db.prepare(
      "SELECT text FROM quick_reactions WHERE location = ? ORDER BY RANDOM() LIMIT 1"
    ).get(config.channel) as { text: string } | undefined;

    if (!reaction) continue;

    const delay = randomDelay();
    setTimeout(() => {
      const payload = buildPayload(viewer.name, viewer.author_channel_id, reaction.text);
      void pub.publish(`stream:${config.channel}:comments`, JSON.stringify(payload));
      console.log("[aap:quick] " + viewer.name + ": " + reaction.text + " (" + (delay / 1000).toFixed(0) + "s)");
    }, delay);
  }

  // LLM組: Vertex AI で一括生成
  if (llmGroup.length > 0) {
    try {
      const comments = await generateLLMComments(speakText, llmGroup);
      for (const c of comments) {
        const delay = randomDelay();
        setTimeout(() => {
          const payload = buildPayload(c.name, c.channelId, c.comment);
          void pub.publish(`stream:${config.channel}:comments`, JSON.stringify(payload));
          console.log("[aap:llm] " + c.name + ": " + c.comment.slice(0, 30) + " (" + (delay / 1000).toFixed(0) + "s)");
        }, delay);
      }
    } catch (err) {
      console.error("[aap] LLM failed:", err instanceof Error ? err.message : String(err));
    }
  }
}

async function generateLLMComments(
  speakText: string,
  viewers: Array<{ name: string; author_channel_id: string }>,
): Promise<Array<{ name: string; channelId: string; comment: string }>> {
  const lang = config.channel === "ja" ? "Japanese" : "English";
  const viewerList = viewers.map((v) => v.name).join(", ");

  const prompt = "You are simulating YouTube live stream viewers. The streamer said:\n" +
    "\"" + speakText + "\"\n\n" +
    "Generate a natural, casual comment in " + lang + " for each viewer: " + viewerList + "\n\n" +
    "Rules: short (1 sentence max), varied, natural, no formal language.\n" +
    "Respond with this exact JSON shape:\n" +
    "{\"comments\": [{\"name\": \"...\", \"comment\": \"...\"}]}";

  const text = await generateJson(prompt, { maxTokens: 1024 });
  const parsed = parseCommentsJson(text);
  return parsed.map((c) => {
    const v = viewers.find((v) => v.name === c.name);
    return { name: c.name, channelId: v?.author_channel_id ?? "", comment: c.comment };
  }).filter((c) => c.channelId && c.comment);
}

function randomDelay(): number {
  return (config.minDelay + Math.random() * (config.maxDelay - config.minDelay)) * 1000;
}

function buildPayload(user: string, channelId: string, text: string) {
  return {
    platform: "youtube",
    channel: config.channel,
    id: "dummy_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
    user,
    authorChannelId: channelId,
    authorPhoto: null,
    text,
    timestamp: Date.now(),
    isSuperchat: false,
    amount_raw: null,
    amount_currency: null,
    amount_value: null,
    amount_usd: null,
  };
}
