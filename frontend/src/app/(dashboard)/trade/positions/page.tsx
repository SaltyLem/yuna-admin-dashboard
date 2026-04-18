"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

interface Token {
  ts: string; role: string; symbol: string; mint: string | null;
  balance: number; priceUsd: number | null; valueUsd: number | null;
}

type RoleFilter = "all" | "living" | "trade";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(4)}`;
}

export default function PositionsPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState("valueUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ tokens: Token[] }>(
        role === "all" ? "/trade/tokens" : `/trade/tokens?role=${role}`,
      );
      setRows(d.tokens);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey];
      const vb = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof va === "number" || typeof vb === "number") {
        return sortDir === "asc" ? Number(va ?? 0) - Number(vb ?? 0) : Number(vb ?? 0) - Number(va ?? 0);
      }
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { all: 0 };
    for (const tok of rows) {
      const v = tok.valueUsd ?? 0;
      t.all = (t.all ?? 0) + v;
      t[tok.role] = (t[tok.role] ?? 0) + v;
    }
    return t;
  }, [rows]);

  const columns: AdminColumn<Token>[] = [
    { key: "role", label: "Role", width: "w-20", sortable: true,
      render: (t) => <RoleBadge role={t.role} /> },
    { key: "symbol", label: "Symbol", width: "w-20", sortable: true,
      cellClass: "text-text font-semibold",
      render: (t) => t.symbol },
    { key: "balance", label: "Balance", width: "w-32", sortable: true,
      cellClass: "text-text tabular-nums text-right",
      render: (t) => t.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) },
    { key: "priceUsd", label: "Price", width: "w-24", sortable: true,
      cellClass: "text-text-muted tabular-nums text-right text-[11px]",
      render: (t) => fmtUsd(t.priceUsd) },
    { key: "valueUsd", label: "Value", width: "w-28", sortable: true,
      cellClass: "tabular-nums text-right font-semibold",
      render: (t) => <span style={{ color: "#22d3ee" }}>{fmtUsd(t.valueUsd)}</span> },
    { key: "share", label: "% role", width: "w-20",
      cellClass: "text-text-muted tabular-nums text-right text-[11px]",
      render: (t) => {
        const roleTotal = totals[t.role] ?? 0;
        if (!roleTotal || !t.valueUsd) return "—";
        return `${(100 * t.valueUsd / roleTotal).toFixed(1)}%`;
      } },
    { key: "mint", label: "Mint", width: "w-32",
      cellClass: "text-text-faint font-mono text-[10px]",
      render: (t) => t.mint
        ? <span title={t.mint}>{t.mint.slice(0, 8)}…{t.mint.slice(-4)}</span>
        : <span className="text-text-faint">—</span> },
    { key: "ts", label: "Measured", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (t) => fmtTime(t.ts) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Positions</h2>
        <p className="text-xs text-text-muted mt-0.5">
          <code>api_token_snapshots</code> — balance-worker の最新保有残高 (role × symbol)
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 shrink-0">
        <Kpi label="All"    value={fmtUsd(totals.all ?? 0)}    color="#22d3ee" />
        <Kpi label="Living" value={fmtUsd(totals.living ?? 0)} color="#a855f7" />
        <Kpi label="Trade"  value={fmtUsd(totals.trade ?? 0)}  color="#fbbf24" />
      </div>

      <SegmentedControl
        value={role}
        onChange={(v) => setRole(v as RoleFilter)}
        options={[
          { value: "all",    label: "All" },
          { value: "living", label: "Living" },
          { value: "trade",  label: "Trade" },
        ]}
      />

      <AdminTable<Token>
        columns={columns}
        rows={sorted}
        rowKey={(t) => `${t.role}:${t.symbol}`}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No positions"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["valueUsd", "balance", "priceUsd", "ts"]}
      />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color = role === "living" ? "#a855f7" : role === "trade" ? "#fbbf24" : "#64748b";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {role}
    </span>
  );
}
