"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { apiFetch } from "@/components/use-api";

interface RoleEntry {
  role?: string;
  usdc: number; sol: number; totalValueUsd: number;
}
interface Treasury {
  ts: number;
  usdc: number;
  sol: number;
  totalValueUsd: number;
  byRole: Record<string, RoleEntry>;
  rates: Record<string, number> | null;
}
interface HistoryPoint { t: number; role: string; avg: number; min: number; max: number }
interface Token {
  ts: string; role: string; symbol: string; mint: string | null;
  balance: number; priceUsd: number | null; valueUsd: number | null;
}

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d",  days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function TradeOverviewPage() {
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [rangeIdx, setRangeIdx] = useState(1);
  const range = RANGES[rangeIdx]!;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const t = await apiFetch<Treasury>("/trade/treasury", { silent: true });
        if (!cancelled) setTreasury(t);
      } catch { /* keep */ }
      try {
        const tk = await apiFetch<{ tokens: Token[] }>("/trade/tokens", { silent: true });
        if (!cancelled) setTokens(tk.tokens);
      } catch { /* keep */ }
    }
    void load();
    const h = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadHist() {
      try {
        const d = await apiFetch<{ series: HistoryPoint[] }>(`/trade/history?days=${range.days}`, { silent: true });
        if (!cancelled) setHistory(d.series);
      } catch { /* keep */ }
    }
    void loadHist();
    const h = setInterval(loadHist, 60_000);
    return () => { cancelled = true; clearInterval(h); };
  }, [range.days]);

  const chart = useMemo(() => {
    const byT = new Map<number, Record<string, number>>();
    const totalByT = new Map<number, number>();
    for (const p of history) {
      const row = byT.get(p.t) ?? { t: p.t };
      row[p.role] = p.avg;
      byT.set(p.t, row);
      totalByT.set(p.t, (totalByT.get(p.t) ?? 0) + p.avg);
    }
    const out: Array<{ t: number; living?: number; trade?: number; all?: number }> = [];
    for (const [t, row] of [...byT.entries()].sort((a, b) => a[0] - b[0])) {
      out.push({ ...row, t, all: totalByT.get(t) ?? 0 });
    }
    return out;
  }, [history]);

  const live = treasury?.byRole["living"];
  const tradeRole = treasury?.byRole["trade"];
  const topTokens = tokens.slice(0, 8);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Trade</h2>
          <p className="text-xs text-text-muted mt-0.5">
            balance-worker が集計した treasury / 保有トークン / 履歴
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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <Kpi label="Total Value" value={fmtUsd(treasury?.totalValueUsd)} accent="#22d3ee" big />
        <Kpi label="Living"      value={fmtUsd(live?.totalValueUsd)}     accent="#a855f7" />
        <Kpi label="Trade"       value={fmtUsd(tradeRole?.totalValueUsd)} accent="#fbbf24" />
        <Kpi label="SOL / USDC"  value={treasury ? `${treasury.sol.toFixed(2)} SOL · ${treasury.usdc.toFixed(0)} USDC` : "—"} accent="#38bdf8" big={false} />
      </section>

      <section className="rounded-xl border border-white/10 bg-panel px-3 py-3 flex-1 min-h-[280px] flex flex-col">
        <div className="flex items-center px-1 mb-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-text-muted">Treasury history ({range.label})</span>
          <Legend items={[
            { color: "#22d3ee", label: "All" },
            { color: "#a855f7", label: "Living" },
            { color: "#fbbf24", label: "Trade" },
          ]} />
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#ffffff10" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(v: number) => formatTick(Number(v), range.days)}
                stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} minTickGap={40}
              />
              <YAxis
                stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={56}
                tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{ background: "#0b1120", border: "1px solid #22d3ee66", fontSize: 11 }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(v, name) => [fmtUsd(Number(v)), String(name)]}
              />
              <Line type="monotone" dataKey="all"    stroke="#22d3ee" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="living" stroke="#a855f7" strokeWidth={1.4} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="trade"  stroke="#fbbf24" strokeWidth={1.4} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <div className="xl:col-span-2 rounded-xl border border-white/10 bg-panel px-3 py-3">
          <div className="flex items-center mb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-text-muted">Top holdings</span>
            <Link href="/trade/positions" className="ml-auto text-[11px] text-accent hover:underline">all positions →</Link>
          </div>
          {topTokens.length === 0 ? (
            <div className="text-text-faint text-xs">no snapshots yet</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {topTokens.map((t, i) => (
                <li key={`${t.role}:${t.symbol}:${i}`} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="w-16 text-[10px] uppercase tracking-wider text-text-muted">{t.role}</span>
                  <span className="text-text font-semibold w-16">{t.symbol}</span>
                  <span className="flex-1" />
                  <span className="tabular-nums text-text-muted w-24 text-right">{t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  <span className="tabular-nums w-20 text-right text-accent font-semibold">{fmtUsd(t.valueUsd ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-panel px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-text-muted mb-2">Quick links</div>
          <div className="flex flex-col gap-2">
            <NavLink href="/trade/wallets"   label="Wallets"   sub="登録ウォレット一覧" />
            <NavLink href="/trade/positions" label="Positions" sub="role 別の最新保有トークン" />
            <NavLink href="/trade/rules"     label="Rules"     sub="トレードルール (planned)" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent, big = true }: { label: string; value: string; accent: string; big?: boolean }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        background: `linear-gradient(180deg, ${accent}10 0%, #0b1120cc 70%)`,
        borderColor: `${accent}33`,
        boxShadow: `0 0 12px -10px ${accent}88, 0 0 1px ${accent}22 inset`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${accent}bb` }}>{label}</div>
      <div
        className={(big ? "text-2xl" : "text-base") + " font-bold tabular-nums leading-none mt-1"}
        style={{ color: accent, textShadow: `0 0 10px ${accent}55` }}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="ml-auto flex items-center gap-3 text-[10px]">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1 text-text-muted">
          <span className="inline-block h-1.5 w-3 rounded" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function NavLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-white/10 px-2.5 py-2 hover:border-white/30 transition flex items-center gap-2"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text">{label}</div>
        <div className="text-[10px] text-text-faint">{sub}</div>
      </div>
      <span className="text-accent">→</span>
    </Link>
  );
}

function fmtUsd(v: number | undefined | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function formatTick(ms: number, days: number): string {
  const d = new Date(ms);
  if (days >= 14) return d.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
  if (days >= 2) return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
