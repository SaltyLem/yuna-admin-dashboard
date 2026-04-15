"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface Finding {
  query?: string;
  content?: string;
  source?: string;
  timestamp?: number | string;
  [k: string]: unknown;
}

interface StateResponse {
  researchFindings: Finding[] | null;
}

const POLL_MS = 5000;

export default function ResearchFindingsPage() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<StateResponse>(`/state`, { silent: true });
      setFindings(data.researchFindings);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header>
        <h2 className="text-xl font-semibold">Research findings</h2>
        <p className="text-xs text-text-muted mt-0.5">
          researchFindings — stream prep / strategic think が web 調査で集めた事実
        </p>
      </header>

      {loading && !findings && <div className="text-text-muted text-sm">Loading…</div>}

      {findings === null && !loading && (
        <div className="text-xs text-text-faint">
          researchFindings not yet mirrored from Yuna core.
        </div>
      )}

      {findings && findings.length === 0 && (
        <div className="text-xs text-text-faint">No findings currently in state.</div>
      )}

      {findings && findings.length > 0 && (
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={i} className="bg-panel border border-border rounded-md p-3">
              {f.query && (
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                  query · {f.query}
                </div>
              )}
              <div className="text-sm text-text whitespace-pre-wrap break-words">
                {f.content ?? JSON.stringify(f, null, 2)}
              </div>
              {f.source && (
                <div className="text-[10px] text-text-faint mt-2 font-mono break-all">
                  {f.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
