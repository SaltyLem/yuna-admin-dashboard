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

type Tab = "episodes" | "semantic-facts";

const PAGE_SIZE = 50;

interface EpisodeV2 {
  id: number;
  subject_key: string | null;
  summary: string | null;
  event_count: number;
  created_at: string;
}

interface SemanticFact {
  id: number;
  fact_type: "person_fact" | "domain_fact" | "self_fact" | "procedural_fact";
  subject: string | null;
  predicate: string | null;
  object: string | null;
  content: string;
  confidence: number;
  source: string | null;
  person_id: string | null;
  domain: string | null;
  subject_key: string | null;
  retrieval_count: number;
  last_retrieved_at: string | null;
  created_at: string;
  updated_at: string;
  forgotten_at: string | null;
  superseded_by: number | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits);
}

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("episodes");

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Memory</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Yuna の記憶テーブル (v2)
          </p>
        </div>
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "episodes", label: "Episodes" },
            { value: "semantic-facts", label: "Semantic facts" },
          ]}
        />
      </header>

      {tab === "episodes" && <EpisodesView />}
      {tab === "semantic-facts" && <SemanticFactsView />}
    </div>
  );
}

// ───────── Episodes (v2) ─────────

function EpisodesView() {
  const [rows, setRows] = useState<EpisodeV2[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sortKey,
      order: sortDir,
    });
    try {
      const data = await apiFetch<{ episodes: EpisodeV2[]; total: number }>(
        `/memory/episodes?${qs}`,
      );
      setRows(data.episodes);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir]);

  const columns: AdminColumn<EpisodeV2>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (e) => e.id,
    },
    {
      key: "subject_key", label: "Subject", width: "w-32", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (e) => e.subject_key ?? "—",
    },
    {
      key: "summary", label: "Summary", sortable: false,
      cellClass: "max-w-md",
      render: (e) => <div className="line-clamp-2 text-text">{e.summary ?? "—"}</div>,
    },
    {
      key: "event_count", label: "Events", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (e) => e.event_count,
    },
    {
      key: "created_at", label: "Created", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (e) => fmtDate(e.created_at),
    },
  ];

  return (
    <AdminTable<EpisodeV2>
      columns={columns}
      rows={rows}
      rowKey={(e) => e.id}
      loading={loading}
      emptyLabel={loading ? "Loading…" : "No episodes"}
      sort={{ key: sortKey, dir: sortDir }}
      onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
      sortDescDefaults={["id", "event_count", "created_at"]}
      pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
    />
  );
}

// ───────── Semantic facts ─────────

const FACT_TYPE_COLOR: Record<SemanticFact["fact_type"], string> = {
  person_fact: "text-accent bg-accent-muted",
  domain_fact: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
  self_fact: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  procedural_fact: "text-text-soft bg-panel-2",
};

function SemanticFactsView() {
  const [rows, setRows] = useState<SemanticFact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<"all" | SemanticFact["fact_type"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: sortKey,
      order: sortDir,
    });
    if (typeFilter !== "all") qs.set("fact_type", typeFilter);
    try {
      const data = await apiFetch<{ facts: SemanticFact[]; total: number }>(
        `/memory/semantic-facts?${qs}`,
      );
      setRows(data.facts);
      setTotal(data.total);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, sortKey, sortDir, typeFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sortKey, sortDir, typeFilter]);

  const del = async (id: number) => {
    try {
      await apiFetch(`/memory/semantic-facts/${id}`, { method: "DELETE" });
      void load();
    } catch { /* toast */ }
  };

  const columns: AdminColumn<SemanticFact>[] = [
    {
      key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (f) => f.id,
    },
    {
      key: "fact_type", label: "Type", width: "w-28", sortable: true,
      render: (f) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${FACT_TYPE_COLOR[f.fact_type]}`}
        >
          {f.fact_type.replace("_fact", "")}
        </span>
      ),
    },
    {
      key: "subject", label: "Subject", width: "w-28", sortable: true,
      cellClass: "text-text-soft text-xs font-mono",
      render: (f) => f.subject ?? "—",
    },
    {
      key: "predicate", label: "Predicate", width: "w-28", sortable: false,
      cellClass: "text-text-muted text-xs font-mono",
      render: (f) => f.predicate ?? "—",
    },
    {
      key: "object", label: "Object", width: "w-28", sortable: false,
      cellClass: "text-text-muted text-xs font-mono",
      render: (f) => f.object ?? "—",
    },
    {
      key: "content", label: "Content", sortable: false,
      cellClass: "max-w-md",
      render: (f) => <div className="line-clamp-2 text-text">{f.content}</div>,
    },
    {
      key: "confidence", label: "Conf", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (f) => fmtNum(f.confidence),
    },
    {
      key: "retrieval_count", label: "Uses", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (f) => f.retrieval_count,
    },
    {
      key: "domain", label: "Domain", width: "w-20", sortable: true,
      cellClass: "text-text-muted text-xs",
      render: (f) => f.domain ?? "—",
    },
    {
      key: "created_at", label: "Created", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (f) => fmtDate(f.created_at),
    },
  ];

  const openDetail = (f: SemanticFact) => {
    modal.open({
      title: `Fact #${f.id}`,
      size: "lg",
      content: (
        <SemanticFactDetail
          fact={f}
          onDelete={() => { modal.close(); void del(f.id); }}
        />
      ),
    });
  };

  return (
    <>
      <FilterBar>
        <SegmentedControl
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "person_fact", label: "Person" },
            { value: "domain_fact", label: "Domain" },
            { value: "self_fact", label: "Self" },
            { value: "procedural_fact", label: "Procedural" },
          ]}
        />
      </FilterBar>
      <AdminTable<SemanticFact>
        columns={columns}
        rows={rows}
        rowKey={(f) => f.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No facts"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "confidence", "retrieval_count", "created_at", "last_retrieved_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openDetail}
      />
    </>
  );
}

function SemanticFactDetail({
  fact,
  onDelete,
}: {
  fact: SemanticFact;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${FACT_TYPE_COLOR[fact.fact_type]}`}
        >
          {fact.fact_type}
        </span>
        {fact.domain && (
          <span className="text-[11px] text-text-muted">{fact.domain}</span>
        )}
      </div>
      <KV label="Content" value={fact.content} multiline />
      {(fact.subject || fact.predicate || fact.object) && (
        <div className="grid grid-cols-3 gap-3">
          <KV label="Subject" value={fact.subject ?? "—"} />
          <KV label="Predicate" value={fact.predicate ?? "—"} />
          <KV label="Object" value={fact.object ?? "—"} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <KV label="Confidence" value={fmtNum(fact.confidence)} />
        <KV label="Retrievals" value={String(fact.retrieval_count)} />
        <KV label="Source" value={fact.source ?? "—"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KV label="Created" value={new Date(fact.created_at).toLocaleString()} />
        <KV label="Updated" value={new Date(fact.updated_at).toLocaleString()} />
      </div>
      {fact.forgotten_at && (
        <KV
          label="Forgotten"
          value={new Date(fact.forgotten_at).toLocaleString()}
        />
      )}
      <div className="flex items-center gap-3 pt-2 border-t border-border -mx-6 px-6 -mb-2 pb-4">
        <button
          onClick={onDelete}
          className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition"
        >
          Forget (soft delete)
        </button>
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

// ───────── Shared small bits ─────────

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-sm text-text ${multiline ? "whitespace-pre-wrap break-words" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
