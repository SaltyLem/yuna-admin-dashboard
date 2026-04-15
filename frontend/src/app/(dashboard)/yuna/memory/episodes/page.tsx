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

interface Episode {
  id: number;
  situation_id: number;
  parent_episode_id: number | null;
  depth: number;
  spatial: Spatial;
  thread_id: string | null;
  subject_key: string | null;
  causal_source: string | null;
  theme: string | null;
  intentional_goal: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  resolve_reason: string;
  peak_valence: number | null;
  peak_valence_at: string | null;
  end_valence: number | null;
  event_count: number;
  avg_salience: number | null;
  significance: number | null;
  consolidated_at: string | null;
  consolidated_into: number | null;
  forgotten_at: string | null;
  participants: string[] | null;
  primary_participant: string | null;
  created_at: string;
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

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h${rm}m` : `${h}h`;
}

/** episodes has no `summary` column — build one from the other fields. */
function buildEpisodeSummary(e: Episode): string {
  const focus = e.theme ?? e.subject_key ?? e.causal_source ?? "(no theme)";
  return `${focus} · ${fmtDuration(e.duration_seconds)} · ${e.event_count} events · ${e.resolve_reason}`;
}

export default function EpisodesPage() {
  const [rows, setRows] = useState<Episode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("started_at");
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
      const data = await apiFetch<{ episodes: Episode[]; total: number }>(
        `/memory/episodes?${qs}`,
      );
      setRows(data.episodes);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, spatialFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, spatialFilter]);

  const openCreate = () => {
    modal.open({
      title: "New episode",
      size: "lg",
      content: <EpisodeForm onSaved={() => { modal.close(); void load(); }} />,
    });
  };

  const openEdit = (e: Episode) => {
    modal.open({
      title: `Episode #${e.id}`,
      size: "lg",
      content: (
        <EpisodeForm
          initial={e}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const columns: AdminColumn<Episode>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.id,
    },
    {
      key: "depth", label: "L", width: "w-10", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.depth,
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
      key: "summary", label: "Synthesized summary", sortable: false,
      cellClass: "max-w-md",
      render: (e) => (
        <div className="line-clamp-2 text-text">{buildEpisodeSummary(e)}</div>
      ),
    },
    {
      key: "event_count", label: "Events", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.event_count,
    },
    {
      key: "duration_seconds", label: "Duration", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => fmtDuration(e.duration_seconds),
    },
    {
      key: "significance", label: "Sig", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.significance != null ? e.significance.toFixed(2) : "—",
    },
    {
      key: "started_at", label: "Started", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (e) => fmtDate(e.started_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Episodes</h2>
          <p className="text-xs text-text-muted mt-0.5">
            episodes — 閉じた situation の凍結スナップショット
            <span className="ml-2 text-text-faint">
              (narrative は event_specific_knowledge 側)
            </span>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New episode
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

      <AdminTable<Episode>
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No episodes"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "event_count", "duration_seconds", "significance", "started_at", "ended_at", "created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: episode form ──

interface EpisodeFormProps {
  initial?: Episode;
  onSaved: () => void;
  onDeleted?: () => void;
}

/** datetime-local input wants "YYYY-MM-DDTHH:mm" */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EpisodeForm({ initial, onSaved, onDeleted }: EpisodeFormProps) {
  const [situationIdStr, setSituationIdStr] = useState(
    initial?.situation_id != null ? String(initial.situation_id) : "",
  );
  const [startedAt, setStartedAt] = useState(toLocalInput(initial?.started_at ?? null));
  const [endedAt, setEndedAt] = useState(toLocalInput(initial?.ended_at ?? null));
  const [resolveReason, setResolveReason] = useState(initial?.resolve_reason ?? "manual");
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [intentionalGoal, setIntentionalGoal] = useState(initial?.intentional_goal ?? "");
  const [causalSource, setCausalSource] = useState(initial?.causal_source ?? "");
  const [busy, setBusy] = useState(false);

  const isEdit = !!initial;

  const save = async () => {
    setBusy(true);
    try {
      if (isEdit) {
        await apiFetch(`/memory/episodes/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            theme: theme.trim() || null,
            intentional_goal: intentionalGoal.trim() || null,
            causal_source: causalSource.trim() || null,
          }),
        });
      } else {
        const situationId = Number(situationIdStr.trim());
        if (!Number.isFinite(situationId)) { setBusy(false); return; }
        if (!startedAt || !endedAt) { setBusy(false); return; }
        if (!resolveReason.trim()) { setBusy(false); return; }
        await apiFetch(`/memory/episodes`, {
          method: "POST",
          body: JSON.stringify({
            situation_id: situationId,
            started_at: new Date(startedAt).toISOString(),
            ended_at: new Date(endedAt).toISOString(),
            resolve_reason: resolveReason.trim(),
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
      await apiFetch(`/memory/episodes/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Edit 時: 読み取り専用詳細 */}
      {isEdit && (
        <>
          <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
            <KV label="Situation" value={`#${initial.situation_id}`} />
            <KV label="Spatial" value={initial.spatial} />
            <KV label="Depth" value={String(initial.depth)} />
            <KV label="Subject key" value={initial.subject_key ?? "—"} />
            <KV label="Thread id" value={initial.thread_id ?? "—"} />
            <KV
              label="Parent ep"
              value={initial.parent_episode_id != null ? `#${initial.parent_episode_id}` : "—"}
            />
            <KV label="Events" value={String(initial.event_count)} />
            <KV
              label="Significance"
              value={initial.significance != null ? initial.significance.toFixed(3) : "—"}
            />
            <KV
              label="Peak valence"
              value={initial.peak_valence != null ? initial.peak_valence.toFixed(2) : "—"}
            />
            <KV
              label="End valence"
              value={initial.end_valence != null ? initial.end_valence.toFixed(2) : "—"}
            />
            <KV label="Started" value={fmtFullDate(initial.started_at)} />
            <KV label="Ended" value={fmtFullDate(initial.ended_at)} />
            <KV label="Duration" value={fmtDuration(initial.duration_seconds)} />
            <KV label="Resolve reason" value={initial.resolve_reason} />
            {initial.consolidated_at && (
              <KV
                label="Consolidated"
                value={`${fmtFullDate(initial.consolidated_at)} → ESK ${initial.consolidated_into ?? "?"}`}
              />
            )}
          </div>
          <div className="p-3 bg-panel-2 rounded-md">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Synthesized summary
            </div>
            <div className="text-sm text-text">{buildEpisodeSummary(initial)}</div>
          </div>
        </>
      )}

      {/* Create 時: 構造 field */}
      {!isEdit && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Situation ID" hint="Required. spatial/depth/subject_key はここから継承">
              <input
                type="number"
                value={situationIdStr}
                onChange={(e) => setSituationIdStr(e.target.value)}
                placeholder="e.g. 42"
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
              />
            </Field>
            <Field label="Resolve reason">
              <Select
                value={resolveReason}
                onChange={(v) => setResolveReason(v)}
                options={[
                  { value: "manual", label: "manual" },
                  { value: "temporal", label: "temporal" },
                  { value: "spatial", label: "spatial" },
                  { value: "participants", label: "participants" },
                  { value: "causal", label: "causal" },
                  { value: "intentional", label: "intentional" },
                  { value: "parent_cascade", label: "parent_cascade" },
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Started at">
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
              />
            </Field>
            <Field label="Ended at">
              <input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
                className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent"
              />
            </Field>
          </div>
        </>
      )}

      {/* 編集可能 field */}
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
          placeholder="What this episode was aiming at"
          className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label="Causal source">
        <input
          type="text"
          value={causalSource}
          onChange={(e) => setCausalSource(e.target.value)}
          placeholder="What triggered this episode"
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
