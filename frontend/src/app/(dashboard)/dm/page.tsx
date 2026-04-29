"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/components/use-api";

interface SendResult {
  ok: boolean;
  recipientId: string;
  dmEventId?: string | null;
}

export default function DmPage() {
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!recipient.trim() || !text.trim() || sending) return;
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const res = await apiFetch<SendResult>("/dm", {
        method: "POST",
        body: JSON.stringify({ recipient: recipient.trim(), text }),
        silent: true,
      });
      setResult(res);
      setText("");
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { error?: string; message?: string } | null;
        setError(body?.message ?? body?.error ?? e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">DM Sender (en / @YunaOnChain)</h1>
        <p className="mt-1 text-sm text-gray-400">
          営業用 tmp ツール。en アカウントから単発 DM を送信。履歴保存なし。
        </p>
      </header>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Recipient
          <span className="ml-2 text-xs text-gray-500">
            (@handle / プロフィール URL / DM 会話 URL / 数値 ID)
          </span>
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="@yunaonchain or https://x.com/i/chat/123-456"
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm"
          disabled={sending}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Message
          <span className="ml-2 text-xs text-gray-500">({text.length} chars)</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Hello, ..."
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
          disabled={sending}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={sending || !recipient.trim() || !text.trim()}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:bg-gray-700"
        >
          {sending ? "Sending..." : "Send DM"}
        </button>
      </div>

      {result && (
        <div className="rounded border border-green-700 bg-green-950/40 p-3 text-sm">
          ✓ Sent to <span className="font-mono">{result.recipientId}</span>
          {result.dmEventId && (
            <span className="ml-2 text-xs text-gray-500">
              (event {result.dmEventId})
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          ✗ {error}
        </div>
      )}
    </div>
  );
}
