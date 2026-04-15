"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import {
  AdminTable,
  type AdminColumn,
  type SortDir,
} from "@/components/admin-table";
import { Field, SegmentedControl, TagInput } from "@/components/ui";

const PAGE_SIZE = 50;

type Spatial =
  | "perceiving"
  | "streaming"
  | "batchchat"
  | "video-creating"
  | "offline"
  | "strategy";

interface ESK {
  id: number;
  source_episode_id: number;
  spatial: Spatial;
  subject_key: string | null;
  theme: string | null;
  intentional_goal: string | null;
  occurred_at: string;
  duration_seconds: number | null;
  summary: string;
  highlight_event_ids: number[] | null;
  emotional_arc: unknown;
  tags: string[] | null;
  significance: number;
  has_embedding: boolean;
  retrieval_count: number;
  last_retrieved_at: string | null;
  created_at: string;
  general_event_id: number | null;
  participants: string[] | null;
  primary_participant: string | null;
  forgotten_at: string | null;
}

type SpatialFilter = "all" | Spatial;

const SPATIAL_COLOR: Record<Spatial, string> = {
  perceiving: "text-accent bg-accent-muted",
  streaming: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  batchchat: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
  "video-creating": "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
  offline: "text-text-faint bg-panel-2",
  strategy: "text-text-soft bg-panel-2",
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

export default function EventSpecificPage() {
  const [rows, setRows] = useState<ESK[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("occurred_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [spatialFilter, setSpatialFilter] = useState<SpatialFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    if (spatialFilter !== "all") qs.set("spatial", spatialFilter);
    try {
      const data = await apiFetch<{ items: ESK[]; total: number }>(
        `/memory/event-specific?${qs}`,
      );
      setRows(data.items);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, spatialFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, spatialFilter]);

  const openCreate = () => {
    modal.open({
      title: "New event-specific knowledge",
      size: "lg",
      content: <ESKForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (e: ESK) => {
    modal.open({
      title: `ESK #${e.id}`,
      size: "lg",
      content: (
        <ESKForm
          initial={e}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<ESK>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.id,
    },
    {
      key: "spatial", label: "Spatial", width: "w-28", sortable: true,
      render: (e) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${SPATIAL_COLOR[e.spatial]}`}
        >
          {e.spatial}
        </span>
      ),
    },
    {
      key: "subject_key", label: "Subject", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (e) => e.subject_key ?? "—",
    },
    {
      key: "summary", label: "Summary", sortable: false,
      cellClass: "max-w-lg",
      render: (e) => <div className="line-clamp-2 text-text">{e.summary}</div>,
    },
    {
      key: "significance", label: "Sig", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.significance.toFixed(2),
    },
    {
      key: "retrieval_count", label: "Uses", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.retrieval_count,
    },
    {
      key: "has_embedding", label: "Emb", width: "w-12", sortable: false,
      cellClass: "text-text-faint text-center",
      render: (e) =>
        e.has_embedding ? (
          <span title="Has embedding">●</span>
        ) : (
          <span className="text-[color:var(--color-warning)]" title="No embedding (recency fallback only)">
            ○
          </span>
        ),
    },
    {
      key: "occurred_at", label: "Occurred", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (e) => fmtDate(e.occurred_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Event-specific knowledge</h2>
          <p className="text-xs text-text-muted mt-0.5">
            event_specific_knowledge — episode から consolidate された narrative 記憶
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New ESK
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
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

      <AdminTable<ESK>
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No ESK rows"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "significance", "retrieval_count", "occurred_at", "created_at", "last_retrieved_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: ESK form ──

interface ESKFormProps {
  initial?: ESK;
  onSaved: () => void;
  onDeleted?: () => void;
}

function ESKForm({ initial, onSaved, onDeleted }: ESKFormProps) {
  const isEdit = !!initial;
  const [sourceEpisodeIdStr, setSourceEpisodeIdStr] = useState(
    initial?.source_episode_id != null ? String(initial.source_episode_id) : "",
  );
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [significance, setSignificance] = useState(
    initial?.significance != null ? initial.significance : 0.5,
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [intentionalGoal, setIntentionalGoal] = useState(initial?.intentional_goal ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!summary.trim()) return;
    setBusy(true);
    try {
      if (isEdit) {
        await apiFetch(`/memory/event-specific/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            summary: summary.trim(),
            significance,
            tags: tags.length > 0 ? tags : null,
            theme: theme.trim() || null,
            intentional_goal: intentionalGoal.trim() || null,
          }),
        });
      } else {
        const sourceEpisodeId = Number(sourceEpisodeIdStr.trim());
        if (!Number.isFinite(sourceEpisodeId)) { setBusy(false); return; }
        await apiFetch(`/memory/event-specific`, {
          method: "POST",
          body: JSON.stringify({
            source_episode_id: sourceEpisodeId,
            summary: summary.trim(),
            significance,
            tags: tags.length > 0 ? tags : undefined,
            theme: theme.trim() || undefined,
            intentional_goal: intentionalGoal.trim() || undefined,
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
      await apiFetch(`/memory/event-specific/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Source episode" value={`#${initial.source_episode_id}`} />
          <KV label="Spatial" value={initial.spatial} />
          <KV label="Subject key" value={initial.subject_key ?? "—"} />
          <KV
            label="Primary participant"
            value={initial.primary_participant ?? "—"}
          />
          <KV label="Occurred" value={fmtFullDate(initial.occurred_at)} />
          <KV label="Duration" value={initial.duration_seconds != null ? `${initial.duration_seconds}s` : "—"} />
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
            label="General event"
            value={initial.general_event_id != null ? `#${initial.general_event_id}` : "—"}
          />
          <KV label="Created" value={fmtFullDate(initial.created_at)} />
        </div>
      )}

      {!isEdit && (
        <Field label="Source episode ID" hint="Required. 1 episode につき 1 ESK (UNIQUE)">
          <input
            type="number"
            value={sourceEpisodeIdStr}
            onChange={(e) => setSourceEpisodeIdStr(e.target.value)}
            placeholder="e.g. 42"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
      )}

      <Field label="Summary" hint={isEdit ? "編集すると embedding が null にクリアされる (recall は recency fallback)" : "Narrative. Required."}>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          placeholder="What happened, in narrative form…"
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
          <TagInput value={tags} onChange={setTags} placeholder="e.g. trade, sol" />
        </Field>
      </div>

      <Field label="Theme">
        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Intentional goal">
        <input
          type="text"
          value={intentionalGoal}
          onChange={(e) => setIntentionalGoal(e.target.value)}
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
          disabled={busy || !summary.trim()}
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
