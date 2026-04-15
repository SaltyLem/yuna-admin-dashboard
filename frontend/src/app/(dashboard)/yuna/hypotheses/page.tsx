"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, Select, SegmentedControl } from "@/components/ui";

const PAGE_SIZE = 50;

interface Hypothesis {
  id: number;
  category: string;
  content: string;
  observation: string;
  status: string;
  confidence: number;
  evidence_for: number;
  evidence_against: number;
  has_embedding: boolean;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
}

type StatusFilter = "all" | "active" | "confirmed" | "rejected";

const STATUS_COLOR: Record<string, string> = {
  active: "text-accent bg-accent-muted",
  confirmed: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  rejected: "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
};

function statusBadge(s: string): string {
  return STATUS_COLOR[s] ?? "text-text-soft bg-panel-2";
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

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function HypothesesPage() {
  const [rows, setRows] = useState<Hypothesis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sortKey,
      order: sortDir,
    });
    if (statusFilter !== "all") qs.set("status", statusFilter);
    try {
      const data = await apiFetch<{ hypotheses: Hypothesis[]; total: number }>(
        `/hypotheses?${qs}`,
      );
      setRows(data.hypotheses);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, statusFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, statusFilter]);

  const openCreate = () => {
    modal.open({
      title: "New hypothesis",
      size: "lg",
      content: <HypForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (h: Hypothesis) => {
    modal.open({
      title: `Hypothesis #${h.id}`,
      size: "lg",
      content: (
        <HypForm
          initial={h}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Hypothesis>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (h) => h.id,
    },
    {
      key: "category", label: "Category", width: "w-28", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (h) => h.category,
    },
    {
      key: "status", label: "Status", width: "w-24", sortable: true,
      render: (h) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${statusBadge(h.status)}`}
        >
          {h.status}
        </span>
      ),
    },
    {
      key: "content", label: "Content", sortable: false,
      cellClass: "max-w-md",
      render: (h) => <div className="line-clamp-2 text-text">{h.content}</div>,
    },
    {
      key: "observation", label: "Observation", sortable: false,
      cellClass: "max-w-sm",
      render: (h) => <div className="line-clamp-2 text-text-muted">{h.observation}</div>,
    },
    {
      key: "confidence", label: "Conf", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (h) => h.confidence.toFixed(2),
    },
    {
      key: "evidence_for", label: "For", width: "w-12", sortable: true,
      cellClass: "text-[color:var(--color-success)] tabular-nums",
      render: (h) => h.evidence_for,
    },
    {
      key: "evidence_against", label: "Ag", width: "w-12", sortable: true,
      cellClass: "text-[color:var(--color-danger)] tabular-nums",
      render: (h) => h.evidence_against,
    },
    {
      key: "updated_at", label: "Updated", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (h) => fmtDate(h.updated_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Hypotheses</h2>
          <p className="text-xs text-text-muted mt-0.5">
            hypotheses — Working Self の epistemic (信念とその evidence tally)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New hypothesis
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "confirmed", label: "Confirmed" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      <AdminTable<Hypothesis>
        columns={columns}
        rows={rows}
        rowKey={(h) => h.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No hypotheses"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "confidence", "evidence_for", "evidence_against", "created_at", "updated_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: hypothesis form ──

interface HypFormProps {
  initial?: Hypothesis;
  onSaved: () => void;
  onDeleted?: () => void;
}

function HypForm({ initial, onSaved, onDeleted }: HypFormProps) {
  const isEdit = !!initial;
  const [category, setCategory] = useState(initial?.category ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [observation, setObservation] = useState(initial?.observation ?? "");
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [confidence, setConfidence] = useState(initial?.confidence != null ? initial.confidence : 0.5);
  const [evidenceFor, setEvidenceFor] = useState(initial?.evidence_for ?? 0);
  const [evidenceAgainst, setEvidenceAgainst] = useState(initial?.evidence_against ?? 0);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!category.trim() || !content.trim() || !observation.trim()) return;
    setBusy(true);
    try {
      if (isEdit) {
        await apiFetch(`/hypotheses/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            category: category.trim(),
            content: content.trim(),
            observation: observation.trim(),
            status,
            confidence,
            evidence_for: evidenceFor,
            evidence_against: evidenceAgainst,
          }),
        });
      } else {
        await apiFetch(`/hypotheses`, {
          method: "POST",
          body: JSON.stringify({
            category: category.trim(),
            content: content.trim(),
            observation: observation.trim(),
            confidence,
          }),
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
      await apiFetch(`/hypotheses/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Status" value={initial.status} />
          <KV
            label="Embedding"
            value={initial.has_embedding ? "present" : "null"}
          />
          <KV label="Evidence for" value={String(initial.evidence_for)} />
          <KV label="Evidence against" value={String(initial.evidence_against)} />
          <KV label="Created" value={fmtFullDate(initial.created_at)} />
          <KV label="Updated" value={fmtFullDate(initial.updated_at)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. market, user_preference"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select
              value={status}
              onChange={(v) => setStatus(v)}
              options={[
                { value: "active", label: "active" },
                { value: "confirmed", label: "confirmed" },
                { value: "rejected", label: "rejected" },
              ]}
            />
          </Field>
        )}
      </div>

      <Field label="Content" hint={isEdit ? "編集で embedding が null にクリアされる" : "The hypothesis itself"}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="What I think might be true…"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      <Field label="Observation" hint="What prompted this hypothesis">
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={2}
          placeholder="The initial observation"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      <Field label={`Confidence: ${confidence.toFixed(2)}`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      {isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Evidence for">
            <input
              type="number"
              min={0}
              step={1}
              value={evidenceFor}
              onChange={(e) => setEvidenceFor(Math.max(0, Number(e.target.value) | 0))}
              className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
            />
          </Field>
          <Field label="Evidence against">
            <input
              type="number"
              min={0}
              step={1}
              value={evidenceAgainst}
              onChange={(e) => setEvidenceAgainst(Math.max(0, Number(e.target.value) | 0))}
              className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
            />
          </Field>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        {isEdit && onDeleted && (
          <button
            onClick={del}
            disabled={busy}
            className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition disabled:opacity-50"
          >
            Retire (soft delete)
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
          disabled={busy || !category.trim() || !content.trim() || !observation.trim()}
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
