"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

interface Wallet {
  id: string;
  user_id: string;
  user_email: string | null;
  chain: string;
  address: string;
  label: string;
  sort_order: number;
  is_public: boolean;
  category_id: string | null;
  category_label: string | null;
  role: string;
  created_at: string;
}

type RoleFilter = "all" | "living" | "trade" | "user";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: "2-digit", month: "2-digit", day: "2-digit" });
}

function truncAddress(a: string, head = 6, tail = 4): string {
  if (a.length <= head + tail + 3) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export default function WalletsPage() {
  const [rows, setRows] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState("role");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ wallets: Wallet[] }>("/trade/wallets");
      setRows(d.wallets);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = role === "all" ? rows : rows.filter(w => w.role === role);
  const sorted = [...filtered].sort((a, b) => {
    const va = (a as unknown as Record<string, unknown>)[sortKey];
    const vb = (b as unknown as Record<string, unknown>)[sortKey];
    const sa = String(va ?? "");
    const sb = String(vb ?? "");
    return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  const counts = {
    all:    rows.length,
    living: rows.filter(w => w.role === "living").length,
    trade:  rows.filter(w => w.role === "trade").length,
    user:   rows.filter(w => w.role === "user").length,
  };

  const columns: AdminColumn<Wallet>[] = [
    { key: "role", label: "Role", width: "w-20", sortable: true,
      render: (w) => <RoleBadge role={w.role} /> },
    { key: "chain", label: "Chain", width: "w-16", sortable: true,
      cellClass: "text-text-muted text-[11px] uppercase",
      render: (w) => w.chain },
    { key: "label", label: "Label", sortable: true,
      render: (w) => (
        <div className="min-w-0">
          <div className="text-text truncate">{w.label || "—"}</div>
          {w.category_label && <div className="text-[10px] text-text-faint">{w.category_label}</div>}
        </div>
      ) },
    { key: "address", label: "Address", width: "w-40",
      render: (w) => (
        <a
          href={explorerUrl(w.chain, w.address)}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline text-[11px] font-mono"
          title={w.address}
        >
          {truncAddress(w.address)} ↗
        </a>
      ) },
    { key: "user_email", label: "User", width: "w-40",
      cellClass: "text-text-muted text-[11px] truncate",
      render: (w) => w.user_email ?? <span className="text-text-faint">—</span> },
    { key: "is_public", label: "Public", width: "w-14", sortable: true,
      render: (w) => w.is_public
        ? <span className="text-[10px] text-accent">public</span>
        : <span className="text-[10px] text-text-faint">—</span> },
    { key: "created_at", label: "Added", width: "w-20", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (w) => fmtTime(w.created_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Wallets</h2>
        <p className="text-xs text-text-muted mt-0.5">
          <code>api_wallets</code> — balance-worker の対象となる登録ウォレット
        </p>
      </header>

      <SegmentedControl
        value={role}
        onChange={(v) => setRole(v as RoleFilter)}
        options={[
          { value: "all",    label: `All (${counts.all})` },
          { value: "living", label: `Living (${counts.living})` },
          { value: "trade",  label: `Trade (${counts.trade})` },
          { value: "user",   label: `User (${counts.user})` },
        ]}
      />

      <AdminTable<Wallet>
        columns={columns}
        rows={sorted}
        rowKey={(w) => w.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No wallets"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["created_at"]}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color = role === "living" ? "#a855f7"
              : role === "trade"  ? "#fbbf24"
              : role === "user"   ? "#22d3ee"
              : "#64748b";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {role}
    </span>
  );
}

function explorerUrl(chain: string, address: string): string {
  const c = chain.toLowerCase();
  if (c === "sol" || c === "solana") return `https://solscan.io/account/${address}`;
  if (c === "eth" || c === "ethereum") return `https://etherscan.io/address/${address}`;
  if (c === "base") return `https://basescan.org/address/${address}`;
  return `https://blockchain.com/search?search=${encodeURIComponent(address)}`;
}
