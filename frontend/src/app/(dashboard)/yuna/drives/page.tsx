"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface StateResponse {
  connected: boolean;
  drives: Record<string, number> | null;
  survival: { status?: string; daysRemaining?: number } | null;
}

const POLL_MS = 3000;

export default function DrivesPage() {
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
        <h2 className="text-xl font-semibold">Drives</h2>
        <p className="text-xs text-text-muted mt-0.5">
          motivational drives — survival / social / curiosity etc (polling {POLL_MS / 1000}s)
        </p>
      </header>

      {loading && !state && <div className="text-text-muted text-sm">Loading…</div>}

      {state && (
        <div className="bg-panel border border-border rounded-md p-4">
          {state.drives ? (
            <div className="space-y-2">
              {Object.entries(state.drives).map(([key, value]) => (
                <DriveBar key={key} label={key} value={Number(value)} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-faint">
              No drives in state mirror. Yuna core may not push drives yet — this dashboard reads
              from the same pass-through /state endpoint, so as soon as Yuna includes drives in
              its state update this view will populate.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DriveBar({ label, value }: { label: string; value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-text-muted mb-0.5">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="text-text font-mono tabular-nums">{value.toFixed(2)}</span>
      </div>
      <div className="h-2 bg-panel-2 rounded-full overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}
