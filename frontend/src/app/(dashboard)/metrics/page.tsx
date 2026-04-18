"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiFetch } from "@/components/use-api";

/* ============================================================= */
/*  types                                                         */
/* ============================================================= */

interface SeriesPoint { t: number; avg: number; min: number; max: number }
interface SeriesResp {
  kind: string;
  subject: string | null;
  metric: string;
  rangeMinutes: number;
  bucketSeconds: number;
  series: SeriesPoint[];
}
interface LatestSample {
  kind: string;
  subject: string | null;
  metric: string;
  value: number;
  recordedAt: string;
}
interface ContainerRow {
  subject: string;
  cpuPct: number;
  memMb: number;
  memPct: number;
  recordedAt: string;
}

const RANGES: Array<{ label: string; rangeMinutes: number; bucketSeconds: number }> = [
  { label: "5m",  rangeMinutes: 5,    bucketSeconds: 15 },
  { label: "15m", rangeMinutes: 15,   bucketSeconds: 30 },
  { label: "1h",  rangeMinutes: 60,   bucketSeconds: 60 },
  { label: "6h",  rangeMinutes: 360,  bucketSeconds: 300 },
  { label: "24h", rangeMinutes: 1440, bucketSeconds: 600 },
];

/* Color threshold: value (0-100) → color */
function threshold(value: number | null, inverted = false): string {
  if (value == null) return "#475569";
  const v = inverted ? 100 - value : value;
  if (v < 60) return "#22d3ee";        // cyan
  if (v < 80) return "#fbbf24";        // amber
  return "#f43f5e";                    // rose
}

function tempColor(temp: number | null): string {
  if (temp == null) return "#475569";
  if (temp < 60) return "#22d3ee";
  if (temp < 75) return "#fbbf24";
  return "#f43f5e";
}

/* ============================================================= */
/*  hooks                                                         */
/* ============================================================= */

function useSeries(
  kind: string,
  metric: string,
  subject: string | null,
  rangeMinutes: number,
  bucketSeconds: number,
): SeriesPoint[] | null {
  const [data, setData] = useState<SeriesPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const qs = new URLSearchParams({ kind, metric, rangeMinutes: String(rangeMinutes), bucketSeconds: String(bucketSeconds) });
        if (subject !== null) qs.set("subject", subject);
        const d = await apiFetch<SeriesResp>(`/metrics/series?${qs}`, { silent: true });
        if (!cancelled) setData(d.series);
      } catch { /* keep previous */ }
    }
    void run();
    const h = setInterval(run, Math.max(10_000, Math.min(60_000, bucketSeconds * 1000)));
    return () => { cancelled = true; clearInterval(h); };
  }, [kind, metric, subject, rangeMinutes, bucketSeconds]);
  return data;
}

function useLatest(): LatestSample[] | null {
  const [data, setData] = useState<LatestSample[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ samples: LatestSample[] }>("/metrics/latest", { silent: true });
        if (!cancelled) setData(d.samples);
      } catch { /* keep */ }
    }
    void run();
    const h = setInterval(run, 15_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);
  return data;
}

function useContainers(): ContainerRow[] | null {
  const [data, setData] = useState<ContainerRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ containers: ContainerRow[] }>("/metrics/containers", { silent: true });
        if (!cancelled) setData(d.containers);
      } catch { /* keep */ }
    }
    void run();
    const h = setInterval(run, 30_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);
  return data;
}

/* ============================================================= */
/*  page                                                          */
/* ============================================================= */

