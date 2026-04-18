"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

interface Session {
  id: number;
  status: string;
  purpose: string | null;
  intent: string | null;
  language: string | null;
  direction: { topic?: string; title?: string; videoType?: string; hookType?: string } | null;
  build_id: string | null;
  total_cost: string;
  created_at: string;
  completed_at: string | null;
}

interface SessionDetail extends Session {
  scenario: unknown;
}

interface SessionStep {
  id: number; step: string; thinking: string | null;
  output: unknown; cost: string; created_at: string;
}

interface Post {
  id: number; platform: string; video_type: string | null; hook_type: string | null;
  topic: string | null; language: string | null;
  title: string | null; description: string | null; hashtags: string[] | null;
  short_url: string | null; full_url: string | null; meta_url: string | null;
  video_url: string | null; platform_video_id: string | null;
  posted_at: string | null; uploaded_at: string | null; created_at: string;
}

type StatusFilter = "all" | "running" | "completed" | "failed";
const PAGE_SIZE = 50;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function VideoSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    qs.set("page", String(page));
    qs.set("limit", String(PAGE_SIZE));
    qs.set("sort", sortKey);
    qs.set("order", sortDir);
    try {
      const d = await apiFetch<{ sessions: Session[]; total: number }>(`/video/sessions?${qs}`);
      setSessions(d.sessions);
      setTotal(d.total);
    } catch {
      setSessions([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, sortKey, sortDir]);

  const columns: AdminColumn<Session>[] = [
    { key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (s) => s.id },
    { key: "status", label: "Status", width: "w-24", sortable: true,
      render: (s) => <StatusBadge status={s.status} /> },
    { key: "language", label: "Lang", width: "w-12", sortable: true,
      cellClass: "text-text-muted text-[11px]",
      render: (s) => s.language ?? "—" },
    { key: "title", label: "Topic / title",
      render: (s) => (
        <div className="truncate max-w-md">
          <div className="text-text">{s.direction?.title ?? s.direction?.topic ?? "—"}</div>
          {s.direction?.videoType && (
            <div className="text-[10px] text-text-faint">{s.direction.videoType}{s.direction.hookType ? ` · ${s.direction.hookType}` : ""}</div>
          )}
        </div>
      ) },
    { key: "build_id", label: "Build", width: "w-24", sortable: false,
      cellClass: "text-text-faint font-mono text-[11px]",
      render: (s) => s.build_id?.slice(0, 8) ?? "—" },
    { key: "total_cost", label: "Cost", width: "w-16", sortable: true,
      cellClass: "text-text-muted tabular-nums text-right",
      render: (s) => `$${parseFloat(s.total_cost || "0").toFixed(3)}` },
    { key: "created_at", label: "Created", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (s) => fmtTime(s.created_at) },
    { key: "completed_at", label: "Completed", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (s) => fmtTime(s.completed_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Video sessions</h2>
        <p className="text-xs text-text-muted mt-0.5">
          <code>video_sessions</code> + <code>video_session_steps</code>
        </p>
      </header>

      <SegmentedControl
        value={status}
        onChange={(v) => setStatus(v as StatusFilter)}
        options={[
          { value: "all", label: "All" },
          { value: "running", label: "Running" },
          { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" },
        ]}
      />

      <AdminTable<Session>
        columns={columns}
        rows={sessions}
        rowKey={(s) => s.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No sessions"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "created_at", "completed_at", "total_cost"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        onRowClick={(s) => openSessionDetail(s.id, load)}
      />
    </div>
  );
}

function openSessionDetail(id: number, reload: () => void) {
  modal.open({
    title: `Session #${id}`,
    size: "lg",
    content: <SessionDetailView id={id} reload={reload} />,
  });
}

function SessionDetailView({ id, reload }: { id: number; reload: () => void }) {
  const [data, setData] = useState<{ session: SessionDetail; steps: SessionStep[]; posts: Post[] } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<{ session: SessionDetail; steps: SessionStep[]; posts: Post[] }>(`/video/sessions/${id}`)
      .then(setData)
      .catch(() => setData(null));
  }, [id]);

  async function retry() {
    if (!data?.session.scenario) { setMsg("No scenario on this session"); return; }
    if (!confirm(`Session #${id} をキューに再投入しますか？`)) return;
    setRetrying(true);
    try {
      await apiFetch<{ ok: boolean }>("/video/queue/push", {
        method: "POST",
        body: JSON.stringify({
          sessionId: id,
          scenario: data.session.scenario,
          language: data.session.language,
          direction: data.session.direction,
        }),
      });
      setMsg("re-enqueued");
      reload();
    } catch {
      setMsg("retry failed");
    } finally {
      setRetrying(false);
    }
  }

  if (!data) return <div className="p-4 text-text-muted">Loading…</div>;
  const { session, steps, posts } = data;

  return (
    <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center gap-3">
        <StatusBadge status={session.status} />
        <div className="text-text-muted text-xs">
          {session.language} · {session.direction?.videoType ?? "—"} · {session.direction?.hookType ?? "—"}
        </div>
        <div className="text-text-faint text-[11px] ml-auto tabular-nums">
          {fmtTime(session.created_at)} → {fmtTime(session.completed_at)}
        </div>
        <button
          onClick={retry}
          disabled={retrying || !session.scenario}
          className="px-2.5 py-1 text-xs rounded-md border border-white/10 text-text hover:border-white/30 disabled:opacity-40"
        >
          {retrying ? "..." : "Retry"}
        </button>
      </div>
      {msg && <div className="text-xs text-text-muted">{msg}</div>}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-text-faint">purpose: </span>{session.purpose ?? "—"}</div>
        <div><span className="text-text-faint">intent: </span>{session.intent ?? "—"}</div>
        <div><span className="text-text-faint">build: </span><code>{session.build_id ?? "—"}</code></div>
        <div><span className="text-text-faint">cost: </span>${parseFloat(session.total_cost || "0").toFixed(4)}</div>
      </div>

      <details open>
        <summary className="text-[11px] uppercase tracking-wider text-text-muted cursor-pointer">Direction</summary>
        <pre className="mt-2 p-2 rounded bg-panel-2 text-[11px] overflow-auto">{JSON.stringify(session.direction, null, 2)}</pre>
      </details>

      <details>
        <summary className="text-[11px] uppercase tracking-wider text-text-muted cursor-pointer">Scenario</summary>
        <pre className="mt-2 p-2 rounded bg-panel-2 text-[11px] overflow-auto max-h-64">{JSON.stringify(session.scenario, null, 2)}</pre>
      </details>

      <section>
        <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Steps ({steps.length})</div>
        <ul className="space-y-1">
          {steps.map(s => (
            <li key={s.id} className="text-xs p-2 rounded border border-white/5 bg-panel-2">
              <div className="flex items-center gap-2">
                <span className="text-accent font-mono">{s.step}</span>
                <span className="text-text-muted tabular-nums">${parseFloat(s.cost || "0").toFixed(4)}</span>
                <span className="ml-auto text-text-faint tabular-nums">{fmtTime(s.created_at)}</span>
              </div>
              {s.thinking && <div className="mt-1 text-text-muted line-clamp-2">{s.thinking}</div>}
            </li>
          ))}
          {steps.length === 0 && <li className="text-text-faint text-xs">no steps</li>}
        </ul>
      </section>

      {posts.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Posts ({posts.length})</div>
          <ul className="space-y-1">
            {posts.map(p => (
              <li key={p.id} className="text-xs p-2 rounded border border-white/5 bg-panel-2">
                <div className="flex items-center gap-2">
                  <span className="text-accent">#{p.id}</span>
                  <span className="text-text">{p.title ?? p.topic}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-text-muted">
                  {p.short_url && <a href={p.short_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">short</a>}
                  {p.full_url && <a href={p.full_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">full</a>}
                  {p.meta_url && <a href={p.meta_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">meta</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "completed" ? "#22d3ee"
              : status === "running"   ? "#fbbf24"
              : status === "failed"    ? "#f43f5e" : "#64748b";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
      style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {status}
    </span>
  );
}
