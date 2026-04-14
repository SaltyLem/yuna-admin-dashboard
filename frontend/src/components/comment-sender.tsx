"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "./use-api";
import { PersonPicker } from "./person-picker";
import { getRecentSenders, addRecentSender, type RecentSender } from "./recent-senders";

export function CommentSender() {
  const [channel, setChannel] = useState("ja");
  const [user, setUser] = useState("");
  const [authorChannelId, setAuthorChannelId] = useState("");
  const [text, setText] = useState("");
  const [isSuperchat, setIsSuperchat] = useState(false);
  const [amount, setAmount] = useState("¥500");
  const [sending, setSending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [recent, setRecent] = useState<RecentSender[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setRecent(getRecentSenders());
  }, []);

  const selectRecent = (r: RecentSender) => {
    setUser(r.user);
    setAuthorChannelId(r.authorChannelId);
  };

  const handlePersonSelect = (selectedUser: string, selectedId: string) => {
    setUser(selectedUser);
    setAuthorChannelId(selectedId);
  };

  const handleSend = async () => {
    if (!user || !text) return;
    setSending(true);
    try {
      const res = await apiFetch<{ ok: boolean; authorChannelId: string }>("/comments/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          user,
          text,
          authorChannelId: authorChannelId || undefined,
          isSuperchat,
          amount: isSuperchat ? amount : undefined,
        }),
      });
      if (res.ok) {
        const sender = { user, authorChannelId: res.authorChannelId };
        addRecentSender(sender);
        setRecent(getRecentSenders());
        setAuthorChannelId(res.authorChannelId);
        setText("");
      }
    } catch {}
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="bg-panel border border-border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-text-soft hover:text-text transition"
      >
        Send Comment
        <span className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Recent senders */}
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recent.slice(0, 10).map((r) => (
                <button
                  key={r.authorChannelId}
                  onClick={() => selectRecent(r)}
                  className={`px-2 py-0.5 rounded text-xs transition ${
                    authorChannelId === r.authorChannelId
                      ? "bg-panel-hover text-text"
                      : "bg-panel-2 text-text-muted hover:text-text"
                  }`}
                >
                  {r.user}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-end">
            {/* Channel */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-2 py-1.5 bg-panel-2 border border-border-strong rounded text-sm"
              >
                <option value="ja">JA</option>
                <option value="en">EN</option>
              </select>
            </div>

            {/* User */}
            <div>
              <label className="block text-xs text-text-muted mb-1">
                User {authorChannelId && <span className="text-text-faint ml-1">({authorChannelId.slice(0, 12)})</span>}
              </label>
              <input
                type="text"
                value={user}
                onChange={(e) => { setUser(e.target.value); setAuthorChannelId(""); }}
                placeholder="User name"
                className="w-full px-2 py-1.5 bg-panel-2 border border-border-strong rounded text-sm placeholder:text-text-faint"
              />
            </div>

            {/* Pick person */}
            <button
              onClick={() => setShowPicker(true)}
              className="px-2 py-1.5 bg-panel-2 border border-border-strong rounded text-sm text-text-muted hover:text-text transition"
            >
              Search
            </button>
          </div>

          {/* Comment + Send */}
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Comment text"
              className="flex-1 px-3 py-1.5 bg-panel-2 border border-border-strong rounded text-sm placeholder:text-text-faint"
            />
            <button
              onClick={handleSend}
              disabled={sending || !user || !text}
              className="px-4 py-1.5 bg-accent text-bg rounded text-sm font-medium hover:bg-accent-hover transition disabled:opacity-30"
            >
              Send
            </button>
          </div>

          {/* Superchat */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={isSuperchat}
                onChange={(e) => setIsSuperchat(e.target.checked)}
                className="rounded"
              />
              Superchat
            </label>
            {isSuperchat && (
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="¥500"
                className="w-24 px-2 py-1 bg-panel-2 border border-border-strong rounded text-sm"
              />
            )}
          </div>
        </div>
      )}

      {showPicker && (
        <PersonPicker
          onSelect={handlePersonSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
