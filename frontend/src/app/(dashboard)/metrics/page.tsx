"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/components/use-api";

/* ============================================================= */
/*  host context                                                  */
/* ============================================================= */

const HostContext = createContext<string>("linux-3080");
const DEFAULT_HOST = "linux-3080";

function hostLabel(host: string): string {
  if (host === "linux-3080") return "3080 Ti";
  if (host === "linux-5090") return "5090";
  return host;
}

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

/* ============================================================= */
/*  color thresholds                                              */
/* ============================================================= */

function threshold(value: number | null, _inverted = false): string {
  if (value == null) return "#475569";
  if (value < 60) return "#22d3ee";
  if (value < 80) return "#fbbf24";
  return "#f43f5e";
}
function tempColor(temp: number | null): string {
  if (temp == null) return "#475569";
  if (temp < 60) return "#22d3ee";
  if (temp < 75) return "#fbbf24";
  return "#f43f5e";
}
function powerColor(p: number | null): string {
  if (p == null) return "#475569";
  if (p < 200) return "#22d3ee";
  if (p < 300) return "#fbbf24";
  return "#f43f5e";
}

/* ============================================================= */
/*  hooks                                                         */
/* ============================================================= */

function useSeries(
  kind: string, metric: string, subject: string | null,
  rangeMinutes: number, bucketSeconds: number,
): SeriesPoint[] | null {
  const host = useContext(HostContext);
  const [data, setData] = useState<SeriesPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const qs = new URLSearchParams({ host, kind, metric, rangeMinutes: String(rangeMinutes), bucketSeconds: String(bucketSeconds) });
        if (subject !== null) qs.set("subject", subject);
        const d = await apiFetch<SeriesResp>(`/metrics/series?${qs}`, { silent: true });
        if (!cancelled) setData(d.series);
      } catch { /* keep */ }
    }
    setData(null);
    void run();
    const h = setInterval(run, Math.max(10_000, Math.min(60_000, bucketSeconds * 1000)));
    return () => { cancelled = true; clearInterval(h); };
  }, [host, kind, metric, subject, rangeMinutes, bucketSeconds]);
  return data;
}

function useLatest(): LatestSample[] | null {
  const host = useContext(HostContext);
  const [data, setData] = useState<LatestSample[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ samples: LatestSample[] }>(`/metrics/latest?host=${encodeURIComponent(host)}`, { silent: true });
        if (!cancelled) setData(d.samples);
      } catch { /* keep */ }
    }
    setData(null);
    void run();
    const h = setInterval(run, 15_000);
    return () => { cancelled = true; clearInterval(h); };
  }, [host]);
  return data;
}

function useContainers(): ContainerRow[] | null {
  const host = useContext(HostContext);
  const [data, setData] = useState<ContainerRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ containers: ContainerRow[] }>(`/metrics/containers?host=${encodeURIComponent(host)}`, { silent: true });
        if (!cancelled) setData(d.containers);
      } catch { /* keep */ }
    }
    setData(null);
    void run();
    const h = setInterval(run, 30_000);
    return () => { cancelled = true; clearInterval(h); };
  }, [host]);
  return data;
}

function useHosts(): string[] {
  const [hosts, setHosts] = useState<string[]>([DEFAULT_HOST]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const d = await apiFetch<{ hosts: string[] }>("/metrics/hosts", { silent: true });
        if (!cancelled && d.hosts.length > 0) setHosts(d.hosts);
      } catch { /* keep */ }
    }
    void run();
    const h = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);
  return hosts;
}

/* ============================================================= */
/*  stats from a series                                           */
/* ============================================================= */

interface SeriesStats { min: number; max: number; avg: number; latest: number; deltaPct: number | null }

function computeStats(series: SeriesPoint[] | null): SeriesStats | null {
  if (!series || series.length === 0) return null;
  let minV = Infinity, maxV = -Infinity, sum = 0, count = 0;
  for (const p of series) {
    if (p.avg === 0 && p.min === 0 && p.max === 0) continue;
    if (p.min < minV) minV = p.min;
    if (p.max > maxV) maxV = p.max;
    sum += p.avg;
    count += 1;
  }
  if (count === 0) return null;
  const avg = sum / count;
  const latest = series[series.length - 1]?.avg ?? 0;
  const deltaPct = avg > 0 ? ((latest - avg) / avg) * 100 : null;
  return { min: minV, max: maxV, avg, latest, deltaPct };
}

