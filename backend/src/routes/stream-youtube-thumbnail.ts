/**
 * /stream/youtube/thumbnail — サムネ素材生成 + プレビュー render.
 *
 * - POST /background — fal で背景画像を生成、URL を返す
 * - POST /render     — overlay/thumbnail を puppeteer でスクショ、PNG を返す
 *
 * YouTube への upload は別 endpoint (or /switch 内) で行う前提で、ここは
 * パターン作りに集中するためのプレビュー API.
 */

import { Router, type Request, type Response } from "express";
import { fal } from "@fal-ai/client";
import puppeteer, { type Browser } from "puppeteer";

const router = Router();

const FAL_KEY = process.env["FAL_KEY"] ?? "";
const OVERLAY_URL = process.env["OVERLAY_URL"] ?? "http://overlay:3000";
const FAL_MODEL = process.env["FAL_THUMBNAIL_MODEL"] ?? "fal-ai/flux/schnell";

// 切替時の自動生成は yuna-api (Railway) 経由で行う. fal API key は
// yuna-api 側に集約済み, R2 永続化, コスト記録も自動.
const YUNA_API_URL = process.env["YUNA_API_URL"] ?? "https://api.yunaonchain.com";
const YUNA_API_KEY = process.env["YUNA_API_KEY"] ?? "";
const SWITCH_BG_MODEL = process.env["SWITCH_BG_MODEL"] ?? "fal-ai/flux-pro/v1.1";

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

type Channel = "ja" | "en";
function isChannel(v: unknown): v is Channel {
  return v === "ja" || v === "en";
}

// ── Background generation via fal ──

const DEFAULT_PROMPT_BASE =
  "wide cinematic landscape background for a livestream thumbnail, " +
  "no people, no characters, no text, no logo, " +
  "soft bokeh, dramatic lighting, high detail, vibrant but moody colors, " +
  "16:9 aspect ratio composition, empty center-right area for character placement";

router.post("/background", async (req: Request, res: Response) => {
  if (!FAL_KEY) {
    res.status(503).json({ error: "FAL_KEY not configured" });
    return;
  }
  const body = (req.body ?? {}) as { prompt?: string; channel?: string; seed?: number };
  const userPrompt = typeof body.prompt === "string" && body.prompt.trim()
    ? body.prompt.trim()
    : "";
  const prompt = userPrompt
    ? `${userPrompt}, ${DEFAULT_PROMPT_BASE}`
    : DEFAULT_PROMPT_BASE;

  try {
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_size: "landscape_16_9",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
        ...(body.seed != null ? { seed: body.seed } : {}),
      },
    });
    const data = result.data as {
      images?: Array<{ url: string; width?: number; height?: number }>;
      seed?: number;
    };
    const image = data.images?.[0];
    if (!image?.url) {
      res.status(502).json({ error: "fal returned no image", detail: result });
      return;
    }
    res.json({
      url: image.url,
      width: image.width,
      height: image.height,
      seed: data.seed,
      prompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[thumbnail/background] fal error:", msg);
    res.status(500).json({ error: "fal request failed", detail: msg });
  }
});

// ── Render via puppeteer ──

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"] || undefined;
    // production の thumbnail render は staticChar=1 で <img> ベース描画なので
    // Live2D / WebGL を使わない. headless + sandbox off だけで十分.
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export interface RenderQuery {
  channel: Channel;
  date?: string;
  weekday?: string;
  catch?: string;
  sub?: string;
  bg?: string;
  bgColor?: string;
  pose?: string;
  expr?: string;
  layout?: string;
  showLogo?: string;
  tod?: string;
  font?: string;
  charLeft?: string;
  charTop?: string;
}

