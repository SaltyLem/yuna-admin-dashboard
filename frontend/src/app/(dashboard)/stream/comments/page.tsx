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

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);

  const onMessage = useCallback((event: string, data: unknown) => {
    if (event !== "stream:ja:comments" && event !== "stream:en:comments") return;
    const c = data as Record<string, unknown>;
    setComments((prev) => {
      const id = String(c.id ?? Date.now());
      if (prev.some((p) => p.id === id)) return prev;
      return [
        ...prev.slice(-999),
        {
          id,
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

  const jaComments = comments.filter((c) => c.channel === "ja");
  const enComments = comments.filter((c) => c.channel === "en");

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Top: sender + auto-reply side by side */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3">
        <CommentSender />
        <AutoReplyPanel />
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-xl font-semibold">Comments</h2>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-[color:var(--color-success)]" : "bg-[color:var(--color-danger)]"
            }`}
          />
          <span className="text-text-muted">{connected ? "Live" : "Disconnected"}</span>
        </div>
      </div>

      {/* Two-column comment feeds */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
        <CommentColumn
          title="JA"
          comments={jaComments}
          connected={connected}
          channelColor="text-red-400"
        />
        <CommentColumn
          title="EN"
          comments={enComments}
          connected={connected}
          channelColor="text-blue-400"
        />
      </div>
    </div>
  );
}

// ── Column ──

interface CommentColumnProps {
  title: string;
  comments: Comment[];
  connected: boolean;
  channelColor: string;
}

function CommentColumn({ title, comments, connected, channelColor }: CommentColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [stickBottom, setStickBottom] = useState(true);

  // Auto-scroll to bottom when new comments come in, if user hasn't scrolled up
  useEffect(() => {
    if (!stickBottom) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [comments, stickBottom]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStickBottom(atBottom);
  };

  return (
    <div className="panel flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${channelColor}`}>{title}</span>
          <span className="text-xs text-text-muted">({comments.length})</span>
        </div>
        {!stickBottom && (
          <button
            onClick={() => {
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setStickBottom(true);
            }}
            className="text-xs text-text-muted hover:text-text transition"
          >
            ↓ Latest
          </button>
        )}
      </div>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5"
      >
        {comments.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">
            {connected ? "Waiting for comments..." : "Not connected to stream"}
          </p>
        ) : (
          comments.map((c) => <CommentRow key={c.id} comment={c} />)
        )}
      </div>
    </div>
  );
}

// ── Row ──

function CommentRow({ comment: c }: { comment: Comment }) {
  return (
    <div
      className={`flex gap-2 py-1 px-2 rounded text-sm ${
        c.isSuperchat ? "bg-[color:var(--color-warning)]/10 border border-[color:var(--color-warning)]/30" : ""
      }`}
    >
      <span className="text-text-faint shrink-0 w-[44px] text-xs leading-5 tabular-nums">
        {new Date(c.timestamp).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      {c.isSuperchat && (
        <span className="text-[color:var(--color-warning)] shrink-0 text-xs leading-5 font-medium">
          {c.amount}
        </span>
      )}
      <span className="text-accent shrink-0 font-medium truncate max-w-[30%]">{c.user}</span>
      <span className="text-text-soft break-all min-w-0">{c.text}</span>
    </div>
  );
}
