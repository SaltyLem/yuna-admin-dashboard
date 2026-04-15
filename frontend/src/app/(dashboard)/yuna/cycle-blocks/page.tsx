"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";

const PAGE_SIZE = 50;

interface CycleBlock {
  id: string;
  status: string;
  total_cost: number;
  iteration_count: number;
  started_at: string;
  completed_at: string | null;
}

interface CycleBlockDetail extends CycleBlock {
  iterations: unknown[];
  created_at: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtDuration(start: string, end: string | null): string {
  if (!end) return "…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

export default function CycleBlocksPage() {
  const [rows, setRows] = useState<CycleBlock[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("started_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), limit: String(PAGE_SIZE), sort: sortKey, order: sortDir,
    });
    try {
      const data = await apiFetch<{ blocks: CycleBlock[]; total: number }>(`/cycle-blocks?${qs}`);
      setRows(data.blocks);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir]);

  const openDetail = async (b: CycleBlock) => {
    try {
      const data = await apiFetch<{ block: CycleBlockDetail }>(`/cycle-blocks/${b.id}`);
      modal.open({
        title: `Cycle block ${b.id.slice(0, 8)}…`,
        size: "lg",
        content: <Detail block={data.block} />,
      });
    } catch { /* ignore */ }
  };

  const columns: AdminColumn<CycleBlock>[] = [
    {
      key: "id", label: "ID", width: "w-24", sortable: true,
      cellClass: "text-text-faint font-mono text-xs",
      render: (b) => b.id.slice(0, 8),
    },
    {
      key: "status", label: "Status", width: "w-24", sortable: true,
      render: (b) => (
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
          b.status === "completed" ? "text-accent bg-accent-muted"
          : b.status === "failed" ? "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10"
          : "text-text-soft bg-panel-2"
        }`}>{b.status}</span>
      ),
    },
    {
      key: "iteration_count", label: "Iters", width: "w-14", sortable: false,
      cellClass: "text-text-muted tabular-nums",
      render: (b) => b.iteration_count,
    },
    {
      key: "total_cost", label: "Cost", width: "w-20", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (b) => `$${b.total_cost.toFixed(4)}`,
    },
    {
      key: "duration", label: "Duration", width: "w-20", sortable: false,
      cellClass: "text-text-muted tabular-nums",
      render: (b) => fmtDuration(b.started_at, b.completed_at),
    },
    {
      key: "started_at", label: "Started", width: "w-40", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (b) => fmtDate(b.started_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Cycle blocks</h2>
        <p className="text-xs text-text-muted mt-0.5">
          cycle_blocks — 認知サイクル 1 本ごとの runtime trace
        </p>
      </header>

      <AdminTable<CycleBlock>
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No cycle blocks"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["total_cost", "started_at", "completed_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openDetail}
      />
    </div>
  );
}

function Detail({ block }: { block: CycleBlockDetail }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
        <KV label="ID" value={block.id} />
        <KV label="Status" value={block.status} />
        <KV label="Total cost" value={`$${block.total_cost.toFixed(6)}`} />
        <KV label="Iterations" value={String(block.iterations.length)} />
        <KV label="Started" value={fmtDate(block.started_at)} />
        <KV label="Completed" value={fmtDate(block.completed_at)} />
      </div>
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Iterations</div>
        <pre className="text-xs text-text bg-panel-2 p-3 rounded-md overflow-auto whitespace-pre-wrap break-words max-h-[60vh]">
          {JSON.stringify(block.iterations, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-xs text-text font-mono break-all">{value}</div>
    </div>
  );
}