function buildOverlayUrl(q: RenderQuery, opts?: { staticChar?: boolean }): string {
  const u = new URL(`${OVERLAY_URL.replace(/\/$/, "")}/${q.channel}/thumbnail`);
  for (const [k, v] of Object.entries(q)) {
    if (k === "channel" || v == null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  // 描画には dev panel 不要
  u.searchParams.set("dev", "0");
  // production render は事前 bake した PNG キャラを使う (Live2D は headless で
  // 動かないため). dev iframe など Live2D を見せたい時は false で呼ぶ.
  if (opts?.staticChar !== false) u.searchParams.set("staticChar", "1");
  return u.toString();
}

/** Puppeteer で overlay/thumbnail をスクショして PNG Buffer を返す.
 *  staticChar=1 経由なので Live2D / WebGL は描画せず、事前 bake した
 *  yuna-poses PNG を <img> で配置. headless chromium で確実に capture できる. */
export async function renderThumbnailPng(q: RenderQuery): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[thumb-page:pageerror]", err.message));
  page.on("requestfailed", (req) =>
    console.log("[thumb-page:reqfail]", req.url(), req.failure()?.errorText));
  try {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const url = buildOverlayUrl(q);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForFunction(
      () => (window as unknown as { __thumbnailReady?: boolean }).__thumbnailReady === true,
      { timeout: 15_000 },
    );
    const png = await page.screenshot({ type: "png", omitBackground: false });
    return Buffer.from(png);
  } finally {
    try { await page.close(); } catch {}
  }
}

const SWITCH_EXPRESSIONS = ["neutral", "surprised", "happy", "excited", "shy"] as const;

/** 切替時に使うランダム表情を返す */
export function pickSwitchExpression(): string {
  return SWITCH_EXPRESSIONS[Math.floor(Math.random() * SWITCH_EXPRESSIONS.length)] ?? "happy";
}

// ─── 切替時の背景自動生成 (fal flux-pro) ───
//
// 同日の ja/en は同じ背景にしたいので、JST 日付ベースの seed を共有.
// プロンプトもプール × 日付 hash で決定論的に選ぶ → 1 日 1 種類だが日替わりで
// 多彩な背景になる.

const SWITCH_PROMPT_BASE =
  "wide cinematic landscape background for a livestream thumbnail, " +
  "no people, no characters, no text, no logo, no watermark, " +
  "16:9 aspect ratio, empty center area for character placement, " +
  "soft bokeh, dramatic lighting, high detail, vibrant colors";

const SWITCH_PROMPT_THEMES = [
  "futuristic neon city skyline at night, cyan and magenta, anime aesthetic",
  "soft pastel sunrise sky, peaceful morning, warm golden light",
  "japanese cherry blossom petals floating in dreamy spring breeze",
  "cosmic galaxy nebula, deep purple space, swirling stars",
  "tropical beach at golden hour, ocean waves, warm sunset",
  "abstract holographic liquid gradient, iridescent purple cyan pink",
  "rainy tokyo street at night, glowing umbrellas, wet pavement reflections",
  "magical forest with bioluminescent flowers, soft mist, ethereal glow",
  "snowy mountain peak at twilight, alpenglow, crisp blue sky",
  "underwater coral reef, sunbeams piercing turquoise water, dreamy",
  "autumn maple forest path, red and orange leaves, soft sunlight",
  "lavender field at dusk, purple haze, wide open sky",
  "starry night over a calm lake, milky way reflection, serene",
  "art deco sunset clouds, peach pink and lavender pastel sky",
  "anime style summer festival lights, paper lanterns, warm bokeh",
  "cyberpunk alley, glowing signs in japanese, steam, rain reflections",
  "pastel cotton candy clouds floating in soft pink dreamlike sky",
  "futuristic spaceship interior, glowing control panels, deep blue ambient",
  "vintage retro 80s synthwave grid, magenta sunset, neon sun",
  "misty bamboo forest at dawn, soft green light, zen atmosphere",
  "auroras over arctic ice plains, green and violet ribbons in sky",
  "tokyo shibuya crossing at twilight, neon billboards, motion blur",
  "soft watercolor dawn, mountains silhouette, peach and cream tones",
  "sakura trees beside an old shrine torii gate, soft pink, sun rays",
  "deep ocean trench with bioluminescent jellyfish, mysterious blue",
  "candy land pastel hills, pink and mint green, dreamlike whimsy",
  "summer rooftop view of a sleeping city, twinkling lights, navy sky",
  "old european cobblestone street at dusk, warm street lamps, autumn",
  "japanese garden koi pond, ripples, lily pads, soft green and gold",
  "minimal abstract gradient mesh, soft purple to peach, smooth and clean",
];

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function jstDateString(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60_000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 当日分の背景を生成 (fal flux-pro). ja/en で同日なら同じ画像 URL を返す
 * (seed + prompt 同一なので fal 側でも結果はほぼ一致するが、URL を返すまで
 *  キャッシュもしておく).
 *
 * 失敗時は null を返す → 呼び出し側は overlay のデフォルト背景にフォールバック.
 */
const bgCache = new Map<string, string>();

export async function generateSwitchBackground(): Promise<string | null> {
  if (!YUNA_API_KEY) {
    console.warn("[thumbnail] YUNA_API_KEY not set — skip bg generation");
    return null;
  }

  const dateKey = jstDateString();
  const cached = bgCache.get(dateKey);
  if (cached) return cached;

  const seed = djb2(dateKey);
  const theme = SWITCH_PROMPT_THEMES[seed % SWITCH_PROMPT_THEMES.length] ?? SWITCH_PROMPT_THEMES[0]!;
  const prompt = `${theme}, ${SWITCH_PROMPT_BASE}`;

  try {
    const res = await fetch(`${YUNA_API_URL.replace(/\/$/, "")}/yuna/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${YUNA_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        width: 1280,
        height: 720,
        model: SWITCH_BG_MODEL,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`[thumbnail] yuna-api bg gen failed (${res.status}): ${err.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { url?: string; cost?: number; model?: string };
    if (!data.url) {
      console.warn("[thumbnail] yuna-api returned no url");
      return null;
    }
    bgCache.set(dateKey, data.url);
    // 古い日付の cache を掃除 (メモリ漏れ防止)
    for (const k of bgCache.keys()) {
      if (k !== dateKey) bgCache.delete(k);
    }
    console.log(`[thumbnail] ✓ bg generated for ${dateKey} (model=${data.model}, cost=$${data.cost}, theme="${theme.slice(0, 40)}...")`);
    return data.url;
  } catch (err) {
    console.warn("[thumbnail] bg generation error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}


router.post("/render", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<RenderQuery>;
  if (!isChannel(body.channel)) {
    res.status(400).json({ error: "channel must be 'ja' or 'en'" });
    return;
  }
  const query: RenderQuery = { ...body, channel: body.channel };
  const url = buildOverlayUrl(query);

  try {
    const png = await renderThumbnailPng(query);
    const base64 = png.toString("base64");
    res.json({ url, png_base64: base64, data_url: `data:image/png;base64,${base64}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[thumbnail/render] error:", msg, "url=", url);
    res.status(500).json({ error: "render failed", detail: msg, url });
  }
});

// Preview-URL endpoint: just returns the overlay URL (no screenshot) so the
// frontend can iframe it for live editing without paying puppeteer cost.
router.get("/preview-url", (req: Request, res: Response) => {
  const channel = req.query["channel"];
  if (!isChannel(channel)) {
    res.status(400).json({ error: "channel must be 'ja' or 'en'" });
    return;
  }
  const q: RenderQuery = { channel };
  for (const k of ["date", "weekday", "catch", "sub", "bg", "bgColor", "pose", "expr", "layout", "showLogo"] as const) {
    const v = req.query[k];
    if (typeof v === "string") (q as unknown as Record<string, string>)[k] = v;
  }
  res.json({ url: buildOverlayUrl(q) });
});

export default router;
