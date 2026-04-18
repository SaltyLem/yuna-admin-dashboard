"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
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

/* ============================================================= */
/*  metric catalog                                                */
/* ============================================================= */

type ColorFn = (v: number | null) => string;

interface MetricDef {
  id: string;
  label: string;
  kind: string;
  metric: string;
  subject: string | null;
  unit: string;
  fixed: number;
  colorFn: ColorFn;
  thresholdLines?: number[];
  sub?: (latest: Latest) => string | undefined;
  yMax?: number;
}

interface Latest {
  cpuNow: number | null;
  memPct: number | null;
  memUsed: number | null;
  memTot: number | null;
  gpuUtil: number | null;
  gpuVram: number | null;
  gpuVramUsed: number | null;
  gpuVramTot: number | null;
  gpuTemp: number | null;
  gpuPower: number | null;
}

function pctThreshold(value: number | null): string {
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

const METRICS: MetricDef[] = [
  {
    id: "cpu", label: "CPU", kind: "cpu", metric: "usage_pct", subject: null,
    unit: "%", fixed: 1, colorFn: pctThreshold, thresholdLines: [60, 80], yMax: 100,
  },
  {
    id: "memory", label: "Memory", kind: "memory", metric: "pct", subject: null,
    unit: "%", fixed: 1, colorFn: pctThreshold, thresholdLines: [60, 80], yMax: 100,
    sub: (l) => l.memUsed != null && l.memTot != null
      ? `${(l.memUsed / 1024).toFixed(1)} / ${(l.memTot / 1024).toFixed(1)} GB` : undefined,
  },
  {
    id: "gpu", label: "GPU", kind: "gpu", metric: "usage_pct", subject: "0",
    unit: "%", fixed: 1, colorFn: pctThreshold, thresholdLines: [60, 80], yMax: 100,
    sub: () => "RTX 3080 Ti",
  },
  {
    id: "vram", label: "VRAM", kind: "gpu", metric: "vram_pct", subject: "0",
    unit: "%", fixed: 1, colorFn: pctThreshold, thresholdLines: [60, 80], yMax: 100,
    sub: (l) => l.gpuVramUsed != null && l.gpuVramTot != null
      ? `${(l.gpuVramUsed / 1024).toFixed(1)} / ${(l.gpuVramTot / 1024).toFixed(1)} GB` : undefined,
  },
  {
    id: "gpuTemp", label: "GPU Temp", kind: "gpu", metric: "temp_c", subject: "0",
    unit: "°C", fixed: 0, colorFn: tempColor, thresholdLines: [60, 75],
  },
  {
    id: "gpuPower", label: "GPU Power", kind: "gpu", metric: "power_w", subject: "0",
    unit: "W", fixed: 0, colorFn: powerColor, thresholdLines: [200, 300],
  },
];

/* ============================================================= */
/*  hooks                                                         */
/* ============================================================= */

function useSeries(
  kind: string, metric: string, subject: string | null,
  rangeMinutes: number, bucketSeconds: number,
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
      } catch { /* keep */ }
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
/*  stats                                                         */
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

export default function MetricsPage() {
  const [rangeIdx, setRangeIdx] = useState(2);
  const [selectedId, setSelectedId] = useState<string>("cpu");
  const range = RANGES[rangeIdx]!;
  const latest = useLatest();
  const containers = useContainers();

  const findLatest = useCallback((kind: string, metric: string, subject: string | null = null): number | null => {
    if (!latest) return null;
    const hit = latest.find(s => s.kind === kind && s.metric === metric && s.subject === subject);
    return hit?.value ?? null;
  }, [latest]);

  const latestBundle: Latest = useMemo(() => ({
    cpuNow:       findLatest("cpu", "usage_pct"),
    memPct:       findLatest("memory", "pct"),
    memUsed:      findLatest("memory", "used_mb"),
    memTot:       findLatest("memory", "total_mb"),
    gpuUtil:      findLatest("gpu", "usage_pct", "0"),
    gpuVram:      findLatest("gpu", "vram_pct", "0"),
    gpuVramUsed:  findLatest("gpu", "vram_used_mb", "0"),
    gpuVramTot:   findLatest("gpu", "vram_total_mb", "0"),
    gpuTemp:      findLatest("gpu", "temp_c", "0"),
    gpuPower:     findLatest("gpu", "power_w", "0"),
  }), [findLatest]);

  const valueFor = (m: MetricDef): number | null => {
    if (m.id === "cpu")       return latestBundle.cpuNow;
    if (m.id === "memory")    return latestBundle.memPct;
    if (m.id === "gpu")       return latestBundle.gpuUtil;
    if (m.id === "vram")      return latestBundle.gpuVram;
    if (m.id === "gpuTemp")   return latestBundle.gpuTemp;
    if (m.id === "gpuPower")  return latestBundle.gpuPower;
    return null;
  };

  const selected = METRICS.find(m => m.id === selectedId) ?? METRICS[0]!;

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
                i === rangeIdx ? "text-[#05070d] font-semibold" : "text-text-muted hover:text-text",
              ].join(" ")}
              style={i === rangeIdx ? { background: "#22d3ee", boxShadow: "0 0 8px #22d3eeaa" } : {}}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* KPI rail + main chart */}
      <div className="grid grid-cols-12 gap-3 shrink-0">
        <aside className="col-span-12 lg:col-span-3 xl:col-span-3 flex flex-col gap-2">
          {METRICS.map(m => (
            <KpiRailItem
              key={m.id}
              def={m}
              value={valueFor(m)}
              latestBundle={latestBundle}
              range={range}
              selected={m.id === selectedId}
              onSelect={() => setSelectedId(m.id)}
            />
          ))}
        </aside>

        <div className="col-span-12 lg:col-span-9 xl:col-span-9">
          <MainChart def={selected} value={valueFor(selected)} latestBundle={latestBundle} range={range} />
        </div>
      </div>

      {/* Combined utilization overlay */}
      <UtilizationCard range={range} cpuNow={latestBundle.cpuNow} gpuNow={latestBundle.gpuUtil} memNow={latestBundle.memPct} />

      {/* Containers */}
      <Panel title="Docker Containers" accent="#f472b6"
             right={containers ? `${containers.length} running` : undefined}>
        <ContainerTable rows={containers} />
      </Panel>
    </div>
  );
}

