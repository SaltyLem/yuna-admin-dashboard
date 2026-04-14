/**
 * Thin fetch helper around yuna-api (Railway).
 *
 * admin-dashboard authenticates the session with its own password.
 * Upstream calls to yuna-api use YUNA_API_KEY so we don't need to
 * maintain a second JWT flow. Routes on yuna-api that should be
 * reachable from here must accept `requireAdminOrApiKey`.
 */

const YUNA_API_URL = process.env["YUNA_API_URL"] ?? "http://localhost:4000";
const YUNA_API_KEY = process.env["YUNA_API_KEY"] ?? "";

export class YunaApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function yunaApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${YUNA_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${YUNA_API_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `HTTP ${res.status}`;
    throw new YunaApiError(message, res.status, body);
  }
  return body as T;
}
