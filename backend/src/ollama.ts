const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://192.168.11.17:11434";

/**
 * Ollama の format=json は配列を直接返せないので、
 * {"comments": [...]} ラッパー形式で投げて中身を取り出す。
 * 単一オブジェクト {name, comment} が返ってきた場合も救済する。
 */
export function parseCommentsJson(
  text: string,
): Array<{ name: string; comment: string }> {
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj?.comments)) return obj.comments;
    if (typeof obj?.name === "string" && typeof obj?.comment === "string") return [obj];
  } catch {}
  return [];
}
const OLLAMA_MODEL = process.env["OLLAMA_MODEL"] ?? "qwen3.5:27b";

export async function generateJson(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      think: false,
      format: "json",
      options: {
        num_predict: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.8,
      },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { response?: string };
  return data.response ?? "";
}
