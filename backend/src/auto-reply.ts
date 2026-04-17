/**
 * Auto Reply Worker
 *
 * stream:speak を監視して、設定間隔でローカル LLM (Ollama qwen3.5:27b) に
 * 仮想視聴者のコメントを生成させ、stream:${channel}:comments に publish する。
 */

import { Redis } from "ioredis";
import crypto from "crypto";
import { getPublisher } from "./redis-pub.js";
import { generateJson } from "./ollama.js";

const REDIS_STREAM_URL = process.env["REDIS_STREAM_URL"] ?? "redis://localhost:6381";

export interface VirtualViewer {
  name: string;
  authorChannelId: string;
  location: "ja" | "en";
}

export interface AutoReplyConfig {
  enabled: boolean;
  intervalSeconds: number;
  viewers: VirtualViewer[];
  channel: "ja" | "en";
}

let config: AutoReplyConfig = {
  enabled: false,
  intervalSeconds: 30,
  viewers: [],
  channel: "ja",
};

let lastSpeak: { text: string; timestamp: number } | null = null;
let lastProcessedTimestamp = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let speakSub: Redis | null = null;

export function getConfig(): AutoReplyConfig {
  return { ...config, viewers: [...config.viewers] };
}

export function setConfig(newConfig: Partial<AutoReplyConfig>): void {
  if (newConfig.enabled !== undefined) config.enabled = newConfig.enabled;
  if (newConfig.intervalSeconds !== undefined) config.intervalSeconds = newConfig.intervalSeconds;
  if (newConfig.viewers !== undefined) config.viewers = newConfig.viewers;
  if (newConfig.channel !== undefined) config.channel = newConfig.channel;

  if (config.enabled) {
    startTimer();
  } else {
    stopTimer();
  }
}

function startTimer(): void {
  stopTimer();
  timer = setInterval(() => void generateAndPublish(), config.intervalSeconds * 1000);
  console.log("[auto-reply] started (every " + config.intervalSeconds + "s, " + config.viewers.length + " viewers)");
}

function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[auto-reply] stopped");
  }
}

async function generateAndPublish(): Promise<void> {
  if (!lastSpeak || lastSpeak.timestamp === lastProcessedTimestamp) return;

  const viewers = config.viewers.filter((v) => v.location === config.channel);
  if (viewers.length === 0) return;

  lastProcessedTimestamp = lastSpeak.timestamp;
  const speakText = lastSpeak.text;

  try {
    const viewerList = viewers.map((v) => "- " + v.name + " (" + (v.location === "ja" ? "日本語で" : "in English") + ")").join("\n");

    const prompt = "You are simulating YouTube live stream viewers. The streamer just said:\n\n" +
      "\"" + speakText + "\"\n\n" +
      "Generate a natural, casual viewer comment for each of these viewers:\n" +
      viewerList + "\n\n" +
      "Rules:\n" +
      "- Each comment should be different and reflect a unique personality\n" +
      "- Comments should be short (1-2 sentences max), like real YouTube chat\n" +
      "- Match the language to the viewer location (ja = Japanese, en = English)\n" +
      "- Be natural: reactions, questions, jokes, agreement, emotes are all fine\n" +
      "- Do NOT be overly formal or polite\n\n" +
      "Respond with JSON array only: [{\"name\": \"...\", \"comment\": \"...\"}]";

    const text = await generateJson(prompt, { maxTokens: 1024 });
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const comments = JSON.parse(jsonMatch[0]) as Array<{ name: string; comment: string }>;
    const pub = getPublisher();

    for (const c of comments) {
      const viewer = viewers.find((v) => v.name === c.name);
      if (!viewer || !c.comment) continue;

      const payload = {
        platform: "youtube",
        channel: config.channel,
        id: "dummy_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
        user: viewer.name,
        authorChannelId: viewer.authorChannelId,
        authorPhoto: null,
        text: c.comment,
        timestamp: Math.floor(Date.now() / 1000),
        isSuperchat: false,
        amount: null,
      };

      await pub.publish(`stream:${config.channel}:comments`, JSON.stringify(payload));
      console.log("[auto-reply] " + viewer.name + ": " + c.comment.slice(0, 40));
    }
  } catch (err) {
    console.error("[auto-reply] generate failed:", err instanceof Error ? err.message : String(err));
  }
}

export function startSpeakSubscriber(): void {
  speakSub = new Redis(REDIS_STREAM_URL);
  speakSub.on("error", () => {});

  void speakSub.subscribe("stream:ja:speak", "stream:en:speak").then(() => {
    console.log("[auto-reply] subscribed to stream:{ja,en}:speak");
  });

  speakSub.on("message", (_channel, message) => {
    try {
      const data = JSON.parse(message) as { utterances?: Array<{ text?: string }> };
      if (data.utterances && data.utterances.length > 0) {
        const texts = data.utterances.map((u) => u.text ?? "").filter(Boolean);
        if (texts.length > 0) {
          lastSpeak = { text: texts.join(" "), timestamp: Date.now() };
        }
      }
    } catch {}
  });
}
