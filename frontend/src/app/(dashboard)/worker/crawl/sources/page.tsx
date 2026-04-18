"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { Field, Select, TagInput } from "@/components/ui";

interface Source {
  id: number; name: string; url: string; type: string;
  interval_minutes: number; enabled: boolean;
  keywords: string[]; last_crawled_at: string | null; created_at: string;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CrawlSourcesPage() {
  const [rows, setRows] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ sources: Source[] }>("/crawl/sources");
      const sorted = [...d.sources].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortKey];
        const vb = (b as unknown as Record<string, unknown>)[sortKey];
        const na = typeof va === "string" ? Date.parse(va) || va : Number(va ?? 0);
        const nb = typeof vb === "string" ? Date.parse(vb) || vb : Number(vb ?? 0);
        const an = typeof na === "number" ? na : String(na).localeCompare(String(nb));
        const bn = typeof nb === "number" ? nb : 0;
        return sortDir === "asc" ? (an as number) - bn : bn - (an as number);
      });
      setRows(sorted);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);

  const columns: AdminColumn<Source>[] = [
    { key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (s) => s.id },
    { key: "enabled", label: "On", width: "w-12", sortable: true,
      render: (s) => (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: s.enabled ? "#22d3ee" : "#475569",
            boxShadow: s.enabled ? "0 0 6px #22d3ee" : undefined,
          }}
        />
      ) },
    { key: "name", label: "Name", sortable: true,
      render: (s) => <span className="text-text">{s.name}</span> },
    { key: "url", label: "URL",
      render: (s) => (
        <a
          href={s.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline text-[11px]"
          title={s.url}
        >
          {hostname(s.url)} ↗
        </a>
      ) },
    { key: "type", label: "Type", width: "w-16",
      cellClass: "text-text-muted text-[11px] uppercase",
      render: (s) => s.type },
    { key: "interval_minutes", label: "Interval", width: "w-20", sortable: true,
      cellClass: "text-text-muted tabular-nums text-[11px]",
      render: (s) => `${s.interval_minutes} m` },
    { key: "keywords", label: "Keywords", width: "w-48",
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {(s.keywords ?? []).slice(0, 4).map((k, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-text-muted bg-panel/40">
              {k}
            </span>
          ))}
          {(s.keywords?.length ?? 0) > 4 && (
            <span className="text-[10px] text-text-faint">+{s.keywords.length - 4}</span>
          )}
        </div>
      ) },
    { key: "last_crawled_at", label: "Last crawl", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (s) => fmtTime(s.last_crawled_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Crawl sources</h2>
          <p className="text-xs text-text-muted mt-0.5"><code>crawl_sources</code></p>
        </div>
        <button
          onClick={() => openEdit(null, load)}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition"
        >
          + New source
        </button>
      </header>

      <AdminTable<Source>
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No sources"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "last_crawled_at", "interval_minutes"]}
        onRowClick={(s) => openEdit(s, load)}
      />
    </div>
  );
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function openEdit(source: Source | null, reload: () => void) {
  modal.open({
    title: source ? `Source #${source.id}` : "New source",
    size: "md",
    content: <SourceForm initial={source} onSaved={() => { modal.close(); reload(); }} onDeleted={() => { modal.close(); reload(); }} />,
  });
}

function SourceForm({
  initial, onSaved, onDeleted,
}: {
  initial: Source | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [type, setType] = useState(initial?.type ?? "rss");
  const [interval, setInterval] = useState<number>(initial?.interval_minutes ?? 60);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = { name, url, type, interval_minutes: interval, enabled, keywords };
      if (initial) {
        await apiFetch(`/crawl/sources/${initial.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/crawl/sources", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Source #${initial.id} "${initial.name}" を削除しますか？ 紐づく記事も CASCADE で消えます。`)) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/crawl/sources/${initial.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <Field label="Name">
        <input
          className="w-full bg-panel-2 border border-white/10 rounded px-2 py-1.5 text-sm"
          value={name} onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="URL">
        <input
          className="w-full bg-panel-2 border border-white/10 rounded px-2 py-1.5 text-sm font-mono text-xs"
          value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select
            value={type} onChange={setType}
            options={[
              { value: "rss", label: "RSS" },
              { value: "html", label: "HTML" },
              { value: "api", label: "API" },
            ]}
          />
        </Field>
        <Field label="Interval (min)">
          <input
            type="number" min={5} max={1440}
            className="w-full bg-panel-2 border border-white/10 rounded px-2 py-1.5 text-sm tabular-nums"
            value={interval} onChange={(e) => setInterval(parseInt(e.target.value, 10) || 60)}
          />
        </Field>
      </div>
      <Field label="Keywords">
        <TagInput value={keywords} onChange={setKeywords} placeholder="add keyword…" />
      </Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          onClick={save} disabled={saving || !name || !url}
          className="px-3 py-1.5 bg-accent text-bg rounded-md text-sm font-medium hover:bg-accent-hover transition disabled:opacity-40"
        >
          {saving ? "..." : initial ? "Save" : "Create"}
        </button>
        {initial && (
          <button
            onClick={remove} disabled={saving}
            className="ml-auto px-3 py-1.5 text-sm rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