export default function MetricsPage() {
  const [rangeIdx, setRangeIdx] = useState(2); // 1h default
  const range = RANGES[rangeIdx]!;
  const latest = useLatest();
  const containers = useContainers();

  const findLatest = useCallback((kind: string, metric: string, subject: string | null = null): number | null => {
    if (!latest) return null;
    const hit = latest.find(s => s.kind === kind && s.metric === metric && s.subject === subject);
    return hit?.value ?? null;
  }, [latest]);

  const cpuNow = findLatest("cpu", "usage_pct");
  const memPct = findLatest("memory", "pct");
  const memUsed = findLatest("memory", "used_mb");
  const memTot = findLatest("memory", "total_mb");
  const gpu0Util = findLatest("gpu", "usage_pct", "0");
  const gpu0Vram = findLatest("gpu", "vram_pct", "0");
  const gpu0VramUsed = findLatest("gpu", "vram_used_mb", "0");
  const gpu0VramTot = findLatest("gpu", "vram_total_mb", "0");
  const gpu0Temp = findLatest("gpu", "temp_c", "0");
  const gpu0Power = findLatest("gpu", "power_w", "0");

  return (
    <div className="relative h-full flex flex-col gap-3 overflow-y-auto">
      {/* Header + range */}
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1
            className="text-xl font-bold tracking-[0.15em] uppercase"
            style={{
              background: "linear-gradient(90deg, #22d3ee 0%, #a855f7 100%)",
              WebkitBackgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 14px rgba(34,211,238,0.25)",
            }}
          >
            System Metrics
          </h1>
          <p className="text-[11px] text-text-muted mt-0.5">
            Linux host + RTX 3080 Ti + Docker — 15 秒粒度 / 7 日保持
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={[
                "px-2.5 py-1 rounded tabular-nums tracking-wide transition",
                i === rangeIdx
                  ? "text-[#05070d] font-semibold"
                  : "text-text-muted hover:text-text",
              ].join(" ")}
              style={i === rangeIdx ? { background: "#22d3ee", boxShadow: "0 0 8px #22d3eeaa" } : {}}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Row 1: 6 Stat panels (big number + sparkline + threshold color) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 shrink-0">
        <StatPanel
          label="CPU"
          value={cpuNow} unit="%"
          color={threshold(cpuNow)}
          kind="cpu" metric="usage_pct" subject={null} range={range}
        />
        <StatPanel
          label="Memory"
          value={memPct} unit="%"
          color={threshold(memPct)}
          sub={memUsed != null && memTot != null ? `${(memUsed/1024).toFixed(1)} / ${(memTot/1024).toFixed(1)} GB` : undefined}
          kind="memory" metric="pct" subject={null} range={range}
        />
        <StatPanel
          label="GPU"
          value={gpu0Util} unit="%"
          color={threshold(gpu0Util)}
          sub="RTX 3080 Ti"
          kind="gpu" metric="usage_pct" subject="0" range={range}
        />
        <StatPanel
          label="VRAM"
          value={gpu0Vram} unit="%"
          color={threshold(gpu0Vram)}
          sub={gpu0VramUsed != null && gpu0VramTot != null ? `${(gpu0VramUsed/1024).toFixed(1)} / ${(gpu0VramTot/1024).toFixed(1)} GB` : undefined}
          kind="gpu" metric="vram_pct" subject="0" range={range}
        />
        <StatPanel
          label="GPU Temp"
          value={gpu0Temp} unit="°C"
          color={tempColor(gpu0Temp)}
          fixed={0}
          kind="gpu" metric="temp_c" subject="0" range={range}
        />
        <StatPanel
          label="GPU Power"
          value={gpu0Power} unit="W"
          color={gpu0Power != null && gpu0Power > 300 ? "#f43f5e" : gpu0Power != null && gpu0Power > 200 ? "#fbbf24" : "#22d3ee"}
          fixed={0}
          kind="gpu" metric="power_w" subject="0" range={range}
        />
      </div>

      {/* Row 2: Radial gauges (3) */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <RadialGauge title="CPU" value={cpuNow} unit="%" color={threshold(cpuNow)} />
        <RadialGauge title="Memory" value={memPct} unit="%" color={threshold(memPct)}
          caption={memUsed != null && memTot != null ? `${(memUsed/1024).toFixed(1)}/${(memTot/1024).toFixed(1)} GB` : undefined} />
        <RadialGauge title="GPU" value={gpu0Util} unit="%" color={threshold(gpu0Util)}
          caption={gpu0Temp != null ? `${Math.round(gpu0Temp)}°C · ${gpu0Power ? Math.round(gpu0Power) : "?"}W` : undefined} />
      </div>

      {/* Row 3: overlaid utilization chart (CPU + GPU + Memory %) */}
      <Panel title="Utilization" accent="#22d3ee">
        <OverlayChart range={range} />
      </Panel>

      {/* Row 4: GPU secondary metrics (temp + power) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel title="GPU Temp" accent="#fb7185">
          <MetricAreaChart kind="gpu" subject="0" metric="temp_c" color="#fb7185" range={range} unit="°C" />
        </Panel>
        <Panel title="GPU Power" accent="#fbbf24">
          <MetricAreaChart kind="gpu" subject="0" metric="power_w" color="#fbbf24" range={range} unit="W" />
        </Panel>
      </div>

      {/* Row 5: Containers */}
      <Panel title="Docker Containers" accent="#f472b6">
        <ContainerTable rows={containers} />
      </Panel>
    </div>
  );
}

/* ============================================================= */
/*  Panel                                                         */
/* ============================================================= */

function Panel({ title, accent = "#22d3ee", children, className = "" }: { title: string; accent?: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      className={[
        "relative rounded-lg border border-white/10 bg-[#0b1120]/60 backdrop-blur-sm flex flex-col overflow-hidden",
        className,
      ].join(" ")}
      style={{ boxShadow: `0 0 24px -10px ${accent}55, 0 0 1px ${accent}55 inset` }}
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="inline-block h-1 w-1 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: `${accent}cc` }}
        >
          {title}
        </div>
        <div className="ml-auto h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }} />
      </div>
      <div className="flex-1 min-h-0 px-3 pb-3 pt-1">{children}</div>
    </section>
  );
}

/* ============================================================= */
/*  StatPanel (Grafana-style stat with sparkline)                 */
/* ============================================================= */

function StatPanel({
  label, value, unit, color, sub, fixed = 1,
  kind, metric, subject, range,
}: {
  label: string;
  value: number | null;
  unit: string;
  color: string;
  sub?: string;
  fixed?: number;
  kind: string;
  metric: string;
  subject: string | null;
  range: typeof RANGES[number];
}) {
  const series = useSeries(kind, metric, subject, range.rangeMinutes, range.bucketSeconds);
  const gid = `sp-${kind}-${metric}-${(subject ?? "h").replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div
      className="relative rounded-lg border overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${color}08 0%, #0b1120cc 60%)`,
        borderColor: `${color}55`,
        boxShadow: `0 0 18px -8px ${color}66, 0 0 1px ${color}44 inset`,
        minHeight: 110,
      }}
    >
      <div className="px-3 pt-2 shrink-0">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}aa` }}>
          {label}
        </div>
        <div
          className="text-3xl font-bold tabular-nums leading-none mt-1"
          style={{ color, textShadow: `0 0 14px ${color}88` }}
        >
          {value == null ? "—" : value.toFixed(fixed)}
          <span className="text-sm font-normal ml-0.5 opacity-60">{unit}</span>
        </div>
        {sub && <div className="text-[10px] text-text-muted mt-0.5 tabular-nums truncate">{sub}</div>}
      </div>
      <div className="flex-1 min-h-[34px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series ?? []} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.2} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  RadialGauge                                                   */
/* ============================================================= */

function RadialGauge({
  title, value, unit, color, caption,
}: {
  title: string;
  value: number | null;
  unit: string;
  color: string;
  caption?: string;
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 42;
  const circum = 2 * Math.PI * r;
  const offset = circum * (1 - v / 100);
  return (
    <Panel title={title} accent={color}>
      <div className="flex items-center justify-center py-2">
        <div className="relative" style={{ width: 120, height: 120 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <defs>
              <filter id={`gauge-glow-${title}`}>
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Track */}
            <circle
              cx="60" cy="60" r={r}
              fill="none"
              stroke="#1e293b"
              strokeWidth="8"
            />
            {/* Value */}
            <circle
              cx="60" cy="60" r={r}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circum}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter={`url(#gauge-glow-${title})`}
              style={{ transition: "stroke-dashoffset 600ms ease" }}
            />
            {/* tick marks */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
              const r1 = r + 10;
              const r2 = r + 14;
              return (
                <line
                  key={i}
                  x1={60 + Math.cos(angle) * r1}
                  y1={60 + Math.sin(angle) * r1}
                  x2={60 + Math.cos(angle) * r2}
                  y2={60 + Math.sin(angle) * r2}
                  stroke="#475569"
                  strokeWidth="1"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-2xl font-bold tabular-nums"
              style={{ color, textShadow: `0 0 12px ${color}66` }}
            >
              {value == null ? "—" : v.toFixed(1)}
              <span className="text-xs opacity-60 ml-0.5">{unit}</span>
            </div>
            {caption && <div className="text-[9px] text-text-muted mt-0.5">{caption}</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================= */
/*  OverlayChart (CPU + GPU + Memory % on one axis)               */
/* ============================================================= */

function OverlayChart({ range }: { range: typeof RANGES[number] }) {
  const cpu = useSeries("cpu", "usage_pct", null, range.rangeMinutes, range.bucketSeconds);
  const gpu = useSeries("gpu", "usage_pct", "0", range.rangeMinutes, range.bucketSeconds);
  const mem = useSeries("memory", "pct", null, range.rangeMinutes, range.bucketSeconds);

  const series = mergeSeries({ cpu, gpu, mem });
  const hasData = series.some(p => (p.cpu ?? 0) + (p.gpu ?? 0) + (p.mem ?? 0) > 0);

  return (
    <div className="h-60 w-full relative">
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
          no samples in {range.label}
        </div>
      )}
      <div className="absolute top-1 right-2 flex items-center gap-3 text-[10px] z-10">
        <LegendDot color="#22d3ee" label="CPU" />
        <LegendDot color="#a855f7" label="GPU" />
        <LegendDot color="#38bdf8" label="Memory" />
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#ffffff10" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => formatTick(Number(v), range.rangeMinutes)}
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false}
            domain={[0, 100]} width={30}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: "#0b1120", border: "1px solid #22d3ee66", fontSize: 11 }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v, name) => [`${Number(v).toFixed(1)}%`, String(name)]}
          />
          <Line type="monotone" dataKey="cpu" stroke="#22d3ee" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="gpu" stroke="#a855f7" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="mem" stroke="#38bdf8" strokeWidth={1.6} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeSeries(inputs: { cpu: SeriesPoint[] | null; gpu: SeriesPoint[] | null; mem: SeriesPoint[] | null }): Array<{ t: number; cpu?: number; gpu?: number; mem?: number }> {
  const byT = new Map<number, { t: number; cpu?: number; gpu?: number; mem?: number }>();
  const add = (key: "cpu" | "gpu" | "mem", rows: SeriesPoint[] | null) => {
    if (!rows) return;
    for (const r of rows) {
      const row = byT.get(r.t) ?? { t: r.t };
      row[key] = r.avg;
      byT.set(r.t, row);
    }
  };
  add("cpu", inputs.cpu);
  add("gpu", inputs.gpu);
  add("mem", inputs.mem);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span style={{ color }}>{label}</span>
    </div>
  );
}

