"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getToken } from "@/components/use-api";
import { modal } from "@/components/modal";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

interface Post {
  id: number; session_id: number;
  platform: string; video_type: string | null; hook_type: string | null;
  topic: string | null; language: string | null;
  title: string | null; description: string | null; hashtags: string[] | null;
  short_url: string | null; full_url: string | null; meta_url: string | null;
  video_url: string | null; platform_video_id: string | null;
  posted_at: string | null; uploaded_at: string | null; created_at: string;
}

type LangFilter = "all" | "ja" | "en";
const PAGE_SIZE = 50;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function VideoPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [language, setLanguage] = useState<LangFilter>("all");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (language !== "all") qs.set("language", language);
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    try {
      const d = await apiFetch<{ posts: Post[]; total: number }>(`/video/posts?${qs}`);
      setPosts(d.posts);
      setTotal(d.total);
    } catch {
      setPosts([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [language, page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [language, sortKey, sortDir]);

  const columns: AdminColumn<Post>[] = [
    { key: "id", label: "ID", width: "w-12", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (p) => p.id },
    { key: "session_id", label: "Ses", width: "w-12", sortable: true,
      cellClass: "text-text-muted font-mono tabular-nums",
      render: (p) => p.session_id },
    { key: "language", label: "Lang", width: "w-12", sortable: true,
      cellClass: "text-text-muted text-[11px]",
      render: (p) => p.language ?? "—" },
    { key: "video_type", label: "Type", width: "w-20", sortable: true,
      cellClass: "text-text-muted text-[11px]",
      render: (p) => p.video_type ?? "—" },
    { key: "title", label: "Title / topic",
      render: (p) => (
        <div className="truncate max-w-md">
          <div className="text-text">{p.title ?? p.topic ?? "—"}</div>
          {p.hook_type && <div className="text-[10px] text-text-faint">{p.hook_type}</div>}
        </div>
      ) },
    { key: "links", label: "Links", width: "w-32", sortable: false,
      render: (p) => (
        <div className="flex items-center gap-2 text-[11px]">
          {p.short_url && <a href={p.short_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>short</a>}
          {p.full_url && <a href={p.full_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>full</a>}
          {p.platform_video_id && <span className="text-text-muted font-mono">{p.platform}</span>}
        </div>
      ) },
    { key: "posted_at", label: "Posted", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (p) => fmtTime(p.posted_at) },
    { key: "created_at", label: "Created", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (p) => fmtTime(p.created_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Video posts</h2>
        <p className="text-xs text-text-muted mt-0.5"><code>video_posts</code></p>
      </header>

      <SegmentedControl
        value={language}
        onChange={(v) => setLanguage(v as LangFilter)}
        options={[
          { value: "all", label: "All" },
          { value: "ja", label: "JA" },
          { value: "en", label: "EN" },
        ]}
      />

      <AdminTable<Post>
        columns={columns}
        rows={posts}
        rowKey={(p) => p.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No posts"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "session_id", "posted_at", "created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={openPreview}
      />
    </div>
  );
}

function openPreview(p: Post) {
  modal.open({
    title: `Post #${p.id} — ${p.title ?? p.topic ?? "video"}`,
    size: "lg",
    content: <PostPreview post={p} />,
  });
}

function PostPreview({ post }: { post: Post }) {
  const token = getToken();
  const apiBase = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "";
  const [buildId, setBuildId] = useState<string | null>(null);

  useEffect(() => {
    // Try to resolve the build_id from the session to serve the local mp4.
    apiFetch<{ session: { build_id: string | null } }>(`/video/sessions/${post.session_id}`)
      .then(d => setBuildId(d.session.build_id))
      .catch(() => setBuildId(null));
  }, [post.session_id]);

  const localUrl = buildId && token
    ? `${apiBase}/video/file/videos/${buildId}.mp4?token=${encodeURIComponent(token)}`
    : null;

  return (
    <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
      <div className="text-xs text-text-muted">
        {post.language} · {post.video_type ?? "—"} · {post.hook_type ?? "—"} · session #{post.session_id}
      </div>

      {post.short_url ? (
        <video src={post.short_url} controls className="w-full max-h-[60vh] rounded bg-black" />
      ) : post.full_url ? (
        <video src={post.full_url} controls className="w-full max-h-[60vh] rounded bg-black" />
      ) : localUrl ? (
        <video src={localUrl} controls className="w-full max-h-[60vh] rounded bg-black" />
      ) : (
        <div className="text-text-faint text-xs">No video available (no R2 URL, no local build_id)</div>
      )}

      {post.description && <div className="text-xs text-text-muted whitespace-pre-wrap">{post.description}</div>}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="text-xs text-accent">{post.hashtags.join(" ")}</div>
      )}
      <div className="flex items-center gap-3 text-xs">
        {post.short_url && <a href={post.short_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">short url</a>}
        {post.full_url && <a href={post.full_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">full url</a>}
        {post.meta_url && <a href={post.meta_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">meta</a>}
      </div>
    </div>
  );
}
