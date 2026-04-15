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

type Spatial =
  | "perceiving"
  | "streaming"
  | "batchchat"
  | "video-creating"
  | "offline"
  | "strategy";

interface Situation {
  id: number;
  parent_id: number | null;
  depth: number;
  spatial: Spatial;
  thread_id: string | null;
  subject_key: string | null;
  status: "active" | "resolved";
  theme: string | null;
  intentional_goal: string | null;
  intentional_goal_id: number | null;
  causal_source: string | null;
  resolve_reason: string | null;
  participants: string[] | null;
  primary_participant: string | null;
  peak_valence: number | null;
  peak_valence_at: string | null;
  end_valence: number | null;
  event_count: number | null;
  avg_salience: number | null;
  started_at: string;
  last_event_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = "all" | "active" | "resolved";
type SpatialFilter = "all" | Spatial;

const SPATIAL_COLOR: Record<Spatial, string> = {
  perceiving: "text-accent bg-accent-muted",
  streaming: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  batchchat: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
  "video-creating": "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
  offline: "text-text-faint bg-panel-2",
  strategy: "text-text-soft bg-panel-2",
};

const STATUS_COLOR: Record<Situation["status"], string> = {
  active: "text-accent bg-accent-muted",
  resolved: "text-text-muted bg-panel-2",
};

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

export default function SituationsPage() {
  const [rows, setRows] = useState<Situation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("last_event_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [spatialFilter, setSpatialFilter] = useState<SpatialFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (spatialFilter !== "all") qs.set("spatial", spatialFilter);
    try {
      const data = await apiFetch<{ situations: Situation[]; total: number }>(
        `/memory/situations?${qs}`,
      );
      setRows(data.situations);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, statusFilter, spatialFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, statusFilter, spatialFilter]);

  const openCreate = () => {
    modal.open({
      title: "New situation",
      size: "lg",
      content: <SituationForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (s: Situation) => {
    modal.open({
      title: `Situation #${s.id}`,
      size: "lg",
      content: (
        <SituationForm
          initial={s}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Situation>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (s) => s.id,
    },
    {
      key: "depth", label: "L", width: "w-10", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (s) => s.depth,
    },
    {
      key: "spatial", label: "Spatial", width: "w-28", sortable: true,
      render: (s) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${SPATIAL_COLOR[s.spatial]}`}
        >
          {s.spatial}
        </span>
      ),
    },
    {
      key: "subject_key", label: "Subject", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (s) => s.subject_key ?? "—",
    },
    {
      key: "status", label: "Status", width: "w-20", sortable: true,
      render: (s) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${STATUS_COLOR[s.status]}`}
        >
          {s.status}
        </span>
      ),
    },
    {
      key: "theme", label: "Theme / Goal", sortable: false,
      cellClass: "max-w-md",
      render: (s) => (
        <div className="line-clamp-2 text-text">
          {s.theme ?? s.intentional_goal ?? s.causal_source ?? "—"}
        </div>
      ),
    },
    {
      key: "event_count", label: "Events", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (s) => s.event_count ?? 0,
    },
    {
      key: "last_event_at", label: "Last event", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (s) => fmtDate(s.last_event_at),
    },
    {
      key: "started_at", label: "Started", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (s) => fmtDate(s.started_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Situations</h2>
          <p className="text-xs text-text-muted mt-0.5">
            situations_v2 — 自伝軸の L0 / L1 クラスタリング
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New situation
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "resolved", label: "Resolved" },
          ]}
        />
        <SegmentedControl
          value={spatialFilter}
          onChange={(v) => setSpatialFilter(v as SpatialFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "perceiving", label: "Perceive" },
            { value: "streaming", label: "Stream" },
            { value: "batchchat", label: "Batch" },
            { value: "video-creating", label: "Video" },
            { value: "strategy", label: "Strategy" },
            { value: "offline", label: "Offline" },
          ]}
        />
      </div>

      <AdminTable<Situation>
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No situations"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "event_count", "last_event_at", "started_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: situation form ──

interface SituationFormProps {
  initial?: Situation;
  onSaved: () => void;
  onDeleted?: () => void;
}

function SituationForm({ initial, onSaved, onDeleted }: SituationFormProps) {
  // Create 時のみ: spatial, subject_key, thread_id, parent_id が書き込み可
  // Edit 時: theme, intentional_goal, causal_source のみ (API 側の白リスト)
  const [spatial, setSpatial] = useState<Spatial>(initial?.spatial ?? "perceiving");
  const [subjectKey, setSubjectKey] = useState(initial?.subject_key ?? "");
  const [threadId, setThreadId] = useState(initial?.thread_id ?? "");
  const [parentIdStr, setParentIdStr] = useState(
    initial?.parent_id != null ? String(initial.parent_id) : "",
  );
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [intentionalGoal, setIntentionalGoal] = useState(initial?.intentional_goal ?? "");
  const [causalSource, setCausalSource] = useState(initial?.causal_source ?? "");
  const [busy, setBusy] = useState(false);

  const isEdit = !!initial;

  const save = async () => {
    setBusy(true);
    try {
      if (isEdit) {
        // PATCH — 白リスト 3 field だけ送る
        await apiFetch(`/memory/situations/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            theme: theme.trim() || null,
            intentional_goal: intentionalGoal.trim() || null,
            causal_source: causalSource.trim() || null,
          }),
        });
      } else {
        // POST
        const parsedParentId = parentIdStr.trim() ? Number(parentIdStr.trim()) : null;
        if (parsedParentId !== null && !Number.isFinite(parsedParentId)) {
          setBusy(false);
          return;
        }
        await apiFetch(`/memory/situations`, {
          method: "POST",
          body: JSON.stringify({
            spatial,
            subject_key: subjectKey.trim() || undefined,
            thread_id: threadId.trim() || undefined,
            parent_id: parsedParentId,
            theme: theme.trim() || undefined,
            intentional_goal: intentionalGoal.trim() || undefined,
            causal_source: causalSource.trim() || undefined,
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
      await apiFetch(`/memory/situations/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 詳細 (read-only) — edit 時のみ表示 */}
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Spatial" value={initial.spatial} />
          <KV label="Depth" value={String(initial.depth)} />
          <KV label="Status" value={initial.status} />
          <KV label="Events" value={String(initial.event_count ?? 0)} />
          <KV label="Subject key" value={initial.subject_key ?? "—"} />
          <KV label="Thread id" value={initial.thread_id ?? "—"} />
          <KV label="Parent" value={initial.parent_id != null ? `#${initial.parent_id}` : "—"} />
          <KV
            label="Peak valence"
            value={initial.peak_valence != null ? initial.peak_valence.toFixed(2) : "—"}
          />
          <KV label="Started" value={fmtFullDate(initial.started_at)} />
          <KV label="Last event" value={fmtFullDate(initial.last_event_at)} />
          {initial.resolved_at && (
            <KV label="Resolved" value={fmtFullDate(initial.resolved_at)} />
          )}
        </div>
      )}

      {/* Create 時のみ: 構造 field */}
      {!isEdit && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spatial">
              <Select
                value={spatial}
                onChange={(v) => setSpatial(v as Spatial)}
                options={[
                  { value: "perceiving", label: "perceiving" },
                  { value: "streaming", label: "streaming" },
                  { value: "batchchat", label: "batchchat" },
                  { value: "video-creating", label: "video-creating" },
                  { value: "strategy", label: "strategy" },
                  { value: "offline", label: "offline" },
                ]}
              />
            </Field>
            <Field label="Parent ID" hint="Optional, creates L1/L2 child">
              <input
                type="number"
                value={parentIdStr}
                onChange={(e) => setParentIdStr(e.target.value)}
                placeholder="e.g. 42"
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subject key" hint="e.g. person:123 / asset:SOL">
              <input
                type="text"
                value={subjectKey}
                onChange={(e) => setSubjectKey(e.target.value)}
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </Field>
            <Field label="Thread id" hint="session / video id for multi-instance spatials">
              <input
                type="text"
                value={threadId}
                onChange={(e) => setThreadId(e.target.value)}
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </Field>
          </div>
        </>
      )}

      {/* 編集可能: 白リスト 3 field */}
      <Field label="Theme">
        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. 雑談 / SOL 監視"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Intentional goal">
        <input
          type="text"
          value={intentionalGoal}
          onChange={(e) => setIntentionalGoal(e.target.value)}
          placeholder="What this situation is trying to accomplish"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Causal source">
        <input
          type="text"
          value={causalSource}
          onChange={(e) => setCausalSource(e.target.value)}
          placeholder="What triggered this situation"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        {isEdit && onDeleted && (
          <button
            onClick={del}
            disabled={busy}
            className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition disabled:opacity-50"
          >
            Delete (soft)
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
          disabled={busy}
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
