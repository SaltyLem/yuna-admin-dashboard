"use client";

import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

export function getToken(): string {
  return localStorage.getItem("admin_token") ?? "";
}

export interface ApiFetchOptions extends RequestInit {
  /** If true, suppress automatic error toast (caller handles feedback itself). */
  silent?: boolean;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts?: ApiFetchOptions,
): Promise<T> {
  const { silent, ...fetchOpts } = opts ?? {};

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...fetchOpts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
        ...fetchOpts.headers,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    if (!silent) toast.error(`Network error: ${msg}`);
    throw e;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const serverMessage =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `HTTP ${res.status}`;
    if (!silent) toast.error(serverMessage);
    throw new ApiError(serverMessage, res.status, body);
  }

  return res.json() as Promise<T>;
}
