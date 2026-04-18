"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/components/use-api";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";
const MAX_LINES = 5000;

interface LogLine {
  ts: number;
  stream: "stdout" | "stderr";
  line: string;
}

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(s: string): string { return s.replace(ANSI_RE, ""); }

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export interface LogPanelProps {
  container: string;
  /** Tailwind extra classes for the wrapper */
  className?: string;
  onClose?: () => void;
}

/**
 * Single container log pane with its own SSE connection, scroll, filter, pause.
 * Designed to be used in a grid of multiple panels.
 */
export default function LogPanel({ container, className, onClose }: LogPanelProps) {
  const [tail, setTail] = useState(200);
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState<"all" | "stdout" | "stderr">("all");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<LogLine[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // SSE subscribe
  useEffect(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setLines([]);
    pendingRef.current = [];
    setConnected(false);
    setConnError(null);

    const url = `${API_URL}/docker/logs/stream/${encodeURIComponent(container)}?tail=${tail}&token=${encodeURIComponent(getToken())}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => { setConnected(true); setConnError(null); };
    es.onerror = () => {
      setConnected(false);
      setConnError("connection lost (auto-retry)");
    };
    es.onmessage = (ev) => {
      if (pausedRef.current) return;
      try {
        const data = JSON.parse(ev.data) as LogLine;
        pendingRef.current.push({ ts: data.ts, stream: data.stream, line: stripAnsi(data.line) });
      } catch {/* ignore */}
    };

    return () => { es.close(); esRef.current = null; };
  }, [container, tail]);

  // Batch flush
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll
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
    <div className={`flex min-h-0 min-w-0 flex-col rounded-md border border-border overflow-hidden ${className ?? ""}`}>
      {/* Header / toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-panel/40 px-2 py-1.5 text-xs">
        <span className="font-semibold text-text">{container}</span>
        <span className={connected ? "text-green-500" : "text-red-500"}>{connected ? "●" : "○"}</span>

        <input
          type="number"
          value={tail}
          min={50}
          max={2000}
          step={50}
          onChange={(e) => setTail(Math.max(50, Math.min(2000, parseInt(e.target.value, 10) || 200)))}
          title="initial tail size"
          className="w-14 rounded bg-panel border border-border px-1 py-0.5"
        />
        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value as typeof streamFilter)}
          className="rounded bg-panel border border-border px-1 py-0.5"
        >
          <option value="all">all</option>
          <option value="stdout">out</option>
          <option value="stderr">err</option>
        </select>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter"
          className="flex-1 min-w-20 rounded bg-panel border border-border px-1.5 py-0.5"
        />
        <button
          onClick={() => setPaused((p) => !p)}
          className={`rounded border border-border px-1.5 py-0.5 ${paused ? "bg-yellow-600/30" : "hover:bg-panel"}`}
        >{paused ? "▶" : "⏸"}</button>
        <button
          onClick={() => setFollow((f) => !f)}
          className={`rounded border border-border px-1.5 py-0.5 ${follow ? "bg-accent-muted text-accent" : "hover:bg-panel"}`}
          title={follow ? "Following" : "Click to follow"}
        >↓</button>
        <button
          onClick={() => { setLines([]); pendingRef.current = []; }}
          className="rounded border border-border px-1.5 py-0.5 hover:bg-panel"
          title="clear"
        >✕ clear</button>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded border border-border px-1.5 py-0.5 hover:bg-red-600/30"
            title="remove panel"
          >close</button>
        )}
        <span className="ml-auto text-text-muted">{filtered.length}/{lines.length}</span>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        onWheel={() => {
          const el = scrollRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          if (!atBottom && follow) setFollow(false);
        }}
        className="flex-1 min-h-0 overflow-y-auto bg-black/50 px-2 py-1 font-mono text-[11px] leading-tight"
      >
        {filtered.map((l, i) => (
          <div key={i} className={l.stream === "stderr" ? "text-red-400" : "text-text"}>
            <span className="text-text-muted/60 mr-2">{formatTime(l.ts)}</span>
            <span className="whitespace-pre-wrap break-all">{l.line}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-text-muted py-2">{connError ?? "(waiting for log lines…)"}</div>
        )}
      </div>
    </div>
  );
}
