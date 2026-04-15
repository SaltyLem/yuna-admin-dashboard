"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/use-api";

interface EmotionState {
  valence: number;
  arousal: number;
  confidence: number;
  survival: number;
  curiosity: number;
  connection: number;
  reason: string;
  category?: string;
  timestamp: number;
}

interface VirtualBody {
  feeling?: string;
  energyReserves?: number;
  interoception?: Record<string, number>;
}

interface SurvivalState {
  status: string;
  dayNumber?: number;
  daysRemaining?: number;
  dailyCostAvg?: number;
}

interface GoalPayload { id: number; type?: string; content: string; status?: string }
interface HypothesisPayload { id: number; category?: string; content: string; status?: string; confidence?: number }
interface RulePayload { id: number; rule: string; reason: string; expires_at?: string }
interface InterestPayload { topic: string; weight?: number }
interface StateResponse {
  connected: boolean;
  emotion: EmotionState | null;
  survival: SurvivalState | null;
  virtualBody: VirtualBody | null;
  currentThought: string | null;
  activityStatus: string | null;
  currentPhase: string | null;
  timezone: string | null;
  todayCostUsd: number | null;
  currentInterests: InterestPayload[];
  activeGoals: GoalPayload[];
  activeHypotheses: HypothesisPayload[];
  immediateRules: RulePayload[];
  actBlockProgress: unknown;
  cycleBlockProgress: unknown;
}

const POLL_INTERVAL_MS = 3000;

