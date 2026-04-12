"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CommentSender } from "@/components/comment-sender";
import { AutoReplyPanel } from "@/components/auto-reply-panel";
import { useAdminWs } from "@/components/use-admin-ws";

interface Comment {
  id: string;
  channel: string;
  user: string;
  text: string;
  isSuperchat: boolean;
  amount?: string;
  timestamp: number;
}

type Filter = "all" | "ja" | "en";

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLDivElement>(null);

  const onMessage = useCallback((event: string, data: unknown) => {
    if (event !== "stream:comments") return;
    const c = data as Record<string, unknown>;
    setComments((prev) => {
      const id = String(c.id ?? Date.now());
      if (prev.some((p) => p.id === id)) return prev;
      return [
      ...prev.slice(-499),
      {
        id: String(c.id ?? Date.now()),
        channel: String(c.channel ?? "?"),
        user: String(c.user ?? ""),
        text: String(c.text ?? ""),
        isSuperchat: c.isSuperchat === true,
        amount: c.amount ? String(c.amount) : undefined,
        timestamp: typeof c.timestamp === "number" ? c.timestamp : Date.now(),
      },
    ];
    });
  }, []);

  const { connected } = useAdminWs(onMessage);

  const filtered = filter === "all" ? comments : comments.filter((c) => c.channel === filter);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered]);

  const counts = {
    all: comments.length,
    ja: comments.filter((c) => c.channel === "ja").length,
    en: comments.filter((c) => c.channel === "en").length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <CommentSender />
      <AutoReplyPanel />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Comments</h2>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            {(["all", "ja", "en"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-sm transition ${
                  filter === f
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {f.toUpperCase()} ({counts[f]})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-neutral-400">{connected ? "Live" : "Disconnected"}</span>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto space-y-0.5 bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      >
        {filtered.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-8">
            {connected ? "Waiting for comments..." : "Not connected to stream"}
          </p>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className={`flex gap-3 py-1.5 px-2 rounded text-sm ${
                c.isSuperchat ? "bg-yellow-900/20 border border-yellow-800/30" : ""
              }`}
            >
              <span className="text-neutral-600 shrink-0 w-12 text-xs leading-5">
                {new Date(c.timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={`shrink-0 w-6 text-xs leading-5 font-medium ${
                c.channel === "ja" ? "text-red-400" : "text-blue-400"
              }`}>
                {c.channel.toUpperCase()}
              </span>
              {c.isSuperchat && (
                <span className="text-yellow-400 shrink-0 text-xs leading-5">{c.amount}</span>
              )}
              <span className="text-cyan-400 shrink-0 font-medium">{c.user}</span>
              <span className="text-neutral-200 break-all">{c.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
