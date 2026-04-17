const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://192.168.11.17:11434";
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
