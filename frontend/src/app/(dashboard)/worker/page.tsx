"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/use-api";

interface CrawlSource {
  id: number; name: string; url: string; type: string;
  interval_minutes: number; enabled: boolean;
  last_crawled_at: string | null; created_at: string;
}
interface ArticleStat {
  id: number; name: string;
  article_count: string | number;
  latest_crawled: string | null;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Date.now() - Date.parse(iso);
  if (!Number.isFinite(d) || d < 0) return "—";
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function WorkerOverviewPage() {
  const [sources, setSources] = useState<CrawlSource[] | null>(null);
  const [stats, setStats] = useState<ArticleStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, st] = await Promise.all([
          apiFetch<{ sources: CrawlSource[] }>("/crawl/sources", { silent: true }),
          apiFetch<{ stats: ArticleStat[] }>("/crawl/articles/stats", { silent: true }),
        ]);
        if (cancelled) return;
        setSources(s.sources);
        setStats(st.stats);
      } catch { /* keep */ }
    }
    void load();
    const h = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(h); };
  }, []);

  const enabledCount = sources?.filter(s => s.enabled).length ?? 0;
  const totalArticles = stats?.reduce((acc, r) => acc + (parseInt(String(r.article_count), 10) || 0), 0) ?? 0;

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header>
        <h2 className="text-xl font-semibold">Workers</h2>
        <p className="text-xs text-text-muted mt-0.5">バックグラウンドで走ってるワーカーの状況</p>
      </header>

      <section className="rounded-xl border border-white/10 bg-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }} />
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Crawl</div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/worker/crawl" className="text-[11px] text-accent hover:underline">articles →</Link>
            <span className="text-text-faint">·</span>
            <Link href="/worker/crawl/sources" className="text-[11px] text-accent hover:underline">sources →</Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Sources (enabled)" value={`${enabledCount} / ${sources?.length ?? 0}`} color="#22d3ee" />
          <Kpi label="Articles (total)"  value={totalArticles.toLocaleString()} color="#a855f7" />
          <Kpi label="Latest crawl"      value={fmtAgo(stats?.[0]?.latest_crawled ?? null)} color="#fbbf24" big={false} />
        </div>

        {stats && stats.length > 0 && (
          <div className="mt-4">
            <div className="text-[9px] uppercase tracking-[0.2em] text-text-faint mb-1">Per source</div>
            <ul className="divide-y divide-white/5">
              {stats.slice(0, 8).map(r => (
                <li key={r.id} className="flex items-center gap-3 py-1.5 text-xs">
                  <span className="text-text truncate flex-1">{r.name}</span>
                  <span className="tabular-nums text-text-muted w-16 text-right">
                    {parseInt(String(r.article_count), 10).toLocaleString()} art
                  </span>
                  <span className="tabular-nums text-text-faint w-20 text-right">{fmtAgo(r.latest_crawled)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, color, big = true }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div className={(big ? "text-xl" : "text-sm") + " font-bold tabular-nums leading-none mt-1"} style={{ color }}>
        {value}
      </div>
    </div>
  );
}