/* ============================================================= */
/*  KpiRailItem — compact card in left rail                       */
/* ============================================================= */

function KpiRailItem({
  def, value, latestBundle, range, selected, onSelect,
}: {
  def: MetricDef;
  value: number | null;
  latestBundle: Latest;
  range: typeof RANGES[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const series = useSeries(def.kind, def.metric, def.subject, range.rangeMinutes, range.bucketSeconds);
  const stats = useMemo(() => computeStats(series), [series]);
  const color = def.colorFn(value);
  const gid = `rail-${def.id}`;

  const delta = stats?.deltaPct ?? null;
  const trendIcon = delta == null ? "" : delta > 5 ? "↗" : delta < -5 ? "↘" : "→";
  const trendColor = delta == null ? "#64748b" : delta > 5 ? "#f43f5e" : delta < -5 ? "#22d3ee" : "#64748b";
  const sub = def.sub?.(latestBundle);

  return (
    <button
      onClick={onSelect}
      className="relative rounded-lg border overflow-hidden flex flex-col text-left transition focus:outline-none"
      style={{
        background: selected
          ? `linear-gradient(180deg, ${color}18 0%, #0b1120cc 70%)`
          : `linear-gradient(180deg, ${color}08 0%, #0b1120cc 70%)`,
        borderColor: selected ? `${color}aa` : `${color}33`,
        boxShadow: selected
          ? `0 0 18px -4px ${color}aa, 0 0 1px ${color}99 inset`
          : `0 0 10px -8px ${color}44, 0 0 1px ${color}22 inset`,
      }}
    >
      {/* active indicator bar */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{
          background: selected ? color : "transparent",
          boxShadow: selected ? `0 0 8px ${color}` : undefined,
        }}
      />

      <div className="px-3 pt-2 flex items-start justify-between gap-1">
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}cc` }}>
          {def.label}
        </div>
        {trendIcon && (
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: trendColor }}>
            {trendIcon} {delta == null ? "" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
          </span>
        )}
      </div>

      <div className="px-3 mt-0.5 flex items-baseline gap-1">
        <span
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color, textShadow: `0 0 10px ${color}66` }}
        >
          {value == null ? "—" : value.toFixed(def.fixed)}
        </span>
        <span className="text-xs opacity-60" style={{ color }}>{def.unit}</span>
      </div>
      {sub && <div className="px-3 text-[9.5px] text-text-muted mt-1 tabular-nums truncate">{sub}</div>}

      <div className="px-3 mt-1 flex items-center justify-between text-[9px] tabular-nums">
        <span className="text-text-faint">min <span className="text-text-muted">{stats ? stats.min.toFixed(def.fixed) : "—"}</span></span>
        <span className="text-text-faint">avg <span className="text-text-muted">{stats ? stats.avg.toFixed(def.fixed) : "—"}</span></span>
        <span className="text-text-faint">max <span className="text-text-muted">{stats ? stats.max.toFixed(def.fixed) : "—"}</span></span>
      </div>

      <div className="h-7 mt-1 mb-0.5">
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

/* ============================================================= */
/*  MainChart — big chart for selected metric                     */
/* ============================================================= */

function MainChart({
  def, value, latestBundle, range,
}: {
  def: MetricDef;
  value: number | null;
  latestBundle: Latest;
  range: typeof RANGES[number];
}) {
  const series = useSeries(def.kind, def.metric, def.subject, range.rangeMinutes, range.bucketSeconds);
  const stats = useMemo(() => computeStats(series), [series]);
  const color = def.colorFn(value);
  const gid = `main-${def.id}`;
  const hasData = series?.some(p => p.avg > 0) ?? false;
  const sub = def.sub?.(latestBundle);

  return (
    <Panel
      title={def.label}
      accent={color}
      right={stats
        ? <span>
            <span className="text-text-faint">min </span>{stats.min.toFixed(def.fixed)}{def.unit}
            <span className="text-text-faint ml-2">avg </span>{stats.avg.toFixed(def.fixed)}{def.unit}
            <span className="text-text-faint ml-2">max </span>{stats.max.toFixed(def.fixed)}{def.unit}
          </span>
        : undefined}
    >
      <div className="flex items-baseline gap-3 mb-2">
        <div className="flex items-baseline gap-1">
          <span
            className="text-4xl font-bold tabular-nums leading-none"
            style={{ color, textShadow: `0 0 14px ${color}88` }}
          >
            {value == null ? "—" : value.toFixed(def.fixed)}
          </span>
          <span className="text-base opacity-60" style={{ color }}>{def.unit}</span>
        </div>
        {sub && (
          <span className="text-[11px] text-text-muted tabular-nums">{sub}</span>
        )}
        <span className="ml-auto text-[10px] text-text-faint tabular-nums">{range.label} window · {range.bucketSeconds}s buckets</span>
      </div>

      <div className="relative h-56">
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-text-faint pointer-events-none z-10">
            no samples in {range.label}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series ?? []} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => formatTick(Number(v), range.rangeMinutes)}
              stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} minTickGap={36}
            />
            <YAxis
              stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={36}
              domain={def.yMax ? [0, def.yMax] : [0, "auto"]}
              tickFormatter={(v: number) => `${v}${def.unit === "%" ? "%" : ""}`}
            />
            {def.thresholdLines?.map((y, i) => (
              <ReferenceLine key={y}
                y={y}
                stroke={i === 0 ? "#fbbf2455" : "#f43f5e55"}
                strokeDasharray="3 3"
                label={{ value: `${y}${def.unit}`, position: "right", fill: i === 0 ? "#fbbf24aa" : "#f43f5eaa", fontSize: 9 }}
              />
            ))}
            <Tooltip
              contentStyle={{ background: "#0b1120", border: `1px solid ${color}66`, fontSize: 11 }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
              formatter={(v) => [`${Number(v).toFixed(def.fixed)}${def.unit}`, def.label]}
            />
            <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={1.8} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
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
/*  Utilization overlay                                           */
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
    <Panel title="Utilization (combined)" accent="#22d3ee" right={`${range.label} window`}>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-9 relative h-48">
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

function formatTick(ms: number, rangeMinutes: number): string {
  const d = new Date(ms);
  if (rangeMinutes >= 60 * 24) return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  if (rangeMinutes >= 60 * 6) return d.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ============================================================= */
/*  Container table                                               */
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
  const cpuColor = pctThreshold(row.cpuPct);
  const memColor = pctThreshold(row.memPct);
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
