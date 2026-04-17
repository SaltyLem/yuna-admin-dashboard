"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";
const OLLAMA_URL = `${API_URL}/ollama`;
const DEFAULT_MODEL = "qwen3.5:27b";
const STORAGE_KEY = "ollama_chat_sessions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
}

function loadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export default function OllamaChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamText, sessions, activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const persist = useCallback((updated: Session[]) => {
    setSessions(updated);
    saveSessions(updated);
  }, []);

  const newSession = () => {
    const session: Session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      title: "New Chat",
      model: DEFAULT_MODEL,
      messages: [],
      createdAt: Date.now(),
    };
    const updated = [session, ...sessions];
    persist(updated);
    setActiveId(session.id);
    setInput("");
    inputRef.current?.focus();
  };

  const deleteSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    persist(updated);
    if (activeId === id) setActiveId(updated[0]?.id ?? null);
  };

  const send = async () => {
    if (!input.trim() || generating) return;
    console.log("[chat] send called", input.trim().slice(0, 20));

    let session = activeSession;
    let updatedSessions = [...sessions];

    if (!session) {
      session = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title: input.slice(0, 30),
        model: DEFAULT_MODEL,
        messages: [],
        createdAt: Date.now(),
      };
      updatedSessions = [session, ...updatedSessions];
      setActiveId(session.id);
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    session.messages = [...session.messages, userMsg];

    if (session.messages.length === 1) {
      session.title = input.trim().slice(0, 40);
    }

    updatedSessions = updatedSessions.map((s) =>
      s.id === session!.id ? { ...session! } : s
    );
    persist(updatedSessions);
    setInput("");
    setGenerating(true);
    setStreamText("");

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: session.model,
          messages: session.messages,
          stream: false,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const full = data.message?.content ?? "";

      const assistantMsg: Message = { role: "assistant", content: full };
      session.messages = [...session.messages, assistantMsg];
      const final = updatedSessions.map((s) =>
        s.id === session!.id ? { ...session! } : s
      );
      persist(final);
      setStreamText("");
    } catch (err) {
      toast.error(`Chat error: ${err instanceof Error ? err.message : String(err)}`);
    }

    setStreamText("");
    setGenerating(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      void send();
    }
  };

  return (
    <div className="flex h-full gap-4">
      {/* Sessions sidebar */}
      <div className="w-56 shrink-0 flex flex-col gap-2">
        <button
          onClick={newSession}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + New Chat
        </button>
        <div className="flex-1 overflow-y-auto flex flex-col gap-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer text-sm transition ${
                s.id === activeId
                  ? "bg-accent-muted text-accent"
                  : "text-text-muted hover:bg-panel"
              }`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="flex-1 truncate">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 text-xs"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 rounded-xl border border-border bg-panel">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-text">
            {activeSession?.title ?? "Ollama Chat"}
          </span>
          <span className="text-xs text-text-muted">
            {activeSession?.model ?? DEFAULT_MODEL}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {activeSession?.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-br-md"
                    : "bg-surface text-text rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {streamText && (
            <div className="flex justify-start">
              <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-text whitespace-pre-wrap">
                {streamText}
                <span className="animate-pulse">▍</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-base px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={generating || !input.trim()}
              className="shrink-0 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {generating ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
