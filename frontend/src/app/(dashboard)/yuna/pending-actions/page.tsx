"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

const PAGE_SIZE = 50;

interface PendingAction {
  action_id: string;
  action_type: string;
  detail: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  context_key: string | null;
  expected_outcome: string | null;
  expected_pnl: string | null;
  subject_key: string | null;
}

type Filter = "all" | "unresolved" | "resolved";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function PendingActionsPage() {
  const [rows, setRows] = useState<PendingAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<Filter>("unresolved");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sortKey,
      order: sortDir,
      filter,
    });
    try {
      const data = await apiFetch<{ actions: PendingAction[]; total: number }>(
        `/pending-actions?${qs}`,
      );
      setRows(data.actions);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, filter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, filter]);

  const resolve = async (actionId: string) => {
    try {
      await apiFetch(`/pending-actions/${encodeURIComponent(actionId)}/resolve`, {
        method: "POST",
      });
      void load();
    } catch { /* toast */ }
  };

  const openDetail = (a: PendingAction) => {
    modal.open({
      title: `Pending action ${a.action_id}`,
      size: "lg",
      content: <PendingActionDetail action={a} onResolved={() => { modal.close(); void load(); }} onResolve={resolve} />,
    });
  };

  const columns: AdminColumn<PendingAction>[] = [
    {
      key: "action_id", label: "ID", width: "w-32", sortable: true,
      cellClass: "text-text-faint text-xs font-mono",
      render: (a) => <span className="truncate block">{a.action_id}</span>,
    },
    {
      key: "action_type", label: "Type", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (a) => a.action_type,
    },
    {
      key: "resolved", label: "Status", width: "w-24", sortable: true,
      render: (a) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
            a.resolved ? "text-text-faint bg-panel-2" : "text-accent bg-accent-muted"
          }`}
        >
          {a.resolved ? "resolved" : "pending"}
        </span>
      ),
    },
    {
      key: "subject_key", label: "Subject", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (a) => a.subject_key ?? "—",
    },
    {
      key: "detail", label: "Detail", sortable: false,
      cellClass: "max-w-md",
      render: (a) => <div className="line-clamp-2 text-text">{a.detail}</div>,
    },
    {
      key: "expected_outcome", label: "Expected", width: "w-40", sortable: false,
      cellClass: "text-text-muted text-xs",
      render: (a) => a.expected_outcome ? <div className="line-clamp-2">{a.expected_outcome}</div> : "—",
    },
    {
      key: "created_at", label: "Created", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (a) => fmtDate(a.created_at),
    },
    {
      key: "resolved_at", label: "Resolved", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (a) => fmtDate(a.resolved_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Pending actions</h2>
          <p className="text-xs text-text-muted mt-0.5">
            pending_actions — executeAction が emit した action、結果 event で resolve される
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "unresolved", label: "Unresolved" },
            { value: "resolved", label: "Resolved" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <AdminTable<PendingAction>
        columns={columns}
        rows={rows}
        rowKey={(a) => a.action_id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No pending actions"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["created_at", "resolved_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openDetail}
      />
    </div>
  );
}

function PendingActionDetail({
  action,
  onResolve,
  onResolved,
}: {
  action: PendingAction;
  onResolve: (actionId: string) => Promise<void>;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const handleResolve = async () => {
    setBusy(true);
    try {
      await onResolve(action.action_id);
      onResolved();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
        <KV label="Action ID" value={action.action_id} />
        <KV label="Type" value={action.action_type} />
        <KV label="Status" value={action.resolved ? "resolved" : "pending"} />
        <KV label="Subject key" value={action.subject_key ?? "—"} />
        <KV label="Context key" value={action.context_key ?? "—"} />
        <KV label="Expected pnl" value={action.expected_pnl ?? "—"} />
        <KV label="Created" value={fmtFullDate(action.created_at)} />
        <KV label="Resolved" value={fmtFullDate(action.resolved_at)} />
      </div>

      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
          Detail
        </div>
        <pre className="text-xs text-text bg-panel-2 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words">
          {action.detail}
        </pre>
      </div>

      {action.expected_outcome && (
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
            Expected outcome
          </div>
          <div className="text-sm text-text whitespace-pre-wrap break-words">
            {action.expected_outcome}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        {!action.resolved && (
          <button
            onClick={handleResolve}
            disabled={busy}
            className="px-3 py-2 text-sm bg-accent text-bg rounded-md font-medium hover:bg-accent-hover transition disabled:opacity-50"
          >
            {busy ? "Resolving…" : "Mark resolved"}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">
        {label}
      </div>
      <div className="text-xs text-text font-mono break-all">{value}</div>
    </div>
  );
}
