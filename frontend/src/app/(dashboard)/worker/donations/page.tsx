"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";

interface Donation {
  id: number;
  tx_signature: string;
  sender: string;
  token: string;
  amount: number;
  amount_usd: number;
  created_at: string;
  person_id: string | null;
  person_name: string | null;
  person_nickname: string | null;
}

interface Monthly { totalUsd: number; count: number }

const PAGE_SIZE = 50;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function truncMid(s: string, head = 6, tail = 6): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export default function DonationsWorkerPage() {
  const [rows, setRows] = useState<Donation[]>([]);
  const [total, setTotal] = useState(0);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    try {
      const d = await apiFetch<{ donations: Donation[]; total: number; monthly: Monthly }>(`/worker/donations?${qs}`);
      setRows(d.donations);
      setTotal(d.total);
      setMonthly(d.monthly);
    } catch {
      setRows([]); setTotal(0); setMonthly(null);
    } finally {
      setLoading(false);
    }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);

  const columns: AdminColumn<Donation>[] = [
    { key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (d) => d.id },
    { key: "token", label: "Token", width: "w-16", sortable: true,
      cellClass: "text-text-muted text-[11px] font-mono",
      render: (d) => d.token },
    { key: "amount", label: "Amount", width: "w-24", sortable: true,
      cellClass: "text-text tabular-nums text-right",
      render: (d) => d.amount.toLocaleString(undefined, { maximumFractionDigits: 6 }) },
    { key: "amount_usd", label: "USD", width: "w-20", sortable: true,
      cellClass: "text-accent tabular-nums text-right font-semibold",
      render: (d) => `$${d.amount_usd.toFixed(2)}` },
    { key: "sender", label: "Sender", width: "w-40",
      cellClass: "text-text-muted text-[11px] font-mono",
      render: (d) => (
        <span title={d.sender}>{truncMid(d.sender)}</span>
      ) },
    { key: "person_name", label: "Person",
      render: (d) => d.person_name ? (
        <div className="text-text">
          {d.person_nickname ?? d.person_name}
          {d.person_nickname && d.person_name !== d.person_nickname && (
            <span className="text-[10px] text-text-faint ml-1">({d.person_name})</span>
          )}
        </div>
      ) : <span className="text-text-faint text-[11px]">—</span> },
    { key: "tx_signature", label: "Tx", width: "w-32",
      cellClass: "text-[10px] font-mono",
      render: (d) => (
        <a
          href={`https://solscan.io/tx/${d.tx_signature}`}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline"
          title={d.tx_signature}
        >{truncMid(d.tx_signature, 4, 4)} ↗</a>
      ) },
    { key: "created_at", label: "Received", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (d) => fmtTime(d.created_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Donations</h2>
        <p className="text-xs text-text-muted mt-0.5">
          donation-worker が living wallet への SOL/USDC 入金を検知したレコード
        </p>
      </header>

      {/* 30-day summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 shrink-0">
        <Kpi label="30d USD total" value={monthly ? `$${monthly.totalUsd.toFixed(2)}` : "—"} color="#fbbf24" />
        <Kpi label="30d count" value={monthly?.count ?? 0} color="#a855f7" />
        <Kpi label="All-time" value={total} color="#22d3ee" />
      </div>

      <AdminTable<Donation>
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No donations"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "amount", "amount_usd", "created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
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
