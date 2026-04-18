"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

type Kind = "mention" | "curated" | "follow" | "all";

interface TweetRow {
  kind: "mention" | "curated" | "follow";
  tweet_id: string;
  context: string | null;
  username: string | null;
  display_name: string | null;
  text: string;
  subtype: string | null;
  created_at: string;
  fetched_at: string | null;
}

interface CountsByKind { mention: number; curated: number; follow: number }

const PAGE_SIZE = 50;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function kindColor(k: TweetRow["kind"]): string {
  return k === "mention" ? "#22d3ee" : k === "curated" ? "#a855f7" : "#fbbf24";
}

export default function TweetsWorkerPage() {
  const [rows, setRows] = useState<TweetRow[]>([]);
  const [counts, setCounts] = useState<CountsByKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String((page - 1) * PAGE_SIZE));
    if (kind !== "all") qs.set("kind", kind);
    try {
      const d = await apiFetch<{ tweets: TweetRow[]; countsByKind: CountsByKind }>(`/worker/tweets?${qs}`);
      const sorted = [...d.tweets].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortKey];
        const vb = (b as unknown as Record<string, unknown>)[sortKey];
        const na = typeof va === "string" ? Date.parse(va) || 0 : Number(va ?? 0);
        const nb = typeof vb === "string" ? Date.parse(vb) || 0 : Number(vb ?? 0);
        return sortDir === "asc" ? na - nb : nb - na;
      });
      setRows(sorted);
      setCounts(d.countsByKind);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [kind]);

  const total = counts
    ? (kind === "all"
        ? counts.mention + counts.curated + counts.follow
        : counts[kind as keyof CountsByKind])
    : 0;

  const columns: AdminColumn<TweetRow>[] = [
    { key: "kind", label: "Kind", width: "w-20",
      render: (t) => (
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
          style={{ color: kindColor(t.kind), background: `${kindColor(t.kind)}22`, border: `1px solid ${kindColor(t.kind)}44` }}
        >
          {t.kind}
        </span>
      ) },
    { key: "username", label: "User", width: "w-32",
      render: (t) => (
        <div className="truncate">
          {t.username ? (
            <a
              href={`https://x.com/${t.username}`} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-accent hover:underline"
            >@{t.username}</a>
          ) : <span className="text-text-faint">—</span>}
          {t.display_name && <div className="text-[10px] text-text-faint truncate">{t.display_name}</div>}
        </div>
      ) },
    { key: "text", label: "Text",
      render: (t) => <div className="text-text line-clamp-2 max-w-2xl">{t.text}</div> },
    { key: "subtype", label: "Sub", width: "w-16",
      cellClass: "text-text-muted text-[10px] uppercase",
      render: (t) => t.subtype ?? "—" },
    { key: "created_at", label: "Created", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (t) => fmtTime(t.created_at) },
    { key: "link", label: "Link", width: "w-10",
      render: (t) => t.username ? (
        <a
          href={`https://x.com/${t.username}/status/${t.tweet_id}`}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-accent hover:underline"
        >↗</a>
      ) : <span className="text-text-faint">—</span> },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Tweets</h2>
        <p className="text-xs text-text-muted mt-0.5">
          mentions / curator / follows worker が集めたツイート統合ビュー
        </p>
      </header>

      <SegmentedControl
        value={kind}
        onChange={(v) => setKind(v as Kind)}
        options={[
          { value: "all",     label: counts ? `All (${counts.mention + counts.curated + counts.follow})` : "All" },
          { value: "mention", label: counts ? `Mentions (${counts.mention})` : "Mentions" },
          { value: "curated", label: counts ? `Curated (${counts.curated})` : "Curated" },
          { value: "follow",  label: counts ? `Follows (${counts.follow})`  : "Follows" },
        ]}
      />

      <AdminTable<TweetRow>
        columns={columns}
        rows={rows}
        rowKey={(t) => `${t.kind}:${t.tweet_id}`}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No tweets"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </div>
  );
}
