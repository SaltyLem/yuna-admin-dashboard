"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, TagInput } from "@/components/ui";

const PAGE_SIZE = 50;

interface GeneralEvent {
  id: number;
  member_esk_ids: number[];
  period_start: string;
  period_end: string;
  spatial_distribution: unknown;
  dominant_subject_key: string | null;
  label: string;
  narrative: string;
  tags: string[] | null;
  emotional_arc: unknown;
  significance: number;
  has_embedding: boolean;
  retrieval_count: number;
  last_retrieved_at: string | null;
  created_at: string;
  updated_at: string;
  participants: string[] | null;
  primary_participant: string | null;
  forgotten_at: string | null;
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

export default function GeneralEventsPage() {
  const [rows, setRows] = useState<GeneralEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("period_end");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    try {
      const data = await apiFetch<{ events: GeneralEvent[]; total: number }>(
        `/memory/general-events?${qs}`,
      );
      setRows(data.events);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir]);

  const openCreate = () => {
    modal.open({
      title: "New general event",
      size: "lg",
      content: <GEForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (g: GeneralEvent) => {
    modal.open({
      title: `General event #${g.id}`,
      size: "lg",
      content: (
        <GEForm
          initial={g}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<GeneralEvent>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (g) => g.id,
    },
    {
      key: "label", label: "Label", width: "w-40", sortable: false,
      cellClass: "text-text text-xs",
      render: (g) => <div className="line-clamp-1">{g.label}</div>,
    },
    {
      key: "dominant_subject_key", label: "Subject", width: "w-28", sortable: false,
      cellClass: "text-text-soft text-xs font-mono",
      render: (g) => g.dominant_subject_key ?? "—",
    },
    {
      key: "narrative", label: "Narrative", sortable: false,
      cellClass: "max-w-lg",
      render: (g) => <div className="line-clamp-2 text-text-muted">{g.narrative}</div>,
    },
    {
      key: "member_esk_count", label: "Members", width: "w-16", sortable: false,
      cellClass: "text-text-muted tabular-nums",
      render: (g) => g.member_esk_ids?.length ?? 0,
    },
    {
      key: "significance", label: "Sig", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (g) => g.significance.toFixed(2),
    },
    {
      key: "retrieval_count", label: "Uses", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (g) => g.retrieval_count,
    },
    {
      key: "has_embedding", label: "Emb", width: "w-12", sortable: false,
      cellClass: "text-text-faint text-center",
      render: (g) =>
        g.has_embedding ? (
          <span title="Has embedding">●</span>
        ) : (
          <span className="text-[color:var(--color-warning)]" title="No embedding (recency fallback)">
            ○
          </span>
        ),
    },
    {
      key: "period_end", label: "Period end", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (g) => fmtDate(g.period_end),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">General events</h2>
          <p className="text-xs text-text-muted mt-0.5">
            general_events — 複数 ESK を集約した period narrative
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New GE
        </button>
      </header>

      <AdminTable<GeneralEvent>
        columns={columns}
        rows={rows}
        rowKey={(g) => g.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No general events"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "significance", "retrieval_count", "period_end", "period_start", "created_at", "last_retrieved_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: GE form ──

interface GEFormProps {
  initial?: GeneralEvent;
  onSaved: () => void;
  onDeleted?: () => void;
}

function parseIdList(raw: string): number[] | null {
  const parts = raw.split(/[,\s]+/).filter((s) => s.length > 0);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out.length > 0 ? out : null;
}

function GEForm({ initial, onSaved, onDeleted }: GEFormProps) {
  const isEdit = !!initial;
  const [memberIdsStr, setMemberIdsStr] = useState(
    initial?.member_esk_ids?.join(", ") ?? "",
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [narrative, setNarrative] = useState(initial?.narrative ?? "");
  const [significance, setSignificance] = useState(
    initial?.significance != null ? initial.significance : 0.5,
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [dominantSubjectKey, setDominantSubjectKey] = useState(initial?.dominant_subject_key ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!label.trim() || !narrative.trim()) return;
    setBusy(true);
    try {
      if (isEdit) {
        await apiFetch(`/memory/general-events/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: label.trim(),
            narrative: narrative.trim(),
            significance,
            tags: tags.length > 0 ? tags : null,
            dominant_subject_key: dominantSubjectKey.trim() || null,
          }),
        });
      } else {
        const memberIds = parseIdList(memberIdsStr);
        if (!memberIds || memberIds.length === 0) { setBusy(false); return; }
        await apiFetch(`/memory/general-events`, {
          method: "POST",
          body: JSON.stringify({
            member_esk_ids: memberIds,
            label: label.trim(),
            narrative: narrative.trim(),
            significance,
            tags: tags.length > 0 ? tags : undefined,
            dominant_subject_key: dominantSubjectKey.trim() || undefined,
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
      await apiFetch(`/memory/general-events/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Member ESK ids" value={initial.member_esk_ids?.join(", ") ?? "—"} />
          <KV label="Members count" value={String(initial.member_esk_ids?.length ?? 0)} />
          <KV label="Period start" value={fmtFullDate(initial.period_start)} />
          <KV label="Period end" value={fmtFullDate(initial.period_end)} />
          <KV label="Retrievals" value={String(initial.retrieval_count)} />
          <KV
            label="Last retrieved"
            value={fmtFullDate(initial.last_retrieved_at)}
          />
          <KV
            label="Embedding"
            value={initial.has_embedding ? "present" : "null (recency fallback)"}
          />
          <KV
            label="Primary participant"
            value={initial.primary_participant ?? "—"}
          />
          <KV label="Created" value={fmtFullDate(initial.created_at)} />
          <KV label="Updated" value={fmtFullDate(initial.updated_at)} />
        </div>
      )}

      {!isEdit && (
        <Field label="Member ESK IDs" hint="Required. カンマ or 空白区切り (e.g. 12, 13, 14)">
          <input
            type="text"
            value={memberIdsStr}
            onChange={(e) => setMemberIdsStr(e.target.value)}
            placeholder="12, 13, 14"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
      )}

      <Field label="Label" hint="Short title">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. SOL 監視 — 今週"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Narrative" hint={isEdit ? "編集で embedding が null にクリアされる" : "Period narrative. Required."}>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={6}
          placeholder="What unfolded across this period…"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Significance: ${significance.toFixed(2)}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={significance}
            onChange={(e) => setSignificance(Number(e.target.value))}
            className="w-full"
          />
        </Field>
        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} placeholder="e.g. trade, weekly" />
        </Field>
      </div>

      <Field label="Dominant subject key" hint="e.g. asset:SOL / person:123">
        <input
          type="text"
          value={dominantSubjectKey}
          onChange={(e) => setDominantSubjectKey(e.target.value)}
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
            Forget (soft delete)
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
          disabled={busy || !label.trim() || !narrative.trim()}
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
