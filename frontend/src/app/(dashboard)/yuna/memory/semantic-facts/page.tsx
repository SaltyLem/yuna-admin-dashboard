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

type FactType = "person_fact" | "domain_fact" | "self_fact" | "procedural_fact";

interface SemanticFact {
  id: number;
  fact_type: FactType;
  subject: string | null;
  predicate: string | null;
  object: string | null;
  content: string;
  confidence: number;
  source: string | null;
  person_id: string | null;
  domain: string | null;
  subject_key: string | null;
  has_embedding: boolean;
  retrieval_count: number;
  last_retrieved_at: string | null;
  created_at: string;
  updated_at: string;
  forgotten_at: string | null;
  superseded_by: number | null;
}

type TypeFilter = "all" | FactType;

const FACT_TYPE_COLOR: Record<FactType, string> = {
  person_fact: "text-accent bg-accent-muted",
  domain_fact: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
  self_fact: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
  procedural_fact: "text-text-soft bg-panel-2",
};

const FACT_TYPE_SHORT: Record<FactType, string> = {
  person_fact: "person",
  domain_fact: "domain",
  self_fact: "self",
  procedural_fact: "procedural",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function SemanticFactsPage() {
  const [rows, setRows] = useState<SemanticFact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

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

  const openCreate = () => {
    modal.open({
      title: "New semantic fact",
      size: "lg",
      content: (
        <FactForm
          initialType={typeFilter === "all" ? "self_fact" : typeFilter}
          onSaved={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const openEdit = (f: SemanticFact) => {
    modal.open({
      title: `Fact #${f.id}`,
      size: "lg",
      content: (
        <FactForm
          initial={f}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
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
          {FACT_TYPE_SHORT[f.fact_type]}
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
      render: (f) => f.confidence.toFixed(2),
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
      key: "has_embedding", label: "Emb", width: "w-12", sortable: false,
      cellClass: "text-text-faint text-center",
      render: (f) =>
        f.has_embedding ? (
          <span title="Has embedding">●</span>
        ) : (
          <span className="text-[color:var(--color-warning)]" title="No embedding">○</span>
        ),
    },
    {
      key: "created_at", label: "Created", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums",
      render: (f) => fmtDate(f.created_at),
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Semantic facts</h2>
          <p className="text-xs text-text-muted mt-0.5">
            semantic_facts — 意味軸 (person / domain / self / procedural)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New fact
        </button>
      </header>

      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <SegmentedControl
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "person_fact", label: "Person" },
            { value: "domain_fact", label: "Domain" },
            { value: "self_fact", label: "Self" },
            { value: "procedural_fact", label: "Procedural" },
          ]}
        />
      </div>

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
        onRowClick={openEdit}
      />
    </div>
  );
}

// ── Modal content: fact form ──

interface FactFormProps {
  initial?: SemanticFact;
  initialType?: FactType;
  onSaved: () => void;
  onDeleted?: () => void;
}

function FactForm({ initial, initialType, onSaved, onDeleted }: FactFormProps) {
  const isEdit = !!initial;
  const [factType, setFactType] = useState<FactType>(
    initial?.fact_type ?? initialType ?? "self_fact",
  );
  const [content, setContent] = useState(initial?.content ?? "");
  const [confidence, setConfidence] = useState(
    initial?.confidence != null ? initial.confidence : 0.5,
  );
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [predicate, setPredicate] = useState(initial?.predicate ?? "");
  const [object, setObject] = useState(initial?.object ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [personId, setPersonId] = useState(initial?.person_id ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [subjectKey, setSubjectKey] = useState(initial?.subject_key ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const commonPayload = {
        content: content.trim(),
        confidence,
        subject: subject.trim() || null,
        predicate: predicate.trim() || null,
        object: object.trim() || null,
        source: source.trim() || null,
        person_id: personId.trim() || null,
        domain: domain.trim() || null,
        subject_key: subjectKey.trim() || null,
      };
      if (isEdit) {
        await apiFetch(`/memory/semantic-facts/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(commonPayload),
        });
      } else {
        await apiFetch(`/memory/semantic-facts`, {
          method: "POST",
          body: JSON.stringify({ fact_type: factType, ...commonPayload }),
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
      await apiFetch(`/memory/semantic-facts/${initial.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  };

  // fact_type ごとに補助 field のヒント
  const showPersonId = factType === "person_fact";
  const showDomain = factType === "domain_fact";

  return (
    <div className="space-y-4">
      {isEdit && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-md">
          <KV label="Fact type" value={initial.fact_type} />
          <KV
            label="Embedding"
            value={initial.has_embedding ? "present" : "null"}
          />
          <KV label="Retrievals" value={String(initial.retrieval_count)} />
          <KV label="Last retrieved" value={fmtFullDate(initial.last_retrieved_at)} />
          <KV label="Created" value={fmtFullDate(initial.created_at)} />
          <KV label="Updated" value={fmtFullDate(initial.updated_at)} />
          {initial.superseded_by != null && (
            <KV label="Superseded by" value={`#${initial.superseded_by}`} />
          )}
        </div>
      )}

      {!isEdit && (
        <Field label="Fact type">
          <Select
            value={factType}
            onChange={(v) => setFactType(v as FactType)}
            options={[
              { value: "person_fact", label: "Person fact" },
              { value: "domain_fact", label: "Domain fact" },
              { value: "self_fact", label: "Self fact" },
              { value: "procedural_fact", label: "Procedural fact" },
            ]}
          />
        </Field>
      )}

      <Field label="Content" hint={isEdit ? "編集で embedding が null にクリアされる" : "Required"}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="The fact itself, in natural language…"
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

      <div className="grid grid-cols-3 gap-3">
        <Field label="Subject">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Predicate">
          <input
            type="text"
            value={predicate}
            onChange={(e) => setPredicate(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Object">
          <input
            type="text"
            value={object}
            onChange={(e) => setObject(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {showPersonId && (
          <Field label="Person ID" hint="UUID (optional, for person_fact)">
            <input
              type="text"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-…"
              className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent font-mono"
            />
          </Field>
        )}
        {showDomain && (
          <Field label="Domain" hint="e.g. trading, crypto (for domain_fact)">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
            />
          </Field>
        )}
        <Field label="Subject key" hint="e.g. asset:SOL / person:123">
          <input
            type="text"
            value={subjectKey}
            onChange={(e) => setSubjectKey(e.target.value)}
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="Source">
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. manual, esk:123"
            className="w-full px-3 py-2 bg-panel-2 border border-border rounded-md text-sm placeholder:text-text-faint focus:outline-none focus:border-accent"
          />
        </Field>
      </div>

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
          disabled={busy || !content.trim()}
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
