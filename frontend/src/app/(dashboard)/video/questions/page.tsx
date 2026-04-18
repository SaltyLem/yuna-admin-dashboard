"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";
import { AdminTable, type AdminColumn, type SortDir } from "@/components/admin-table";
import { SegmentedControl } from "@/components/ui";

interface Question {
  id: number; source: string; question: string; context: string | null;
  platform: string; priority: string;
  status: string; language: string | null; created_at: string;
}

type StatusFilter = "all" | "pending" | "used" | "dropped";
const PAGE_SIZE = 50;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function VideoQuestionsPage() {
  const [rows, setRows] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [sortKey, setSortKey] = useState("priority");
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
      const d = await apiFetch<{ questions: Question[]; total: number }>(`/video/questions?${qs}`);
      setRows(d.questions);
      setTotal(d.total);
    } catch {
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, page, sortKey, sortDir]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, sortKey, sortDir]);

  const columns: AdminColumn<Question>[] = [
    { key: "id", label: "ID", width: "w-14", sortable: true,
      cellClass: "text-text-faint font-mono tabular-nums",
      render: (q) => q.id },
    { key: "priority", label: "Pri", width: "w-12", sortable: true,
      cellClass: "text-text-muted tabular-nums",
      render: (q) => parseFloat(q.priority).toFixed(2) },
    { key: "status", label: "Status", width: "w-20", sortable: true,
      cellClass: "text-text-muted text-[11px] uppercase",
      render: (q) => q.status },
    { key: "source", label: "Source", width: "w-20", sortable: true,
      cellClass: "text-text-muted text-[11px]",
      render: (q) => q.source },
    { key: "language", label: "Lang", width: "w-12", sortable: false,
      cellClass: "text-text-muted text-[11px]",
      render: (q) => q.language ?? "—" },
    { key: "question", label: "Question",
      render: (q) => (
        <div className="text-text line-clamp-2 max-w-2xl">{q.question}</div>
      ) },
    { key: "created_at", label: "Created", width: "w-28", sortable: true,
      cellClass: "text-text-faint tabular-nums text-[11px]",
      render: (q) => fmtTime(q.created_at) },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold">Video questions</h2>
        <p className="text-xs text-text-muted mt-0.5"><code>video_questions</code> — 動画の元ネタ候補</p>
      </header>

      <SegmentedControl
        value={status}
        onChange={(v) => setStatus(v as StatusFilter)}
        options={[
          { value: "pending", label: "Pending" },
          { value: "used", label: "Used" },
          { value: "dropped", label: "Dropped" },
          { value: "all", label: "All" },
        ]}
      />

      <AdminTable<Question>
        columns={columns}
        rows={rows}
        rowKey={(q) => q.id}
        loading={loading}
        emptyLabel={loading ? "Loading…" : "No questions"}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(k, d) => { setSortKey(k); setSortDir(d); }}
        sortDescDefaults={["id", "priority", "created_at"]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </div>
  );
}
