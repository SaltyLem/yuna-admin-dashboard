"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, Select, SegmentedControl, TagInput } from "@/components/ui";

interface Goal {
  id: number;
  type: "long_term" | "mid_term" | "short_term";
  content: string;
  status: "active" | "achieved" | "failed" | "abandoned" | "expired";
  progress: string | null;
  deadline: string | null;
  domains: string[] | null;
  keywords: string[] | null;
  active_when: string[] | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

type StatusFilter = "active" | "all" | Goal["status"];
type TypeFilter = "all" | Goal["type"];

const STATUS_COLOR: Record<Goal["status"], string> = {
  active: "text-accent bg-accent-muted",
  achieved: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  failed: "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
  abandoned: "text-text-muted bg-panel-2",
  expired: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
};

const TYPE_SHORT: Record<Goal["type"], string> = {
  long_term: "LONG",
  mid_term: "MID",
  short_term: "SHORT",
};

const PAGE_SIZE = 50;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (typeFilter !== "all") qs.set("type", typeFilter);
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    try {
      const data = await apiFetch<{ goals: Goal[]; total: number }>(
        `/goals?${qs}`,
      );
      setGoals(data.goals);
      setTotal(data.total);
    } catch {
      setGoals([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);

  // Reset to page 1 when filters or sort change.
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, sortKey, sortDir]);

  const openCreate = () => {
    modal.open({
      title: "New goal",
      size: "lg",
      content: <GoalForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (goal: Goal) => {
    modal.open({
      title: `Edit goal #${goal.id}`,
      size: "lg",
      content: (
        <GoalForm
          initial={goal}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Goal>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (g) => g.id,
    },
    {
      key: "type", label: "Type", width: "w-20", sortable: true,
      render: (g) => (
        <span className="text-[10px] font-mono font-semibold text-text-soft">
          {TYPE_SHORT[g.type]}
        </span>
      ),
    },
    {
      key: "status", label: "Status", width: "w-24", sortable: true,
      render: (g) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${STATUS_COLOR[g.status]}`}
        >
          {g.status}
        </span>
      ),
    },
    {
      key: "content", label: "Content", sortable: true,
      cellClass: "max-w-md",
      render: (g) => <div className="line-clamp-2 text-text">{g.content}</div>,
    },
    {
      key: "progress", label: "Progress", sortable: true,
      cellClass: "max-w-xs",
      render: (g) => (
        <div className="line-clamp-2 text-text-muted">{g.progress ?? "—"}</div>
      ),
    },
    {
      key: "domains", label: "Domains", width: "w-32", sortable: true,
      render: (g) => <TagList items={g.domains} />,
    },
    {
      key: "keywords", label: "Keywords", width: "w-32", sortable: true,
      render: (g) => <TagList items={g.keywords} />,
    },
    {
      key: "active_when", label: "Active when", width: "w-32", sortable: true,
      render: (g) => <TagList items={g.active_when} />,
    },
    {
      key: "deadline", label: "Deadline", width: "w-24", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (g) => fmtDate(g.deadline),
    },
    {
      key: "created_at", label: "Created", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (g) => fmtDate(g.created_at),
    },
    {
      key: "closed_at", label: "Closed", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (g) => fmtDate(g.closed_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Goals</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Yuna の目標テーブル (DB 直結)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New goal
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "active", label: "Active" },
            { value: "achieved", label: "Achieved" },
            { value: "failed", label: "Failed" },
            { value: "abandoned", label: "Abandoned" },
            { value: "expired", label: "Expired" },
            { value: "all", label: "All" },
          ]}
        />
        <SegmentedControl
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "long_term", label: "Long" },
            { value: "mid_term", label: "Mid" },
            { value: "short_term", label: "Short" },
          ]}
        />
      </div>

      <AdminTable<Goal>
        columns={columns}
        rows={goals}
        rowKey={(g) => g.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No goals"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "deadline", "created_at", "closed_at"]}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Small presentational bits ──

function TagList({ items }: { items: string[] | null }) {
  if (!items || items.length === 0) {
    return <span className="text-text-faint">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t, i) => (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 rounded bg-panel-2 border border-border text-[11px] text-text-soft"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// ── Modal content: goal form ──

interface GoalFormProps {
  initial?: Goal;
  onSaved: () => void;
  onDeleted?: () => void;
}

function GoalForm({ initial, onSaved, onDeleted }: GoalFormProps) {
  const [type, setType] = useState<Goal["type"]>(initial?.type ?? "short_term");
  const [content, setContent] = useState(initial?.content ?? "");
  const [status, setStatus] = useState<Goal["status"]>(initial?.status ?? "active");
  const [progress, setProgress] = useState(initial?.progress ?? "");
  const [deadline, setDeadline] = useState(
    initial?.deadline ? initial.deadline.slice(0, 10) : "",
  );
  const [domains, setDomains] = useState<string[]>(initial?.domains ?? []);
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [activeWhen, setActiveWhen] = useState<string[]>(initial?.active_when ?? []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const body = {
        type,
        content: content.trim(),
        status,
        progress: progress.trim() || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        domains,
        keywords,
        activeWhen,
      };
      if (initial) {
        await apiFetch(`/goals/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/goals", { method: "POST", body: JSON.stringify(body) });
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
      await apiFetch(`/goals/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select
            value={type}
            onChange={(v) => setType(v as Goal["type"])}
            options={[
              { value: "long_term", label: "Long term" },
              { value: "mid_term", label: "Mid term" },
              { value: "short_term", label: "Short term" },
            ]}
          />
        </Field>
        {initial && (
          <Field label="Status">
            <Select
              value={status}
              onChange={(v) => setStatus(v as Goal["status"])}
              options={[
                { value: "active", label: "Active" },
                { value: "achieved", label: "Achieved" },
                { value: "failed", label: "Failed" },
                { value: "abandoned", label: "Abandoned" },
                { value: "expired", label: "Expired" },
              ]}
            />
          </Field>
        )}
      </div>

      <Field label="Content">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="What should Yuna aim for?"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      {initial && (
        <Field label="Progress note">
          <input
            type="text"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="Latest progress…"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
      )}

      <Field label="Deadline">
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Domains" hint="Perception bias: 注目する領域">
        <TagInput value={domains} onChange={setDomains} placeholder="e.g. trading" />
      </Field>

      <Field label="Keywords" hint="拾う単語">
        <TagInput value={keywords} onChange={setKeywords} placeholder="e.g. SOL" />
      </Field>

      <Field label="Active when" hint="有効化条件 (時間帯 / 状況)">
        <TagInput value={activeWhen} onChange={setActiveWhen} placeholder="e.g. evening" />
      </Field>

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        {initial && onDeleted && (
          <button
            onClick={del}
            disabled={busy}
            className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition disabled:opacity-50"
          >
            Delete
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
          disabled={busy || !content.trim()}
          className="px-4 py-2 bg-accent text-bg rounded-md font-medium text-sm hover:bg-accent-hover transition disabled:opacity-50"
        >
          {initial ? "Save" : "Create"}
        </button>
      </div>
    </div>
  );
}