/* ============================================================= */
/*  page                                                          */
/* ============================================================= */

type RightChartId = "util" | "temp" | "power";

export default function MetricsPage() {
  const [host, setHost] = useState<string>(DEFAULT_HOST);
  return (
    <HostContext.Provider value={host}>
      <MetricsBody host={host} setHost={setHost} />
    </HostContext.Provider>
  );
}

function MetricsBody({ host, setHost }: { host: string; setHost: (h: string) => void }) {
  const [rangeIdx, setRangeIdx] = useState(2);
  const [rightSelected, setRightSelected] = useState<RightChartId>("util");
  const range = RANGES[rangeIdx]!;
  const hosts = useHosts();
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
            Linux host + Docker — 15 秒粒度 / 7 日保持
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Host switcher */}
          <div className="flex items-center gap-1 text-[10px]">
            {hosts.map((h) => (
              <button
                key={h}
                onClick={() => setHost(h)}
                className={[
                  "px-3 py-1 rounded tracking-[0.1em] uppercase transition",
                  h === host ? "text-[#05070d] font-semibold" : "text-text-muted hover:text-text",
                ].join(" ")}
                style={h === host ? { background: "#a855f7", boxShadow: "0 0 8px #a855f7aa" } : {}}
              >
                {hostLabel(h)}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/10" />
          {/* Range */}
          <div className="flex items-center gap-1 text-[10px]">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className={[
                  "px-2.5 py-1 rounded tabular-nums tracking-wide transition",
                  i === rangeIdx ? "text-[#05070d] font-semibold" : "text-text-muted hover:text-text",
                ].join(" ")}
                style={i === rangeIdx ? { background: "#22d3ee", boxShadow: "0 0 8px #22d3eeaa" } : {}}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Top: 2x3 Stat grid on the left + other panels stacked on the right */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 grid-rows-3 gap-3 auto-rows-fr">
            <StatPanel label="CPU"       value={cpuNow}      unit="%" color={threshold(cpuNow)}   fixed={1}
                       kind="cpu"    metric="usage_pct" subject={null} range={range} />
            <StatPanel label="Memory"    value={memPct}      unit="%" color={threshold(memPct)}   fixed={1}
                       sub={memUsed != null && memTot != null ? `${(memUsed/1024).toFixed(1)} / ${(memTot/1024).toFixed(1)} GB` : undefined}
                       kind="memory" metric="pct" subject={null} range={range} />
            <StatPanel label="GPU"       value={gpu0Util}    unit="%" color={threshold(gpu0Util)} fixed={1} sub="RTX 3080 Ti"
                       kind="gpu" metric="usage_pct" subject="0" range={range} />
            <StatPanel label="VRAM"      value={gpu0Vram}    unit="%" color={threshold(gpu0Vram)} fixed={1}
                       sub={gpu0VramUsed != null && gpu0VramTot != null ? `${(gpu0VramUsed/1024).toFixed(1)} / ${(gpu0VramTot/1024).toFixed(1)} GB` : undefined}
                       kind="gpu" metric="vram_pct" subject="0" range={range} />
            <StatPanel label="GPU Temp"  value={gpu0Temp}    unit="°C" color={tempColor(gpu0Temp)} fixed={0}
                       kind="gpu" metric="temp_c" subject="0" range={range} />
            <StatPanel label="GPU Power" value={gpu0Power}   unit="W" color={powerColor(gpu0Power)} fixed={0}
                       kind="gpu" metric="power_w" subject="0" range={range} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <GaugeWithStats title="CPU"    value={cpuNow}  unit="%" color={threshold(cpuNow)}
                            kind="cpu"    metric="usage_pct" subject={null} range={range} />
            <GaugeWithStats title="Memory" value={memPct}  unit="%" color={threshold(memPct)}
                            sub={memUsed != null && memTot != null ? `${(memUsed/1024).toFixed(1)} / ${(memTot/1024).toFixed(1)} GB` : undefined}
                            kind="memory" metric="pct" subject={null} range={range} />
            <GaugeWithStats title="GPU"    value={gpu0Util} unit="%" color={threshold(gpu0Util)}
                            sub={gpu0Temp != null ? `${Math.round(gpu0Temp)}°C · ${gpu0Power ? Math.round(gpu0Power) : "?"} W` : undefined}
                            kind="gpu" metric="usage_pct" subject="0" range={range} />
          </div>
        </div>

        <div className="col-span-12 xl:col-span-7 flex flex-col gap-3 min-h-0">
          {/* Main (selected) chart — fills remaining vertical space */}
          <div className="flex-1 min-h-[240px] flex flex-col">
            {rightSelected === "util" && (
              <UtilizationCard range={range} cpuNow={cpuNow} gpuNow={gpu0Util} memNow={memPct} />
            )}
            {rightSelected === "temp" && (
              <ChartWithStats title="GPU Temp" accent="#fb7185" unit="°C"
                              kind="gpu" metric="temp_c" subject="0" range={range} colorFn={tempColor} thresholdLines={[60, 75]} />
            )}
            {rightSelected === "power" && (
              <ChartWithStats title="GPU Power" accent="#fbbf24" unit="W"
                              kind="gpu" metric="power_w" subject="0" range={range} colorFn={powerColor} thresholdLines={[200, 300]} />
            )}
          </div>

          {/* Mini rail (3 across) */}
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <MiniChartCard
              id="util" label="Utilization" accent="#22d3ee"
              selected={rightSelected === "util"}
              onSelect={() => setRightSelected("util")}
              range={range}
              overlay
            />
            <MiniChartCard
              id="temp" label="GPU Temp" accent="#fb7185" unit="°C"
              selected={rightSelected === "temp"}
              onSelect={() => setRightSelected("temp")}
              range={range}
              kind="gpu" metric="temp_c" subject="0"
              value={gpu0Temp} colorFn={tempColor} fixed={0}
            />
            <MiniChartCard
              id="power" label="GPU Power" accent="#fbbf24" unit="W"
              selected={rightSelected === "power"}
              onSelect={() => setRightSelected("power")}
              range={range}
              kind="gpu" metric="power_w" subject="0"
              value={gpu0Power} colorFn={powerColor} fixed={0}
            />
          </div>
        </div>
      </div>

      {/* Containers (full width) */}
      <Panel title="Docker Containers" accent="#f472b6"
             right={containers ? `${containers.length} running` : undefined}>
        <ContainerTable rows={containers} />
      </Panel>
    </div>
  );
}

/* ============================================================= */
/*  Panel wrapper                                                 */
/* ============================================================= */

function Panel({
  title, accent = "#22d3ee", right, children, className = "",
}: {
  title: string; accent?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
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
        <div className="ml-auto h-px flex-1 min-w-[20px]" style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }} />
        {right && <div className="text-[10px] text-text-muted tabular-nums shrink-0">{right}</div>}
      </div>
      <div className="flex-1 min-h-0 px-3 pb-3 pt-1">{children}</div>
    </section>
  );
}

