"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field } from "@/components/ui";

const PAGE_SIZE = 50;

interface Entry {
  id: number;
  timestamp: string;
  provider: string;
  endpoint: string | null;
  tokens_in: number;
  tokens_out: number;
  cost: string;
  purpose: string | null;
}

interface SummaryRow { day?: string; purpose?: string; provider?: string; n: string; cost: string; tokens_in?: string; tokens_out?: string }
interface Summary { byDay: SummaryRow[]; byPurpose: SummaryRow[]; byProvider: SummaryRow[] }

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function ApiUsagePage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [provider, setProvider] = useState("");
  const [purpose, setPurpose] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), limit: String(PAGE_SIZE), sort: sortKey, order: sortDir,
    });
    if (provider.trim()) qs.set("provider", provider.trim());
    if (purpose.trim()) qs.set("purpose", purpose.trim());
    try {
      const data = await apiFetch<{ entries: Entry[]; total: number }>(`/api-usage?${qs}`);
      setRows(data.entries);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, provider, purpose]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, provider, purpose]);

  useEffect(() => {
    void (async () => {
      try {
        setSummary(await apiFetch<Summary>(`/api-usage/summary`));
      } catch { /* ignore */ }
    })();
  }, []);

  const columns: AdminColumn<Entry>[] = [
    {
      key: "id", label: "ID", width: "w-16", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.id,
    },
    {
      key: "provider", label: "Provider", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (e) => e.provider,
    },
    {
      key: "endpoint", label: "Endpoint", width: "w-32", sortable: false,
      cellClass: "text-text-muted text-xs font-mono",
      render: (e) => e.endpoint ?? "—",
    },
    {
      key: "purpose", label: "Purpose", sortable: true,
      cellClass: "text-text-muted text-xs",
      render: (e) => e.purpose ?? "—",
    },
    {
      key: "tokens_in", label: "In", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.tokens_in,
    },
    {
      key: "tokens_out", label: "Out", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.tokens_out,
    },
    {
      key: "cost", label: "Cost", width: "w-20", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => `$${Number(e.cost).toFixed(6)}`,
    },
    {
      key: "timestamp", label: "Timestamp", width: "w-36", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (e) => fmtDate(e.timestamp),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">API usage</h2>
        <p className="text-xs text-text-muted mt-0.5">
          api_usage_log — LLM / API コスト履歴 (30d summary 付き)
        </p>
      </header>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryPanel title="By provider (30d)" rows={summary.byProvider} labelKey="provider" />
          <SummaryPanel title="By purpose (30d)" rows={summary.byPurpose} labelKey="purpose" />
          <SummaryPanel title="By day (30d)" rows={summary.byDay.slice(0, 7)} labelKey="day" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Provider">
          <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. anthropic"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
        </Field>
        <Field label="Purpose">
          <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. crawl-summary"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent" />
        </Field>
      </div>

      <AdminTable<Entry>
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No entries"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "cost", "tokens_in", "tokens_out", "timestamp"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </div>
  );
}

function SummaryPanel({
  title, rows, labelKey,
}: {
  title: string; rows: SummaryRow[]; labelKey: "day" | "purpose" | "provider";
}) {
  return (
    <div className="bg-panel border border-border rounded-md p-4">
      <div className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-3">{title}</div>
      <div className="space-y-1">
        {rows.length === 0 && <div className="text-xs text-text-faint">—</div>}
        {rows.map((r, i) => (
          <div key={i} className="text-xs flex items-baseline justify-between gap-2">
            <span className="text-text break-all truncate">{r[labelKey] ?? "—"}</span>
            <span className="text-text-muted tabular-nums font-mono shrink-0">
              ${Number(r.cost).toFixed(4)} · {r.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
