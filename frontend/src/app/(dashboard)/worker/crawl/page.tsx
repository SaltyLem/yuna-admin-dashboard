"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { Select } from "@/components/ui";

interface Article {
  id: number; source_id: number; source_name: string;
  url: string; title: string; summary: string | null;
  relevance: number | null;
  published_at: string | null; crawled_at: string;
}

interface ArticleDetail extends Article {
  content: string;
  sent_to_yuna?: boolean;
}

interface Source { id: number; name: string }

const PAGE_SIZE = 50;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CrawlArticlesPage() {
  const [rows, setRows] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sourceId, setSourceId] = useState<string>("");
  const [sortKey, setSortKey] = useState("crawled_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // sources for filter
  useEffect(() => {
    apiFetch<{ sources: Source[] }>("/crawl/sources")
      .then(d => setSources(d.sources))
      .catch(() => setSources([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String((page - 1) * PAGE_SIZE));
    if (sourceId) qs.set("source_id", sourceId);
    try {
      const d = await apiFetch<{ articles: Article[] }>(`/crawl/articles?${qs}`);
      let arts = d.articles;
      // upstream doesn't support sort params; sort client-side for the current page
      arts = [...arts].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortKey];
        const vb = (b as unknown as Record<string, unknown>)[sortKey];
        const na = typeof va === "string" ? Date.parse(va) || 0 : Number(va ?? 0);
        const nb = typeof vb === "string" ? Date.parse(vb) || 0 : Number(vb ?? 0);
        return sortDir === "asc" ? na - nb : nb - na;
      });
      setRows(arts);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, sourceId, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [sourceId]);

  const columns: AdminColumn<Article>[] = [
    { key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (a) => a.id },
    { key: "source_name", label: "Source", width: "w-32",
      cellClass: "text-text-muted text-[11px] truncate",
      render: (a) => a.source_name },
    { key: "title", label: "Title",
      render: (a) => (
        <div className="min-w-0 max-w-2xl">
          <div className="text-text line-clamp-1">{a.title}</div>
          {a.summary && <div className="text-[10px] text-text-faint line-clamp-1">{a.summary}</div>}
        </div>
      ) },
    { key: "url", label: "URL", width: "w-40",
      render: (a) => (
        <a
          href={a.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline text-[11px] truncate block max-w-[180px]"
          title={a.url}
        >
          {hostname(a.url)} ↗
        </a>
      ) },
    { key: "relevance", label: "Rel.", width: "w-14", sortable: true,
      cellClass: "text-text-muted tabular-nums text-right text-[11px]",
      render: (a) => a.relevance != null ? a.relevance.toFixed(2) : "—" },
    { key: "published_at", label: "Published", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (a) => fmtTime(a.published_at) },
    { key: "crawled_at", label: "Crawled", width: "w-24", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (a) => fmtTime(a.crawled_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Crawl articles</h2>
        <p className="text-xs text-text-muted mt-0.5"><code>crawl_articles</code></p>
      </header>

      <div className="flex items-center gap-3 shrink-0">
        <Select
          value={sourceId}
          onChange={(v) => setSourceId(v)}
          options={[
            { value: "", label: "All sources" },
            ...sources.map(s => ({ value: String(s.id), label: s.name })),
          ]}
        />
      </div>

      <AdminTable<Article>
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No articles"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "relevance", "published_at", "crawled_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total: rows.length === PAGE_SIZE ? page * PAGE_SIZE + 1 : (page - 1) * PAGE_SIZE + rows.length, onPageChange: setPage }}
        onRowClick={(a) => openDetail(a.id)}
      />
    </div>
  );
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function openDetail(id: number) {
  modal.open({
    title: `Article #${id}`,
    size: "lg",
    content: <ArticleDetailView id={id} />,
  });
}

function ArticleDetailView({ id }: { id: number }) {
  const [data, setData] = useState<ArticleDetail | null>(null);

  useEffect(() => {
    apiFetch<{ article: ArticleDetail }>(`/crawl/articles/${id}`)
      .then(d => setData(d.article))
      .catch(() => setData(null));
  }, [id]);

  if (!data) return <div className="p-4 text-text-muted">Loading…</div>;
  return (
    <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
      <div className="text-[11px] text-text-muted">
        {(data as ArticleDetail & { source_name?: string }).source_name ?? ""}
        {" · "}
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{data.url}</a>
      </div>
      <h3 className="text-lg font-semibold">{data.title}</h3>
      <div className="flex items-center gap-3 text-[11px] text-text-faint tabular-nums">
        <span>Published {fmtTime(data.published_at)}</span>
        <span>·</span>
        <span>Crawled {fmtTime(data.crawled_at)}</span>
        {data.relevance != null && <><span>·</span><span>Rel. {data.relevance.toFixed(3)}</span></>}
        {data.sent_to_yuna && <><span>·</span><span className="text-accent">sent</span></>}
      </div>
      {data.summary && (
        <div className="rounded border border-white/5 bg-panel/40 p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1">Summary</div>
          <div className="text-sm text-text whitespace-pre-wrap">{data.summary}</div>
        </div>
      )}
      <div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1">Content</div>
        <div className="text-xs text-text-muted whitespace-pre-wrap">{data.content}</div>
      </div>
    </div>
  );
}
