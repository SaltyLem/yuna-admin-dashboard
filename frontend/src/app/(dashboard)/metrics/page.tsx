"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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

/* ============================================================= */
/*  range selector                                                */
/* ============================================================= */

const RANGES: Array<{ label: string; rangeMinutes: number; bucketSeconds: number }> = [
  { label: "5m",  rangeMinutes: 5,    bucketSeconds: 15 },
  { label: "15m", rangeMinutes: 15,   bucketSeconds: 30 },
  { label: "1h",  rangeMinutes: 60,   bucketSeconds: 60 },
  { label: "6h",  rangeMinutes: 360,  bucketSeconds: 300 },
  { label: "24h", rangeMinutes: 1440, bucketSeconds: 600 },
];

/* ============================================================= */
/*  hooks                                                         */
/* ============================================================= */

function useSeries(kind: string, metric: string, subject: string | null, rangeMinutes: number, bucketSeconds: number): SeriesPoint[] | null {
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
      } catch { /* keep previous */ }
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
      } catch { /* keep previous */ }
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

  const cpuNow  = findLatest("cpu", "usage_pct");
  const memPct  = findLatest("memory", "pct");
  const memUsed = findLatest("memory", "used_mb");
  const memTot  = findLatest("memory", "total_mb");
  const gpu0Util  = findLatest("gpu", "usage_pct", "0");
  const gpu0Vram  = findLatest("gpu", "vram_pct", "0");
  const gpu0VramUsed = findLatest("gpu", "vram_used_mb", "0");
  const gpu0VramTot  = findLatest("gpu", "vram_total_mb", "0");
  const gpu0Temp  = findLatest("gpu", "temp_c", "0");
  const gpu0Power = findLatest("gpu", "power_w", "0");

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header + range selector */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">System Metrics</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Linux PC host + GPU + Docker コンテナのリソース使用状況 (15s 粒度)
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={[
                "px-2 py-0.5 rounded tabular-nums tracking-wide transition",
                i === rangeIdx
                  ? "text-[#05070d] font-semibold bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
                  : "text-text-muted hover:text-text",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 shrink-0">
        <Kpi label="CPU"         value={fmtPct(cpuNow)} accent="#22d3ee" sub={`${RANGES[rangeIdx]!.label} avg`} />
        <Kpi label="Memory"      value={fmtPct(memPct)}
          accent="#38bdf8"
          sub={memUsed != null && memTot != null ? `${Math.round(memUsed/1024)}/${Math.round(memTot/1024)} GB` : ""}
        />
        <Kpi label="GPU"         value={fmtPct(gpu0Util)} accent="#a855f7" sub="RTX 3080 Ti" />
        <Kpi label="VRAM"        value={fmtPct(gpu0Vram)}
          accent="#c084fc"
          sub={gpu0VramUsed != null && gpu0VramTot != null
            ? `${(gpu0VramUsed/1024).toFixed(1)}/${(gpu0VramTot/1024).toFixed(1)} GB`
            : ""}
        />
        <Kpi label="GPU Temp"    value={gpu0Temp != null ? `${Math.round(gpu0Temp)}°C` : "—"} accent="#fb7185" />
        <Kpi label="GPU Power"   value={gpu0Power != null ? `${Math.round(gpu0Power)} W` : "—"} accent="#fbbf24" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 flex-1 min-h-0">
        <ChartCard title="CPU" accent="#22d3ee">
          <MetricAreaChart kind="cpu" metric="usage_pct" color="#22d3ee" range={range} unit="%" />
        </ChartCard>
        <ChartCard title="Memory" accent="#38bdf8">
          <MetricAreaChart kind="memory" metric="pct" color="#38bdf8" range={range} unit="%" />
        </ChartCard>
        <ChartCard title="GPU Utilization" accent="#a855f7">
          <MetricAreaChart kind="gpu" subject="0" metric="usage_pct" color="#a855f7" range={range} unit="%" />
        </ChartCard>
        <ChartCard title="VRAM Used" accent="#c084fc">
          <MetricAreaChart kind="gpu" subject="0" metric="vram_used_mb" color="#c084fc" range={range} unit="MB" />
        </ChartCard>
        <ChartCard title="GPU Temp" accent="#fb7185">
          <MetricAreaChart kind="gpu" subject="0" metric="temp_c" color="#fb7185" range={range} unit="°C" />
        </ChartCard>
        <ChartCard title="GPU Power" accent="#fbbf24">
          <MetricAreaChart kind="gpu" subject="0" metric="power_w" color="#fbbf24" range={range} unit="W" />
        </ChartCard>
      </div>

      {/* Container table */}
      <div className="shrink-0">
        <ChartCard title="Docker containers (latest, sorted by CPU)" accent="#f472b6">
          <ContainerTable rows={containers} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  chart + cards                                                 */
/* ============================================================= */

function ChartCard({ title, accent = "#22d3ee", children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <section
      className="relative rounded-lg border border-white/10 bg-[#0b1120]/60 backdrop-blur-sm flex flex-col min-h-[180px] overflow-hidden"
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
      <div className="flex-1 min-h-0 px-3 pb-3 pt-1 overflow-hidden">{children}</div>
    </section>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div
      className="rounded-lg border border-white/10 bg-[#0b1120]/60 px-3 py-2"
      style={{ boxShadow: `0 0 18px -10px ${accent}55, 0 0 1px ${accent}33 inset` }}
    >
      <div className="text-[10px] uppercase tracking-[0.15em] text-text-faint">{label}</div>
      <div
        className="mt-0.5 text-xl font-bold tabular-nums"
        style={{ color: accent, textShadow: `0 0 10px ${accent}66` }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

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
    <div className="h-full w-full relative">
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

function ContainerTable({ rows }: { rows: ContainerRow[] | null }) {
  if (rows == null) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">loading…</div>;
  if (rows.length === 0) return <div className="h-20 flex items-center justify-center text-[11px] text-text-faint">no running containers</div>;
  const maxCpu = Math.max(1, ...rows.map(r => r.cpuPct));
  const maxMem = Math.max(1, ...rows.map(r => r.memMb));
  return (
    <div className="overflow-auto max-h-72 scrollbar-none">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-faint uppercase tracking-wider text-[9px]">
            <th className="text-left px-2 py-1">container</th>
            <th className="text-right px-2 py-1 w-32">CPU %</th>
            <th className="text-right px-2 py-1 w-32">Memory</th>
            <th className="text-right px-2 py-1 w-20">Mem %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.subject} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition">
              <td className="px-2 py-1 text-text truncate max-w-[260px]" title={r.subject}>{r.subject}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                <Bar value={r.cpuPct} max={maxCpu} color="#22d3ee" label={`${r.cpuPct.toFixed(1)}%`} />
              </td>
              <td className="px-2 py-1 text-right tabular-nums">
                <Bar value={r.memMb} max={maxMem} color="#38bdf8" label={`${r.memMb < 1024 ? r.memMb.toFixed(0) + "MB" : (r.memMb/1024).toFixed(2) + "GB"}`} />
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-text-muted">{r.memPct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="relative w-20 h-1.5 bg-white/10 rounded overflow-hidden">
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
        />
      </span>
      <span className="text-text-muted w-16 text-right">{label}</span>
    </div>
  );
}

// avoid unused import warning when useMemo isn't used here
void useMemo;