export default function StatePage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<StateResponse>(`/state`, { silent: true });
      setState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-semibold">Current state</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Working Self snapshot — polling {POLL_INTERVAL_MS / 1000}s
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              state?.connected ? "bg-[color:var(--color-success)]" : "bg-[color:var(--color-danger)]"
            }`}
          />
          <span className="text-text-muted">
            {state?.connected ? "connected" : "disconnected"}
          </span>
          {state?.activityStatus && (
            <>
              <span className="text-text-faint">·</span>
              <span className="text-accent">{state.activityStatus}</span>
            </>
          )}
          {state?.currentPhase && (
            <>
              <span className="text-text-faint">·</span>
              <span className="text-text-muted">{state.currentPhase}</span>
            </>
          )}
        </div>
      </header>

      {loading && !state && (
        <div className="text-text-muted text-sm">Loading…</div>
      )}

      {error && (
        <div className="text-[color:var(--color-danger)] text-sm">{error}</div>
      )}

      {state && (
        <div className="grid grid-cols-2 gap-4">
          {/* Emotion */}
          <Panel title="Emotion" hint={state.emotion?.category}>
            {state.emotion ? (
              <>
                <Axis label="Valence" value={state.emotion.valence} />
                <Axis label="Arousal" value={state.emotion.arousal} />
                <Axis label="Confidence" value={state.emotion.confidence} />
                <Axis label="Survival" value={state.emotion.survival} />
                <Axis label="Curiosity" value={state.emotion.curiosity} />
                <Axis label="Connection" value={state.emotion.connection} />
                {state.emotion.reason && (
                  <div className="mt-3 pt-3 border-t border-border text-xs text-text-muted italic break-words">
                    {state.emotion.reason}
                  </div>
                )}
              </>
            ) : <Empty />}
          </Panel>

          {/* Survival */}
          <Panel title="Survival">
            {state.survival ? (
              <>
                <KV label="Status" value={state.survival.status} />
                {state.survival.dayNumber !== undefined && <KV label="Day" value={String(state.survival.dayNumber)} />}
                {state.survival.daysRemaining !== undefined && <KV label="Days remaining" value={String(state.survival.daysRemaining)} />}
                {state.survival.dailyCostAvg !== undefined && <KV label="Daily cost avg" value={`$${state.survival.dailyCostAvg.toFixed(2)}`} />}
                {state.todayCostUsd != null && <KV label="Today cost" value={`$${state.todayCostUsd.toFixed(4)}`} />}
              </>
            ) : <Empty />}
          </Panel>

          {/* Virtual body / interoception */}
          <Panel title="Virtual body">
            {state.virtualBody ? (
              <>
                {state.virtualBody.feeling && <KV label="Feeling" value={state.virtualBody.feeling} />}
                {state.virtualBody.energyReserves !== undefined && (
                  <Axis label="Energy" value={state.virtualBody.energyReserves} range={[0, 1]} />
                )}
                {state.virtualBody.interoception && Object.entries(state.virtualBody.interoception).map(([k, v]) => (
                  <Axis key={k} label={k} value={Number(v)} range={[0, 1]} />
                ))}
              </>
            ) : <Empty />}
          </Panel>

          {/* Current thought */}
          <Panel title="Current thought">
            {state.currentThought ? (
              <div className="text-sm text-text whitespace-pre-wrap break-words">
                {state.currentThought}
              </div>
            ) : <Empty />}
          </Panel>

          {/* Current interests */}
          <Panel title="Current interests">
            {state.currentInterests.length > 0 ? (
              <div className="space-y-1">
                {state.currentInterests.map((i, idx) => (
                  <div key={idx} className="text-xs text-text flex items-center gap-2">
                    <span className="flex-1 break-words">{i.topic}</span>
                    {i.weight !== undefined && (
                      <span className="text-text-faint tabular-nums">
                        {i.weight.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : <Empty />}
          </Panel>

          {/* Immediate rules */}
          <Panel title={`Immediate rules (${state.immediateRules.length})`}>
            {state.immediateRules.length > 0 ? (
              <div className="space-y-1">
                {state.immediateRules.slice(0, 5).map((r) => (
                  <div key={r.id} className="text-xs text-text break-words">
                    <span className="text-text-soft">#{r.id}</span> {r.rule}
                  </div>
                ))}
                {state.immediateRules.length > 5 && (
                  <div className="text-xs text-text-faint">
                    +{state.immediateRules.length - 5} more…
                  </div>
                )}
              </div>
            ) : <Empty />}
          </Panel>

          {/* Active goals */}
          <Panel title={`Active goals (${state.activeGoals.length})`}>
            {state.activeGoals.length > 0 ? (
              <div className="space-y-1">
                {state.activeGoals.slice(0, 5).map((g) => (
                  <div key={g.id} className="text-xs text-text break-words">
                    <span className="text-text-soft">#{g.id}</span>{g.type ? ` [${g.type}]` : ""} {g.content}
                  </div>
                ))}
                {state.activeGoals.length > 5 && (
                  <div className="text-xs text-text-faint">
                    +{state.activeGoals.length - 5} more…
                  </div>
                )}
              </div>
            ) : <Empty />}
          </Panel>

          {/* Active hypotheses */}
          <Panel title={`Active hypotheses (${state.activeHypotheses.length})`}>
            {state.activeHypotheses.length > 0 ? (
              <div className="space-y-1">
                {state.activeHypotheses.slice(0, 5).map((h) => (
                  <div key={h.id} className="text-xs text-text break-words">
                    <span className="text-text-soft">#{h.id}</span>
                    {h.confidence !== undefined && (
                      <span className="text-text-faint ml-1 tabular-nums">
                        ({h.confidence.toFixed(2)})
                      </span>
                    )}{" "}
                    {h.content}
                  </div>
                ))}
                {state.activeHypotheses.length > 5 && (
                  <div className="text-xs text-text-faint">
                    +{state.activeHypotheses.length - 5} more…
                  </div>
                )}
              </div>
            ) : <Empty />}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
          {title}
        </div>
        {hint && (
          <div className="text-[10px] text-accent font-mono uppercase">{hint}</div>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-text-faint">—</div>;
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-xs text-text font-mono">{value}</span>
    </div>
  );
}

function Axis({
  label,
  value,
  range = [-1, 1],
}: {
  label: string;
  value: number;
  range?: [number, number];
}) {
  const [min, max] = range;
  const span = max - min;
  const clampedValue = Math.max(min, Math.min(max, value));
  const ratio = (clampedValue - min) / span;
  const zero = Math.max(0, Math.min(1, (0 - min) / span));
  const barLeft = Math.min(ratio, zero);
  const barRight = Math.max(ratio, zero);
  const positive = value >= 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-text-muted mb-0.5">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="text-text font-mono tabular-nums">{value.toFixed(2)}</span>
      </div>
      <div className="relative h-1.5 bg-panel-2 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 bottom-0 ${
            positive ? "bg-accent" : "bg-[color:var(--color-danger)]"
          }`}
          style={{
            left: `${barLeft * 100}%`,
            right: `${(1 - barRight) * 100}%`,
          }}
        />
        {range[0] < 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${zero * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
