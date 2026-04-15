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

type Spatial =
  | "perceiving"
  | "streaming"
  | "batchchat"
  | "video-creating"
  | "offline"
  | "strategy";

interface SystemEvent {
  id: number;
  timestamp: string;
  category: string;
  event_type: string;
  summary: string;
  data: Record<string, unknown>;
  initial_salience: number;
  refined_salience: number | null;
  attention_salience: number | null;
  action_id: string | null;
  subject_key: string | null;
  processed: boolean;
}

interface LinkedSituation {
  id: number;
  depth: number;
  spatial: Spatial;
  thread_id: string | null;
  subject_key: string | null;
  status: "active" | "resolved";
  theme: string | null;
  started_at: string;
  last_event_at: string;
  resolved_at: string | null;
}

type SpatialFilter = "all" | Spatial;
type ProcessedFilter = "all" | "true" | "false";

const CATEGORY_COLOR: Record<string, string> = {
  cognition: "text-accent bg-accent-muted",
  social: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  stream: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
  trade: "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
  market: "text-[color:var(--color-danger)] bg-[color:var(--color-danger)]/10",
  direct_chat: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  batch_chat: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  news: "text-text-soft bg-panel-2",
  system: "text-text-faint bg-panel-2",
};

function categoryBadge(cat: string): string {
  return CATEGORY_COLOR[cat] ?? "text-text-soft bg-panel-2";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function EventsPage() {
  const [rows, setRows] = useState<SystemEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [spatialFilter, setSpatialFilter] = useState<SpatialFilter>("all");
  const [processedFilter, setProcessedFilter] = useState<ProcessedFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    if (spatialFilter !== "all") qs.set("spatial", spatialFilter);
    if (processedFilter !== "all") qs.set("processed", processedFilter);
    if (categoryFilter.trim()) qs.set("category", categoryFilter.trim());
    if (eventTypeFilter.trim()) qs.set("event_type", eventTypeFilter.trim());
    if (subjectFilter.trim()) qs.set("subject_key", subjectFilter.trim());
    try {
      const data = await apiFetch<{ events: SystemEvent[]; total: number }>(
        `/memory/events?${qs}`,
      );
      setRows(data.events);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, spatialFilter, processedFilter, categoryFilter, eventTypeFilter, subjectFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, spatialFilter, processedFilter, categoryFilter, eventTypeFilter, subjectFilter]);

  const openDetail = async (e: SystemEvent) => {
    // fetch detail (linked situations)
    let linkedSituations: LinkedSituation[] = [];
    try {
      const data = await apiFetch<{ event: SystemEvent; linkedSituations: LinkedSituation[] }>(
        `/memory/events/${e.id}`,
      );
      linkedSituations = data.linkedSituations;
    } catch { /* ignore */ }

    modal.open({
      title: `Event #${e.id}`,
      size: "lg",
      content: <EventDetail event={e} linkedSituations={linkedSituations} />,
    });
  };

  const columns: AdminColumn<SystemEvent>[] = [
    {
      key: "id", label: "ID", width: "w-16", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.id,
    },
    {
      key: "category", label: "Category", width: "w-24", sortable: true,
      render: (e) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${categoryBadge(e.category)}`}
        >
          {e.category}
        </span>
      ),
    },
    {
      key: "event_type", label: "Type", width: "w-40", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (e) => e.event_type,
    },
    {
      key: "subject_key", label: "Subject", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (e) => e.subject_key ?? "—",
    },
    {
      key: "summary", label: "Summary", sortable: false,
      cellClass: "max-w-md",
      render: (e) => <div className="line-clamp-2 text-text">{e.summary}</div>,
    },
    {
      key: "initial_salience", label: "Sal", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.initial_salience.toFixed(2),
    },
    {
      key: "processed", label: "Proc", width: "w-12", sortable: false,
      cellClass: "text-center",
      render: (e) =>
        e.processed ? (
          <span className="text-text-faint" title="Processed">●</span>
        ) : (
          <span className="text-[color:var(--color-warning)]" title="Unprocessed">○</span>
        ),
    },
    {
      key: "timestamp", label: "Timestamp", width: "w-36", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (e) => fmtTime(e.timestamp),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-xs text-text-muted mt-0.5">
            system_events — 全 memory 層の substrate (read-only)
          </p>
        </div>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={spatialFilter}
          onChange={(v) => setSpatialFilter(v as SpatialFilter)}
          options={[
            { value: "all", label: "All spatials" },
            { value: "perceiving", label: "Perceive" },
            { value: "streaming", label: "Stream" },
            { value: "batchchat", label: "Batch" },
            { value: "video-creating", label: "Video" },
            { value: "strategy", label: "Strategy" },
            { value: "offline", label: "Offline" },
          ]}
        />
        <SegmentedControl
          value={processedFilter}
          onChange={(v) => setProcessedFilter(v as ProcessedFilter)}
          options={[
            { value: "all", label: "Any" },
            { value: "false", label: "Unprocessed" },
            { value: "true", label: "Processed" },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 shrink-0">
        <Field label="Category (exact)">
          <input
            type="text"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="e.g. social / trade / cognition"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Event type (exact)">
          <input
            type="text"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            placeholder="e.g. twitter_reply"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Subject key (exact)">
          <input
            type="text"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="e.g. person:123"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent font-mono"
          />
        </Field>
      </div>

      <AdminTable<SystemEvent>
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No events"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "initial_salience", "attention_salience", "timestamp"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openDetail}
      />
    </div>
  );
}

// ── Modal content: event detail ──

function EventDetail({
  event,
  linkedSituations,
}: {
  event: SystemEvent;
  linkedSituations: LinkedSituation[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
        <KV label="Category" value={event.category} />
        <KV label="Event type" value={event.event_type} />
        <KV label="Subject key" value={event.subject_key ?? "—"} />
        <KV label="Action id" value={event.action_id ?? "—"} />
        <KV label="Initial salience" value={event.initial_salience.toFixed(3)} />
        <KV
          label="Refined salience"
          value={event.refined_salience != null ? event.refined_salience.toFixed(3) : "—"}
        />
        <KV
          label="Attention salience"
          value={event.attention_salience != null ? event.attention_salience.toFixed(3) : "—"}
        />
        <KV label="Processed" value={event.processed ? "true" : "false"} />
        <KV label="Timestamp" value={fmtFullDate(event.timestamp)} />
      </div>

      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
          Summary
        </div>
        <div className="text-sm text-text">{event.summary}</div>
      </div>

      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
          Payload (data)
        </div>
        <pre className="text-xs text-text bg-panel-2 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      </div>

      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
          Linked situations ({linkedSituations.length})
        </div>
        {linkedSituations.length === 0 ? (
          <div className="text-xs text-text-faint">
            No situation links (either not yet bound, bound situation was deleted, or bind is still pending)
          </div>
        ) : (
          <div className="space-y-1">
            {linkedSituations.map((s) => (
              <div
                key={s.id}
                className="text-xs text-text-muted font-mono bg-panel-2 p-2 rounded-md break-all"
              >
                <span className="text-text">
                  #{s.id} L{s.depth} {s.spatial}
                </span>
                {s.thread_id && <span className="text-text-faint"> · thread:{s.thread_id}</span>}
                {s.subject_key && <span className="text-text-faint"> · {s.subject_key}</span>}
                <span className={s.status === "active" ? "text-accent" : "text-text-faint"}>
                  {" "}
                  · {s.status}
                </span>
                {s.theme && <span className="text-text-soft"> · {s.theme}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
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