/* ============================================================= */
/*  Single-metric area chart (used for temp / power)              */
/* ============================================================= */

function MetricAreaChart({
  kind, metric, color, range, subject = null, unit = "",
}: {
  kind: string;
  metric: string;
  color: string;
  range: typeof RANGES[number];
  subject?: string | null;
  unit?: string;
}) {
  const series = useSeries(kind, metric, subject, range.rangeMinutes, range.bucketSeconds);
  const hasData = series?.some(p => p.avg > 0) ?? false;
  const gid = `m-${kind}-${metric}-${(subject ?? "h").replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="h-48 w-full relative">
      {series == null && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint">loading…</div>
      )}
      {series != null && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
          no samples in {range.label}
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ffffff10" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => formatTick(Number(v), range.rangeMinutes)}
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={28}
            tickFormatter={(v: number) => `${v >= 1000 ? (v/1000).toFixed(1) + "k" : v.toFixed(0)}`} />
          <Tooltip
            contentStyle={{ background: "#0b1120", border: `1px solid ${color}66`, fontSize: 11 }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [`${Number(v).toFixed(2)}${unit ? " " + unit : ""}`, metric]}
          />
          <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.6} fill={`url(#${gid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatTick(ms: number, rangeMinutes: number): string {
  const d = new Date(ms);
  if (rangeMinutes >= 60 * 24) {
    return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  }
  if (rangeMinutes >= 60 * 6) {
    return d.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ============================================================= */
/*  Container table — each row has inline sparkline on CPU %      */
/* ============================================================= */

function ContainerTable({ rows }: { rows: ContainerRow[] | null }) {
  if (rows == null) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">loading…</div>;
  if (rows.length === 0) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">no running containers</div>;
  return (
    <div className="overflow-auto max-h-[380px] scrollbar-none">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-faint uppercase tracking-wider text-[9px]">
            <th className="text-left px-2 py-1">container</th>
            <th className="text-left px-2 py-1 w-24">CPU %</th>
            <th className="text-right px-2 py-1 w-48">CPU trend (1h)</th>
            <th className="text-right px-2 py-1 w-28">Memory</th>
            <th className="text-right px-2 py-1 w-16">Mem %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ContainerRowView key={r.subject} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContainerRowView({ row }: { row: ContainerRow }) {
  const trend = useSeries("docker", "cpu_pct", row.subject, 60, 60);
  const color = threshold(row.cpuPct);
  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition">
      <td className="px-2 py-1 text-text truncate max-w-[260px]" title={row.subject}>{row.subject}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] font-semibold tabular-nums"
            style={{ color, textShadow: `0 0 6px ${color}44` }}
          >
            {row.cpuPct.toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="px-2 py-1 w-48">
        <MiniSpark data={trend ?? []} color={color} />
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-text-muted">
        {row.memMb < 1024 ? `${row.memMb.toFixed(0)} MB` : `${(row.memMb/1024).toFixed(2)} GB`}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-text-muted">{row.memPct.toFixed(1)}%</td>
    </tr>
  );
}

function MiniSpark({ data, color }: { data: SeriesPoint[]; color: string }) {
  if (data.length === 0) return <div className="h-6 w-full text-right text-text-faint text-[9px]">—</div>;
  return (
    <div className="h-6 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.6} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.2} fill={`url(#spark-${color.slice(1)})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
