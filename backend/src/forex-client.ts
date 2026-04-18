/**
 * forex-client — pulls /api/admin/forex via yunaApi and caches the
 * result. Every producer of YouTube Superchat-shaped payloads
 * (additional-auto-play, auto-reply, /comments route, and later the
 * chat scraper) calls `toUsd(raw, currency)` to populate the
 * `amount_usd` field at ingestion time.
 *
 * Rates are expressed as "units per 1 USD" (JPY=150 → 1 USD = 150 JPY).
 * Cache TTL is 10 minutes; if the upstream pull fails we keep the
 * previously cached rates and log once.
 */

import { yunaApi } from "./yuna-api.js";

const TTL_MS = 10 * 60_000;

type FxRates = Record<string, number>;

let cache: FxRates | null = null;
let fetchedAt = 0;
let inflight: Promise<FxRates | null> | null = null;

// Currency glyph → ISO. Same table the admin frontend uses.
const GLYPHS: Array<[RegExp, string]> = [
  [/JP¥|JPY|円|¥/, "JPY"],
  [/US\$|USD|\$/, "USD"],
  [/EUR|€/,       "EUR"],
  [/GBP|£/,       "GBP"],
  [/KRW|₩/,       "KRW"],
  [/TWD|NT\$/,    "TWD"],
  [/HKD|HK\$/,    "HKD"],
  [/CNY|RMB/,     "CNY"],
  [/AUD|A\$/,     "AUD"],
  [/CAD|C\$/,     "CAD"],
  [/NZD|NZ\$/,    "NZD"],
  [/SGD|S\$/,     "SGD"],
  [/THB|฿/,       "THB"],
  [/PHP|₱/,       "PHP"],
  [/INR|₹/,       "INR"],
  [/BRL|R\$/,     "BRL"],
  [/MXN/,         "MXN"],
  [/IDR|Rp/,      "IDR"],
  [/VND|₫/,       "VND"],
  [/MYR|RM/,      "MYR"],
];

async function refresh(): Promise<FxRates | null> {
  try {
    const d = await yunaApi<{ rates: FxRates }>(`/api/admin/forex`);
    if (d.rates && typeof d.rates === "object") {
      cache = d.rates;
      fetchedAt = Date.now();
      return cache;
    }
  } catch (err) {
    console.warn("[forex-client] refresh failed:", err instanceof Error ? err.message : err);
  }
  return cache;
}

async function getRates(): Promise<FxRates | null> {
  if (cache && Date.now() - fetchedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = refresh().finally(() => { inflight = null; });
  }
  return inflight;
}

export function detectCurrency(raw: string): string {
  for (const [re, code] of GLYPHS) {
    if (re.test(raw)) return code;
  }
  return "USD";
}

export function parseAmountNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert a YouTube amount string (e.g. "¥500,000" / "$5.00" / "₩10,000")
 * to USD. Returns null when rates aren't loaded yet or amount is
 * unparseable. Callers that need a non-null value should handle this
 * explicitly (e.g. retry, or store null and backfill later).
 */
export async function toUsd(raw: string | null | undefined): Promise<{
  amount_raw: string | null;
  amount_currency: string | null;
  amount_value: number | null;
  amount_usd: number | null;
}> {
  if (!raw) return { amount_raw: null, amount_currency: null, amount_value: null, amount_usd: null };
  const currency = detectCurrency(raw);
  const value = parseAmountNumber(raw);
  if (value == null) {
    return { amount_raw: raw, amount_currency: currency, amount_value: null, amount_usd: null };
  }
  if (currency === "USD") {
    return { amount_raw: raw, amount_currency: "USD", amount_value: value, amount_usd: value };
  }
  const rates = await getRates();
  const rate = rates?.[currency];
  const usd = rate && rate > 0 ? value / rate : null;
  return { amount_raw: raw, amount_currency: currency, amount_value: value, amount_usd: usd };
}

/** Synchronous variant that uses whatever is currently cached (or null). */
export function toUsdSync(raw: string | null | undefined): {
  amount_raw: string | null;
  amount_currency: string | null;
  amount_value: number | null;
  amount_usd: number | null;
} {
  if (!raw) return { amount_raw: null, amount_currency: null, amount_value: null, amount_usd: null };
  const currency = detectCurrency(raw);
  const value = parseAmountNumber(raw);
  if (value == null) return { amount_raw: raw, amount_currency: currency, amount_value: null, amount_usd: null };
  if (currency === "USD") return { amount_raw: raw, amount_currency: "USD", amount_value: value, amount_usd: value };
  const rate = cache?.[currency];
  const usd = rate && rate > 0 ? value / rate : null;
  return { amount_raw: raw, amount_currency: currency, amount_value: value, amount_usd: usd };
}

/** Kick off the first fetch eagerly so dummy publishers can use sync. */
export function primeForex(): void {
  void getRates();
}