/* ============================================================= */
/*  StatPanel                                                     */
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
  const stats = useMemo(() => computeStats(series), [series]);
  const gid = `sp-${kind}-${metric}-${(subject ?? "h").replace(/[^a-z0-9]/gi, "")}`;

  const delta = stats?.deltaPct ?? null;
  const trendIcon = delta == null ? "" : delta > 5 ? "↗" : delta < -5 ? "↘" : "→";
  const trendColor = delta == null ? "#64748b" : delta > 5 ? "#f43f5e" : delta < -5 ? "#22d3ee" : "#64748b";

  return (
    <div
      className="relative rounded-lg border overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}55`,
        boxShadow: `0 0 18px -8px ${color}66, 0 0 1px ${color}44 inset`,
        minHeight: 132,
      }}
    >
      <div className="px-3 pt-2 flex items-start justify-between gap-1 shrink-0">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}aa` }}>
          {label}
        </div>
        {trendIcon && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: trendColor }}>
            {trendIcon} {delta == null ? "" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
          </span>
        )}
      </div>
      <div className="px-3 mt-0.5">
        <div
          className="text-3xl font-bold tabular-nums leading-none"
          style={{ color, textShadow: `0 0 14px ${color}88` }}
        >
          {value == null ? "—" : value.toFixed(fixed)}
          <span className="text-sm font-normal ml-0.5 opacity-60">{unit}</span>
        </div>
        {sub && <div className="text-[10px] text-text-muted mt-1 tabular-nums truncate">{sub}</div>}
      </div>
      {/* min / avg / max */}
      <div className="px-3 mt-1 flex items-center justify-between text-[9px] tabular-nums">
        <span className="text-text-faint">min <span className="text-text-muted">{stats ? stats.min.toFixed(fixed) : "—"}</span></span>
        <span className="text-text-faint">avg <span className="text-text-muted">{stats ? stats.avg.toFixed(fixed) : "—"}</span></span>
        <span className="text-text-faint">max <span className="text-text-muted">{stats ? stats.max.toFixed(fixed) : "—"}</span></span>
      </div>
      <div className="flex-1 min-h-[36px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series ?? []} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
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
/*  GaugeWithStats — donut + axis legend + range stats            */
/* ============================================================= */

function GaugeWithStats({
  title, value, unit, color, sub,
  kind, metric, subject, range,
}: {
  title: string;
  value: number | null;
  unit: string;
  color: string;
  sub?: string;
  kind: string;
  metric: string;
  subject: string | null;
  range: typeof RANGES[number];
}) {
  const series = useSeries(kind, metric, subject, range.rangeMinutes, range.bucketSeconds);
  const stats = useMemo(() => computeStats(series), [series]);

  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 48;
  const circum = 2 * Math.PI * r;
  const offset = circum * (1 - v / 100);

  return (
    <Panel title={title} accent={color}>
      <div className="flex items-center gap-3">
        {/* Gauge */}
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <defs>
              <filter id={`gg-${title}`}>
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Threshold zones drawn as faint background arcs */}
            <ArcZone cx={70} cy={70} r={r} from={0}   to={60}  stroke="#22d3ee" />
            <ArcZone cx={70} cy={70} r={r} from={60}  to={80}  stroke="#fbbf24" />
            <ArcZone cx={70} cy={70} r={r} from={80}  to={100} stroke="#f43f5e" />

            {/* Base track */}
            <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="9" opacity={0.6} />
            {/* Value arc */}
            <circle
              cx="70" cy="70" r={r}
              fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={circum}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
              filter={`url(#gg-${title})`}
              style={{ transition: "stroke-dashoffset 700ms ease" }}
            />
            {/* Tick marks at 0 / 25 / 50 / 75 / 100 (inside) */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const a = (pct / 100) * 2 * Math.PI - Math.PI / 2;
              const r1 = r - 10, r2 = r - 6;
              return (
                <g key={pct}>
                  <line
                    x1={70 + Math.cos(a) * r1}
                    y1={70 + Math.sin(a) * r1}
                    x2={70 + Math.cos(a) * r2}
                    y2={70 + Math.sin(a) * r2}
                    stroke="#64748b"
                    strokeWidth={1}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-[26px] font-bold tabular-nums leading-none"
              style={{ color, textShadow: `0 0 10px ${color}66` }}
            >
              {value == null ? "—" : v.toFixed(1)}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5" style={{ color }}>{unit}</div>
          </div>
        </div>

        {/* Side stats */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <GaugeStat label="min"  value={stats?.min}    unit={unit} color="#22d3ee" />
          <GaugeStat label="avg"  value={stats?.avg}    unit={unit} color="#fbbf24" />
          <GaugeStat label="max"  value={stats?.max}    unit={unit} color="#f43f5e" />
          {sub && (
            <div className="text-[10px] text-text-muted pt-1 border-t border-white/5 tabular-nums break-all">
              {sub}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ArcZone({ cx, cy, r, from, to, stroke }: { cx: number; cy: number; r: number; from: number; to: number; stroke: string }) {
  const start = (from / 100) * 2 * Math.PI - Math.PI / 2;
  const end = (to / 100) * 2 * Math.PI - Math.PI / 2;
  const x1 = cx + Math.cos(start) * r;
  const y1 = cy + Math.sin(start) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = to - from > 50 ? 1 : 0;
  return (
    <path
      d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeOpacity={0.15}
    />
  );
}

function GaugeStat({ label, value, unit, color }: { label: string; value?: number; unit: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-[10px] tabular-nums">
      <span className="inline-flex items-center gap-1">
        <span className="h-1 w-1 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        <span className="text-text-faint uppercase tracking-wider">{label}</span>
      </span>
      <span className="text-text-muted">
        {value == null ? "—" : value.toFixed(1)}
        <span className="text-text-faint ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

/* ============================================================= */
/*  Utilization overlay card                                      */
/* ============================================================= */

function UtilizationCard({
  range, cpuNow, gpuNow, memNow,
}: {
  range: typeof RANGES[number];
  cpuNow: number | null;
  gpuNow: number | null;
  memNow: number | null;
}) {
  const cpu = useSeries("cpu", "usage_pct", null, range.rangeMinutes, range.bucketSeconds);
  const gpu = useSeries("gpu", "usage_pct", "0", range.rangeMinutes, range.bucketSeconds);
  const mem = useSeries("memory", "pct", null, range.rangeMinutes, range.bucketSeconds);

  const series = useMemo(() => mergeSeries({ cpu, gpu, mem }), [cpu, gpu, mem]);
  const hasData = series.some(p => (p.cpu ?? 0) + (p.gpu ?? 0) + (p.mem ?? 0) > 0);

  return (
    <Panel title="Utilization" accent="#22d3ee" right={`${range.label} window`} className="h-full">
      <div className="grid grid-cols-12 gap-3 h-full">
        <div className="col-span-12 xl:col-span-9 relative h-full min-h-[180px]">
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
              no samples in {range.label}
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#ffffff10" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(v: number) => formatTick(Number(v), range.rangeMinutes)}
                stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} minTickGap={32}
              />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} width={30}
                tickFormatter={(v: number) => `${v}%`} />
              <ReferenceLine y={80} stroke="#f43f5e22" strokeDasharray="3 3" />
              <ReferenceLine y={60} stroke="#fbbf2422" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: "#0b1120", border: "1px solid #22d3ee66", fontSize: 11 }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(v, name) => [`${Number(v).toFixed(1)}%`, String(name)]}
              />
              <Line type="monotone" dataKey="cpu" stroke="#22d3ee" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="gpu" stroke="#a855f7" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="mem" stroke="#38bdf8" strokeWidth={1.6} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Side legend with current values */}
        <div className="col-span-12 xl:col-span-3 flex flex-col justify-center gap-2">
          <LegendBigValue color="#22d3ee" label="CPU"    value={cpuNow} />
          <LegendBigValue color="#a855f7" label="GPU"    value={gpuNow} />
          <LegendBigValue color="#38bdf8" label="Memory" value={memNow} dashed />
        </div>
      </div>
    </Panel>
  );
}

function LegendBigValue({
  color, label, value, dashed,
}: { color: string; label: string; value: number | null; dashed?: boolean }) {
  return (
    <div
      className="rounded-md border px-3 py-2 flex items-center gap-2.5"
      style={{
        background: `linear-gradient(90deg, ${color}0a, transparent)`,
        borderColor: `${color}33`,
      }}
    >
      <span
        className="inline-block h-3 w-0.5 rounded"
        style={{
          background: color,
          boxShadow: `0 0 6px ${color}`,
          borderRight: dashed ? `1px dashed ${color}` : undefined,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}aa` }}>{label}</div>
        <div
          className="text-xl font-bold tabular-nums leading-none"
          style={{ color, textShadow: `0 0 10px ${color}66` }}
        >
          {value == null ? "—" : value.toFixed(1)}
          <span className="text-xs ml-0.5 opacity-60">%</span>
        </div>
      </div>
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

/* ============================================================= */
/*  ChartWithStats (Temp / Power)                                 */
/* ============================================================= */

function ChartWithStats({
  title, accent, unit, kind, metric, subject, range, colorFn, thresholdLines,
}: {
  title: string;
  accent: string;
  unit: string;
  kind: string;
  metric: string;
  subject: string | null;
  range: typeof RANGES[number];
  colorFn?: (v: number | null) => string;
  thresholdLines?: number[];
}) {
  const series = useSeries(kind, metric, subject, range.rangeMinutes, range.bucketSeconds);
  const stats = useMemo(() => computeStats(series), [series]);
  const hasData = series?.some(p => p.avg > 0) ?? false;
  const gid = `cs-${kind}-${metric}-${(subject ?? "h").replace(/[^a-z0-9]/gi, "")}`;
  const currentColor = colorFn ? colorFn(stats?.latest ?? null) : accent;

  return (
    <Panel
      title={title}
      accent={accent}
      className="h-full"
      right={stats
        ? <span>
            <span className="text-text-faint">min </span>{stats.min.toFixed(0)}{unit}
            <span className="text-text-faint ml-2">avg </span>{stats.avg.toFixed(0)}{unit}
            <span className="text-text-faint ml-2">max </span>{stats.max.toFixed(0)}{unit}
          </span>
        : undefined}
    >
      <div className="flex flex-col h-full">
      <div className="flex items-baseline gap-2 mb-1 shrink-0">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color: currentColor, textShadow: `0 0 10px ${currentColor}66` }}
        >
          {stats ? stats.latest.toFixed(0) : "—"}
        </span>
        <span className="text-sm opacity-60" style={{ color: currentColor }}>{unit}</span>
      </div>
      <div className="flex-1 min-h-[140px] relative">
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
            no samples in {range.label}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => formatTick(Number(v), range.rangeMinutes)}
              stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} minTickGap={32}
            />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={28} />
            {thresholdLines?.map((y, i) => (
              <ReferenceLine key={i} y={y} stroke={i === 0 ? "#fbbf2244" : "#f43f5e44"} strokeDasharray="3 3" />
            ))}
            <Tooltip
              contentStyle={{ background: "#0b1120", border: `1px solid ${accent}66`, fontSize: 11 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
              formatter={(v) => [`${Number(v).toFixed(1)}${unit ? " " + unit : ""}`, metric]}
            />
            <Area type="monotone" dataKey="avg" stroke={accent} strokeWidth={1.6} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </div>
    </Panel>
  );
}

/* ============================================================= */
/*  MiniChartCard — clickable preview for right-side rail         */
/* ============================================================= */

function MiniChartCard(props: {
  id: RightChartId;
  label: string;
  accent: string;
  unit?: string;
  selected: boolean;
  onSelect: () => void;
  range: typeof RANGES[number];
} & (
  | { overlay: true; kind?: never; metric?: never; subject?: never; value?: never; colorFn?: never; fixed?: never }
  | { overlay?: false; kind: string; metric: string; subject: string | null; value: number | null; colorFn: (v: number | null) => string; fixed: number }
)) {
  const { id, label, accent, unit = "", selected, onSelect, range } = props;

  if (props.overlay) {
    return <MiniUtilCard label={label} accent={accent} selected={selected} onSelect={onSelect} range={range} />;
  }

  const { kind, metric, subject, value, colorFn, fixed } = props;
  const series = useSeries(kind, metric, subject, range.rangeMinutes, range.bucketSeconds);
  const color = colorFn(value);
  const gid = `mini-${id}`;

  return (
    <button
      onClick={onSelect}
      className="relative rounded-lg border overflow-hidden text-left transition focus:outline-none flex flex-col"
      style={{
        background: selected
          ? `linear-gradient(180deg, ${color}14 0%, #0b1120cc 70%)`
          : `linear-gradient(180deg, ${color}06 0%, #0b1120cc 70%)`,
        borderColor: selected ? `${color}aa` : `${color}33`,
        boxShadow: selected
          ? `0 0 16px -4px ${color}aa, 0 0 1px ${color}99 inset`
          : `0 0 8px -8px ${color}44, 0 0 1px ${color}22 inset`,
        minHeight: 88,
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: selected ? color : "transparent", boxShadow: selected ? `0 0 8px ${color}` : undefined }}
      />
      <div className="px-3 pt-2 flex items-center justify-between gap-1">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}cc` }}>{label}</div>
        <div className="tabular-nums text-sm font-bold leading-none" style={{ color, textShadow: `0 0 8px ${color}66` }}>
          {value == null ? "—" : value.toFixed(fixed)}<span className="text-[10px] opacity-60 ml-0.5">{unit}</span>
        </div>
      </div>
      <div className="flex-1 min-h-[36px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series ?? []} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.2} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

function MiniUtilCard({
  label, accent, selected, onSelect, range,
}: {
  label: string; accent: string; selected: boolean; onSelect: () => void; range: typeof RANGES[number];
}) {
  const cpu = useSeries("cpu", "usage_pct", null, range.rangeMinutes, range.bucketSeconds);
  const gpu = useSeries("gpu", "usage_pct", "0", range.rangeMinutes, range.bucketSeconds);
  const mem = useSeries("memory", "pct", null, range.rangeMinutes, range.bucketSeconds);
  const series = useMemo(() => mergeSeries({ cpu, gpu, mem }), [cpu, gpu, mem]);

  return (
    <button
      onClick={onSelect}
      className="relative rounded-lg border overflow-hidden text-left transition focus:outline-none flex flex-col"
      style={{
        background: selected
          ? `linear-gradient(180deg, ${accent}14 0%, #0b1120cc 70%)`
          : `linear-gradient(180deg, ${accent}06 0%, #0b1120cc 70%)`,
        borderColor: selected ? `${accent}aa` : `${accent}33`,
        boxShadow: selected
          ? `0 0 16px -4px ${accent}aa, 0 0 1px ${accent}99 inset`
          : `0 0 8px -8px ${accent}44, 0 0 1px ${accent}22 inset`,
        minHeight: 88,
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: selected ? accent : "transparent", boxShadow: selected ? `0 0 8px ${accent}` : undefined }}
      />
      <div className="px-3 pt-2 flex items-center justify-between gap-1">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${accent}cc` }}>{label}</div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className="inline-flex items-center gap-0.5"><span className="h-1 w-1 rounded-full" style={{ background: "#22d3ee" }} /><span className="text-text-faint">CPU</span></span>
          <span className="inline-flex items-center gap-0.5"><span className="h-1 w-1 rounded-full" style={{ background: "#a855f7" }} /><span className="text-text-faint">GPU</span></span>
          <span className="inline-flex items-center gap-0.5"><span className="h-1 w-1 rounded-full" style={{ background: "#38bdf8" }} /><span className="text-text-faint">MEM</span></span>
        </div>
      </div>
      <div className="flex-1 min-h-[36px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Line type="monotone" dataKey="cpu" stroke="#22d3ee" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="gpu" stroke="#a855f7" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="mem" stroke="#38bdf8" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="3 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

function formatTick(ms: number, rangeMinutes: number): string {
  const d = new Date(ms);
  if (rangeMinutes >= 60 * 24) return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  if (rangeMinutes >= 60 * 6) return d.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ============================================================= */
/*  Container table with dual sparklines                          */
/* ============================================================= */

function ContainerTable({ rows }: { rows: ContainerRow[] | null }) {
  if (rows == null) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">loading…</div>;
  if (rows.length === 0) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">no running containers</div>;
  return (
    <div className="overflow-auto max-h-[420px] scrollbar-none">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-[#0b1120]/90 backdrop-blur-sm">
          <tr className="text-text-faint uppercase tracking-wider text-[9px]">
            <th className="text-left px-2 py-1.5">container</th>
            <th className="text-left px-2 py-1.5 w-20">CPU %</th>
            <th className="text-left px-2 py-1.5 w-40">CPU trend (1h)</th>
            <th className="text-right px-2 py-1.5 w-24">Memory</th>
            <th className="text-left px-2 py-1.5 w-40">Mem trend</th>
            <th className="text-right px-2 py-1.5 w-12">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <ContainerRowView key={r.subject} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function ContainerRowView({ row }: { row: ContainerRow }) {
  const cpu = useSeries("docker", "cpu_pct", row.subject, 60, 60);
  const mem = useSeries("docker", "mem_used_mb", row.subject, 60, 60);
  const cpuColor = threshold(row.cpuPct);
  const memColor = threshold(row.memPct);
  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition">
      <td className="px-2 py-1 text-text truncate max-w-[240px]" title={row.subject}>{row.subject}</td>
      <td className="px-2 py-1 tabular-nums font-semibold" style={{ color: cpuColor, textShadow: `0 0 4px ${cpuColor}44` }}>
        {row.cpuPct.toFixed(1)}%
      </td>
      <td className="px-2 py-1">
        <MiniSpark data={cpu ?? []} color={cpuColor} />
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-text-muted">
        {row.memMb < 1024 ? `${row.memMb.toFixed(0)} MB` : `${(row.memMb/1024).toFixed(2)} GB`}
      </td>
      <td className="px-2 py-1">
        <MiniSpark data={mem ?? []} color={memColor} />
      </td>
      <td className="px-2 py-1 text-right tabular-nums" style={{ color: memColor }}>{row.memPct.toFixed(1)}%</td>
    </tr>
  );
}

function MiniSpark({ data, color }: { data: SeriesPoint[]; color: string }) {
  if (data.length === 0) return <div className="h-6 w-full text-right text-text-faint text-[9px]">—</div>;
  const gid = `spark-${color.replace("#", "")}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="h-6 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.6} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.2} fill={`url(#${gid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
