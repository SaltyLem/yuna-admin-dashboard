"use client";

import { useCallback, useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";

interface EngagementRow {
  post_id: number;
  platform: string;
  platform_video_id: string | null;
  title: string | null;
  topic: string | null;
  language: string | null;
  video_type: string | null;
  posted_at: string | null;
  uploaded_at: string | null;
  short_url: string | null;
  full_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  measured_at: string | null;
  snapshot_count: number;
}

interface Monthly {
  views: number; likes: number; comments: number; shares: number; snapshots: number;
}

interface Snapshot {
  id: number; views: number; likes: number; comments: number; shares: number;
  top_comments: unknown; measured_at: string;
}

const PAGE_SIZE = 50;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function EngagementWorkerPage() {
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("post_id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE_SIZE));
    qs.set("offset", String((page - 1) * PAGE_SIZE));
    try {
      const d = await apiFetch<{ rows: EngagementRow[]; total: number; monthly: Monthly }>(`/worker/engagement?${qs}`);
      const sorted = [...d.rows].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sortKey];
        const vb = (b as unknown as Record<string, unknown>)[sortKey];
        const na = typeof va === "string" ? Date.parse(va) || 0 : Number(va ?? 0);
        const nb = typeof vb === "string" ? Date.parse(vb) || 0 : Number(vb ?? 0);
        return sortDir === "asc" ? na - nb : nb - na;
      });
      setRows(sorted);
      setTotal(d.total);
      setMonthly(d.monthly);
    } catch {
      setRows([]); setTotal(0); setMonthly(null);
    } finally {
      setLoading(false);
    }
  }, [page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);

  const columns: AdminColumn<EngagementRow>[] = [
    { key: "post_id", label: "ID", width: "w-12", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (r) => r.post_id },
    { key: "platform", label: "Plat", width: "w-16",
      cellClass: "text-text-muted text-[11px] uppercase",
      render: (r) => r.platform },
    { key: "language", label: "Lang", width: "w-12",
      cellClass: "text-text-muted text-[11px]",
      render: (r) => r.language ?? "—" },
    { key: "title", label: "Title / topic",
      render: (r) => (
        <div className="truncate max-w-lg">
          <div className="text-text">{r.title ?? r.topic ?? "—"}</div>
          {r.video_type && <div className="text-[10px] text-text-faint">{r.video_type}</div>}
        </div>
      ) },
    { key: "views", label: "Views", width: "w-16", sortable: true,
      cellClass: "text-right tabular-nums font-semibold",
      render: (r) => <span style={{ color: "#22d3ee" }}>{fmtCount(r.views)}</span> },
    { key: "likes", label: "Likes", width: "w-16", sortable: true,
      cellClass: "text-right tabular-nums",
      render: (r) => <span style={{ color: "#f472b6" }}>{fmtCount(r.likes)}</span> },
    { key: "comments", label: "Cmts", width: "w-16", sortable: true,
      cellClass: "text-right tabular-nums text-text-muted",
      render: (r) => fmtCount(r.comments) },
    { key: "shares", label: "Shares", width: "w-16", sortable: true,
      cellClass: "text-right tabular-nums text-text-muted",
      render: (r) => fmtCount(r.shares) },
    { key: "snapshot_count", label: "Snaps", width: "w-14", sortable: true,
      cellClass: "text-text-faint tabular-nums text-right",
      render: (r) => r.snapshot_count },
    { key: "measured_at", label: "Measured", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (r) => fmtTime(r.measured_at) },
    { key: "posted_at", label: "Posted", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (r) => fmtTime(r.posted_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Video engagement</h2>
        <p className="text-xs text-text-muted mt-0.5">
          engagement worker が 30分→6h→24h 刻みで更新する YouTube/TikTok 統計の最新値
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <Kpi label="30d Views"    value={fmtCount(monthly?.views ?? null)}    color="#22d3ee" />
        <Kpi label="30d Likes"    value={fmtCount(monthly?.likes ?? null)}    color="#f472b6" />
        <Kpi label="30d Comments" value={fmtCount(monthly?.comments ?? null)} color="#fbbf24" />
        <Kpi label="30d Shares"   value={fmtCount(monthly?.shares ?? null)}   color="#a855f7" />
        <Kpi label="Snapshots"    value={monthly?.snapshots ?? 0}             color="#38bdf8" />
      </div>

      <AdminTable<EngagementRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.post_id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No videos"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["post_id", "views", "likes", "comments", "shares", "snapshot_count", "measured_at", "posted_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={(r) => openDetail(r.post_id)}
      />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function openDetail(postId: number) {
  modal.open({
    title: `Post #${postId}`,
    size: "lg",
    content: <EngagementDetail postId={postId} />,
  });
}

function EngagementDetail({ postId }: { postId: number }) {
  const [data, setData] = useState<{ post: EngagementRow; snapshots: Snapshot[] } | null>(null);

  useEffect(() => {
    apiFetch<{ post: EngagementRow; snapshots: Snapshot[] }>(`/worker/engagement/${postId}`)
      .then(setData)
      .catch(() => setData(null));
  }, [postId]);

  if (!data) return <div className="p-4 text-text-muted">Loading…</div>;
  const { post, snapshots } = data;
  const series = snapshots.map(s => ({ t: Date.parse(s.measured_at), views: s.views, likes: s.likes, comments: s.comments, shares: s.shares }));

  return (
    <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
      <div className="text-[11px] text-text-muted">{post.platform} · {post.language} · {post.video_type ?? "—"}</div>
      <h3 className="text-lg font-semibold">{post.title ?? post.topic ?? "—"}</h3>

      <div className="flex items-center gap-3 text-xs">
        {post.short_url && <a href={post.short_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">short ↗</a>}
        {post.full_url && <a href={post.full_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">full ↗</a>}
        <span className="ml-auto text-text-faint tabular-nums">{snapshots.length} snapshots</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Trend label="Views"    color="#22d3ee" series={series} keyName="views" />
        <Trend label="Likes"    color="#f472b6" series={series} keyName="likes" />
        <Trend label="Comments" color="#fbbf24" series={series} keyName="comments" />
        <Trend label="Shares"   color="#a855f7" series={series} keyName="shares" />
      </div>

      {snapshots.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint mb-2">Snapshots</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-faint text-[10px] uppercase tracking-wider">
                <th className="text-left py-1">Measured</th>
                <th className="text-right">Views</th>
                <th className="text-right">Likes</th>
                <th className="text-right">Cmts</th>
                <th className="text-right">Sh</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map(s => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="py-1 text-text-muted tabular-nums">{fmtTime(s.measured_at)}</td>
                  <td className="text-right tabular-nums">{fmtCount(s.views)}</td>
                  <td className="text-right tabular-nums">{fmtCount(s.likes)}</td>
                  <td className="text-right tabular-nums">{fmtCount(s.comments)}</td>
                  <td className="text-right tabular-nums">{fmtCount(s.shares)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Trend({
  label, color, series, keyName,
}: {
  label: string; color: string;
  series: Array<{ t: number; views: number; likes: number; comments: number; shares: number }>;
  keyName: "views" | "likes" | "comments" | "shares";
}) {
  const latest = series.length ? series[series.length - 1]![keyName] : 0;
  const gid = `tr-${keyName}`;
  return (
    <div
      className="rounded-lg border p-2"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>{fmtCount(latest)}</div>
      <div className="h-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey={keyName} stroke={color} strokeWidth={1.2} fill={`url(#${gid})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
