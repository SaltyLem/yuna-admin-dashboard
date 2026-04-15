"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, SegmentedControl } from "@/components/ui";

const PAGE_SIZE = 50;

interface Rule {
  id: number;
  rule: string;
  reason: string;
  created_at: string;
  expires_at: string;
  has_embedding: boolean;
  active: boolean;
}

type Filter = "all" | "active" | "expired";

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ImmediateRulesPage() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("expires_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<Filter>("active");

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
      const data = await apiFetch<{ rules: Rule[]; total: number }>(
        `/immediate-rules?${qs}`,
      );
      setRows(data.rules);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, filter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, filter]);

  const openCreate = () => {
    modal.open({
      title: "New immediate rule",
      size: "lg",
      content: <RuleForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (r: Rule) => {
    modal.open({
      title: `Rule #${r.id}`,
      size: "lg",
      content: (
        <RuleForm
          initial={r}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Rule>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (r) => r.id,
    },
    {
      key: "active", label: "Status", width: "w-20", sortable: false,
      render: (r) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
            r.active
              ? "text-accent bg-accent-muted"
              : "text-text-faint bg-panel-2"
          }`}
        >
          {r.active ? "active" : "expired"}
        </span>
      ),
    },
    {
      key: "rule", label: "Rule", sortable: false,
      cellClass: "max-w-md",
      render: (r) => <div className="line-clamp-2 text-text">{r.rule}</div>,
    },
    {
      key: "reason", label: "Reason", sortable: false,
      cellClass: "max-w-sm",
      render: (r) => <div className="line-clamp-2 text-text-muted">{r.reason}</div>,
    },
    {
      key: "expires_at", label: "Expires", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (r) => fmtDate(r.expires_at),
    },
    {
      key: "created_at", label: "Created", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (r) => fmtDate(r.created_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Immediate rules</h2>
          <p className="text-xs text-text-muted mt-0.5">
            immediate_rules — Working Self の regulatory (短命ルール、expires_at で失効)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New rule
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <AdminTable<Rule>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No rules"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "expires_at", "created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: rule form ──

interface RuleFormProps {
  initial?: Rule;
  onSaved: () => void;
  onDeleted?: () => void;
}

function RuleForm({ initial, onSaved, onDeleted }: RuleFormProps) {
  const isEdit = !!initial;
  // Default new-rule expiry: 4h from now.
  const defaultExpiry = () => {
    const d = new Date(Date.now() + 4 * 60 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [rule, setRule] = useState(initial?.rule ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [expiresAt, setExpiresAt] = useState(
    initial ? toLocalInput(initial.expires_at) : defaultExpiry(),
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!rule.trim() || !reason.trim() || !expiresAt) return;
    setBusy(true);
    try {
      const body = {
        rule: rule.trim(),
        reason: reason.trim(),
        expires_at: new Date(expiresAt).toISOString(),
      };
      if (isEdit) {
        await apiFetch(`/immediate-rules/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/immediate-rules`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!initial) return;
    setBusy(true);
    try {
      await apiFetch(`/immediate-rules/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Status" value={initial.active ? "active" : "expired"} />
          <KV
            label="Embedding"
            value={initial.has_embedding ? "present" : "null"}
          />
          <KV label="Created" value={fmtFullDate(initial.created_at)} />
          <KV label="Expires" value={fmtFullDate(initial.expires_at)} />
        </div>
      )}

      <Field label="Rule" hint={isEdit ? "編集で embedding が null にクリアされる" : "e.g. SOL を今日は買わない"}>
        <textarea
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          rows={3}
          placeholder="The rule itself (short, imperative)"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      <Field label="Reason">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why this rule exists"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      <Field label="Expires at">
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        {isEdit && onDeleted && (
          <button
            onClick={del}
            disabled={busy}
            className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition disabled:opacity-50"
          >
            Expire now
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !rule.trim() || !reason.trim() || !expiresAt}
          className="px-4 py-2 text-sm bg-accent text-bg rounded-md font-medium hover:bg-accent-hover transition disabled:opacity-50"
        >
          {busy ? "Saving…" : isEdit ? "Save" : "Create"}
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
