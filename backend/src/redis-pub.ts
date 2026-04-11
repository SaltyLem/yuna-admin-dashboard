import { Redis } from "ioredis";

const REDIS_STREAM_URL = process.env["REDIS_STREAM_URL"] ?? "redis://localhost:6381";

let pub: Redis | null = null;

export function getPublisher(): Redis {
  if (!pub) {
    pub = new Redis(REDIS_STREAM_URL);
    pub.on("error", (err) => console.error("[redis-pub] error:", err.message));
    pub.on("connect", () => console.log("[redis-pub] connected to", REDIS_STREAM_URL));
  }
  return pub;
}
