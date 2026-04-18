"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getToken } from "@/components/use-api";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

interface LogLine {
  ts: number;
  stream: "stdout" | "stderr";
  line: string;
}

const MAX_LINES = 5000;
const TAIL_DEFAULT = 200;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// Strip ANSI escape codes (very common in container logs).
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export default function LogPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [tail, setTail] = useState(TAIL_DEFAULT);
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState<"all" | "stdout" | "stderr">("all");
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<LogLine[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadContainers = useCallback(async () => {
    try {
      const data = await apiFetch<{ containers: ContainerInfo[] }>("/docker/containers");
      setContainers(data.containers);
      if (!selected && data.containers.length > 0) {
        setSelected(data.containers[0]!.name);
      }
    } catch {
      /* toast handled by apiFetch */
    }
  }, [selected]);

  useEffect(() => { void loadContainers(); }, [loadContainers]);

  // Subscribe to SSE when container/tail changes
  useEffect(() => {
    if (!selected) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setLines([]);
    pendingRef.current = [];
    setConnected(false);
    setConnError(null);

    const url = `${API_URL}/docker/logs/stream/${encodeURIComponent(selected)}?tail=${tail}&token=${encodeURIComponent(getToken())}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => { setConnected(true); setConnError(null); };
    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects; surface only persistent errors
      setConnError("connection lost (auto-retry)");
    };
    es.onmessage = (ev) => {
      if (paused) return;
      try {
        const data = JSON.parse(ev.data) as LogLine;
        pendingRef.current.push({
          ts: data.ts,
          stream: data.stream,
          line: stripAnsi(data.line),
        });
      } catch {
        /* ignore malformed line */
      }
    };

    return () => { es.close(); esRef.current = null; };
  }, [selected, tail, paused]);

  // Batch-flush pending lines (avoid per-event re-render storms).
  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    }, 200);
    return () => { if (flushTimerRef.current) clearInterval(flushTimerRef.current); };
  }, []);

  // Auto-scroll to bottom when new lines arrive (if follow is on).
  useEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return lines.filter((l) => {
      if (streamFilter !== "all" && l.stream !== streamFilter) return false;
      if (q && !l.line.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lines, filter, streamFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md bg-panel border border-border px-2 py-1 text-sm"
        >
          {containers.length === 0 && <option value="">(no containers)</option>}
          {containers.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name} {c.state !== "running" ? `(${c.state})` : ""}
            </option>
          ))}
        </select>

        <button
          onClick={() => void loadContainers()}
          className="rounded-md bg-panel border border-border px-2 py-1 text-sm hover:bg-panel/70"
          title="Reload container list"
        >↻</button>

        <label className="flex items-center gap-1 text-sm text-text-muted">
          tail
          <input
            type="number"
            value={tail}
            min={50}
            max={2000}
            step={50}
            onChange={(e) => setTail(Math.max(50, Math.min(2000, parseInt(e.target.value, 10) || TAIL_DEFAULT)))}
            className="w-20 rounded-md bg-panel border border-border px-2 py-1"
          />
        </label>

        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value as typeof streamFilter)}
          className="rounded-md bg-panel border border-border px-2 py-1 text-sm"
        >
          <option value="all">all</option>
          <option value="stdout">stdout</option>
          <option value="stderr">stderr</option>
        </select>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter (substring)"
          className="flex-1 min-w-40 rounded-md bg-panel border border-border px-2 py-1 text-sm"
        />

        <button
          onClick={() => setPaused((p) => !p)}
          className={`rounded-md border border-border px-3 py-1 text-sm ${paused ? "bg-yellow-600/30" : "bg-panel hover:bg-panel/70"}`}
        >{paused ? "Resume" : "Pause"}</button>

        <button
          onClick={() => setFollow((f) => !f)}
          className={`rounded-md border border-border px-3 py-1 text-sm ${follow ? "bg-accent-muted text-accent" : "bg-panel hover:bg-panel/70"}`}
        >{follow ? "Following" : "Follow"}</button>

        <button
          onClick={() => { setLines([]); pendingRef.current = []; }}
          className="rounded-md bg-panel border border-border px-3 py-1 text-sm hover:bg-panel/70"
        >Clear</button>

        <span className={`text-xs ${connected ? "text-green-500" : "text-red-500"}`}>
          {connected ? "● live" : connError ?? "○ idle"}
        </span>
        <span className="text-xs text-text-muted">{filtered.length}/{lines.length} lines</span>
      </div>

      {/* Log view */}
      <div
        ref={scrollRef}
        onWheel={() => {
          // user scrolled — disable follow until they re-enable
          const el = scrollRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          if (!atBottom && follow) setFollow(false);
        }}
        className="flex-1 overflow-y-auto bg-black/40 px-3 py-2 font-mono text-[11px] leading-tight"
      >
        {filtered.map((l, i) => (
          <div
            key={i}
            className={l.stream === "stderr" ? "text-red-400" : "text-text"}
          >
            <span className="text-text-muted/60 mr-2">{formatTime(l.ts)}</span>
            <span className="whitespace-pre-wrap break-all">{l.line}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-text-muted text-sm py-4">
            {selected ? "(waiting for log lines…)" : "select a container"}
          </div>
        )}
      </div>
    </div>
  );
}
