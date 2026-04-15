"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface Interest { topic: string; weight?: number }

interface StateResponse {
  currentInterests: Interest[];
  engagement: Record<string, number> | null;
  recentTopics: string[] | null;
  attentionWeights: Record<string, number> | null;
}

const POLL_MS = 3000;

export default function InterestsEngagementPage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<StateResponse>(`/state`, { silent: true });
      setState(data);
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
        <h2 className="text-xl font-semibold">Interests &amp; engagement</h2>
        <p className="text-xs text-text-muted mt-0.5">
          currentInterests / engagement / attention weights (polling {POLL_MS / 1000}s)
        </p>
      </header>

      {loading && !state && <div className="text-text-muted text-sm">Loading…</div>}

      {state && (
        <div className="grid grid-cols-2 gap-4">
          <Panel title={`Current interests (${state.currentInterests.length})`}>
            {state.currentInterests.length > 0 ? (
              state.currentInterests.map((i, idx) => (
                <div key={idx} className="flex items-baseline justify-between text-xs">
                  <span className="text-text break-all truncate">{i.topic}</span>
                  {i.weight !== undefined && (
                    <span className="text-text-faint tabular-nums font-mono shrink-0 ml-2">
                      {Number(i.weight).toFixed(2)}
                    </span>
                  )}
                </div>
              ))
            ) : <Empty />}
          </Panel>

          <Panel title="Engagement">
            {state.engagement ? (
              Object.entries(state.engagement).map(([k, v]) => (
                <Bar key={k} label={k} value={Number(v)} />
              ))
            ) : <Empty hint="Not yet mirrored from Yuna core" />}
          </Panel>

          <Panel title="Attention weights">
            {state.attentionWeights ? (
              Object.entries(state.attentionWeights).map(([k, v]) => (
                <Bar key={k} label={k} value={Number(v)} />
              ))
            ) : <Empty hint="Not yet mirrored" />}
          </Panel>

          <Panel title="Recent topics">
            {state.recentTopics && state.recentTopics.length > 0 ? (
              state.recentTopics.map((t, i) => (
                <div key={i} className="text-xs text-text break-all">{t}</div>
              ))
            ) : <Empty />}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-border rounded-md p-4">
      <div className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-3">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ hint }: { hint?: string }) {
  return <div className="text-xs text-text-faint">{hint ?? "—"}</div>;
}

function Bar({ label, value }: { label: string; value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] text-text-muted mb-0.5">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="text-text font-mono tabular-nums">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-panel-2 rounded-full overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}
