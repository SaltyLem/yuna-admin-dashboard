"use client";

/**
 * /yuna — YUNA の "Mind" ランディング。
 *
 * Layout rhythm (top → bottom):
 *   1. CONSCIOUSNESS — hero: emotion + current thought + connection
 *   2. VITALS        — KPI strip (cost / survival / goals / pending / interests)
 *   3. EMOTION + DRIVES — valence×arousal scatter + drives bars
 *   4. ACTIVE GOALS  — top 3 goal cards with progress bars
 *   5. INTERESTS + RULES + HYPOTHESES — 3 col
 *   6. CYCLE / ACT progress — combined bar
 *   7. QUICK NAV     — sub-page grid
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/use-api";

/* ============================================================= */
/*  types                                                         */
/* ============================================================= */

interface EmotionState {
  valence?: number; arousal?: number; confidence?: number;
  survival?: number; curiosity?: number; connection?: number;
  reason?: string; category?: string;
}
interface VirtualBody {
  feeling?: string;
  energyReserves?: number;
  interoception?: Record<string, number>;
}
interface SurvivalState {
  status?: string; dayNumber?: number; daysRemaining?: number; dailyCostAvg?: number;
}
interface Goal { id: number; type?: string; content: string; status?: string; progress?: string | null }
interface Hypothesis { id: number; category?: string; content: string; status?: string; confidence?: number }
interface Rule { id: number; rule: string; reason: string; expires_at?: string }
interface Interest { topic: string; weight?: number }

interface BlockProgress {
  name?: string;
  index?: number; total?: number;
  progress?: number;   // 0..1
  remainingMs?: number;
  startedAt?: string;
}

interface StateResponse {
  connected?: boolean;
  emotion?: EmotionState | null;
  survival?: SurvivalState | null;
  virtualBody?: VirtualBody | null;
  currentThought?: string | null;
  activityStatus?: string | null;
  currentPhase?: string | null;
  timezone?: string | null;
  todayCostUsd?: number | null;
  currentInterests?: Interest[];
  activeGoals?: Goal[];
  activeHypotheses?: Hypothesis[];
  immediateRules?: Rule[];
  actBlockProgress?: BlockProgress | null;
  cycleBlockProgress?: BlockProgress | null;
  drives?: Record<string, number> | null;
}

interface Pending { actions: Array<{ id: number; title?: string; content?: string }>; total: number }

/* ============================================================= */
/*  hook                                                          */
/* ============================================================= */

function usePolling<T>(fn: () => Promise<T>, ms: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try { const d = await fn(); if (!cancelled) setData(d); } catch { /* keep */ }
    }
    void run();
    const h = setInterval(run, ms);
    return () => { cancelled = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

/* ============================================================= */
/*  page                                                          */
/* ============================================================= */

export default function YunaOverviewPage() {
  const state = usePolling<StateResponse>(() => apiFetch("/state", { silent: true }), 5_000);
  const pending = usePolling<Pending>(
    () => apiFetch("/pending-actions?status=pending&limit=5", { silent: true }),
    15_000,
  );

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto">
      <ConsciousnessHero state={state} />
      <VitalsStrip state={state} pending={pending} />
      <EmotionAndDrives state={state} />
      <ActiveGoals goals={state?.activeGoals ?? []} />
      <InterestsRulesHypotheses state={state} />
      <CycleProgress state={state} />
      <QuickNav />
    </div>
  );
}

/* ============================================================= */
/*  1. CONSCIOUSNESS (hero)                                       */
/* ============================================================= */

function ConsciousnessHero({ state }: { state: StateResponse | null }) {
  const emotion = state?.emotion?.category ?? "—";
  const valence = state?.emotion?.valence;
  const arousal = state?.emotion?.arousal;
  const reason = state?.emotion?.reason;
  const thought = state?.currentThought;
  const activity = state?.activityStatus;
  const phase = state?.currentPhase;
  const tz = state?.timezone;
  const connected = state?.connected;

  const accent = "#a855f7";

  return (
    <section
      className="relative rounded-2xl border overflow-hidden"
      style={{
        background: `radial-gradient(140% 140% at 0% 0%, ${accent}25, #0b1120 50%, #05070d 90%)`,
        borderColor: `${accent}77`,
        boxShadow: `0 0 40px -12px ${accent}aa, 0 0 1px ${accent}99 inset`,
      }}
    >
      <div className="absolute right-3 top-3">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
          style={{
            color: connected ? "#22d3ee" : "#f43f5e",
            background: connected ? "#22d3ee22" : "#f43f5e22",
            border: `1px solid ${connected ? "#22d3ee77" : "#f43f5e77"}`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
            style={{
              background: connected ? "#22d3ee" : "#f43f5e",
              boxShadow: `0 0 6px ${connected ? "#22d3ee" : "#f43f5e"}`,
            }}
          />
          {connected ? "CONNECTED" : "OFFLINE"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 md:p-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>
            Emotion
          </div>
          <div
            className="text-6xl font-black tabular-nums leading-none mt-2"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, #22d3ee 80%)`,
              WebkitBackgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 16px ${accent}aa`,
            }}
          >
            {emotion}
          </div>
          {valence != null && arousal != null && (
            <div className="mt-2 flex items-baseline gap-4 text-[11px] tabular-nums">
              <span className="text-text-muted">
                <span className="text-text-faint uppercase tracking-wider mr-1">V</span>
                <span className="text-text font-semibold">{valence.toFixed(2)}</span>
              </span>
              <span className="text-text-muted">
                <span className="text-text-faint uppercase tracking-wider mr-1">A</span>
                <span className="text-text font-semibold">{arousal.toFixed(2)}</span>
              </span>
              {state?.emotion?.confidence != null && (
                <span className="text-text-muted">
                  <span className="text-text-faint uppercase tracking-wider mr-1">conf</span>
                  <span className="text-text font-semibold">{state.emotion.confidence.toFixed(2)}</span>
                </span>
              )}
            </div>
          )}
          {reason && <div className="mt-3 text-[11px] text-text-muted max-w-md line-clamp-2">{reason}</div>}

          <div className="mt-4 flex items-center gap-3 text-[10px] text-text-muted uppercase tracking-wider">
            {activity && <span><span className="text-text-faint">status</span> <span className="text-text">{activity}</span></span>}
            {phase && <span><span className="text-text-faint">phase</span> <span className="text-text">{phase}</span></span>}
            {tz && <span><span className="text-text-faint">tz</span> <span className="text-text">{tz}</span></span>}
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "#22d3ee" }}>
            Current thought
          </div>
          <blockquote
            className="mt-2 text-sm italic text-text leading-relaxed border-l-2 pl-3 min-h-[80px]"
            style={{ borderColor: `${accent}66` }}
          >
            {thought ?? <span className="text-text-faint">thinking…</span>}
          </blockquote>
        </div>
      </div>
    </section>
  );
}

/* ============================================================= */
/*  2. VITALS                                                     */
/* ============================================================= */

function VitalsStrip({ state, pending }: { state: StateResponse | null; pending: Pending | null }) {
  const cost = state?.todayCostUsd;
  const daysLeft = state?.survival?.daysRemaining;
  const energy = state?.virtualBody?.energyReserves;
  const goalsCount = state?.activeGoals?.length ?? 0;
  const pendingCount = pending?.total ?? 0;
  const interestCount = state?.currentInterests?.length ?? 0;

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
      <Kpi label="Today API $" value={cost != null ? `$${cost.toFixed(2)}` : "—"} color="#38bdf8" />
      <Kpi label="Survival days" value={daysLeft != null ? String(daysLeft) : "—"} color={daysLeft != null && daysLeft < 14 ? "#f43f5e" : "#22d3ee"} />
      <Kpi label="Energy" value={energy != null ? `${Math.round(energy * 100)}%` : "—"} color="#fbbf24" />
      <Kpi label="Active goals" value={goalsCount} color="#a855f7" />
      <Kpi label="Pending" value={pendingCount} color="#e879f9" />
      <Kpi label="Interests" value={interestCount} color="#f472b6" />
    </section>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        background: `linear-gradient(180deg, ${color}10 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
        boxShadow: `0 0 12px -10px ${color}88, 0 0 1px ${color}22 inset`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div
        className="text-2xl font-bold tabular-nums leading-none mt-1"
        style={{ color, textShadow: `0 0 10px ${color}55` }}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  3. EMOTION PLOT + DRIVES                                      */
/* ============================================================= */

function EmotionAndDrives({ state }: { state: StateResponse | null }) {
  const v = state?.emotion?.valence ?? null;
  const a = state?.emotion?.arousal ?? null;
  const drives = state?.drives ?? null;

  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-3 shrink-0">
      <EmotionScatter valence={v} arousal={a} reason={state?.emotion?.reason ?? null} />
      <DrivesBars drives={drives} />
    </section>
  );
}

function EmotionScatter({ valence, arousal, reason }: { valence: number | null; arousal: number | null; reason: string | null }) {
  const W = 100, H = 100, pad = 10;
  const toX = (v: number) => pad + ((v + 1) / 2) * (W - 2 * pad);
  const toY = (a: number) => (H - pad) - ((a + 1) / 2) * (H - 2 * pad);

  return (
    <div className="rounded-xl border border-white/10 bg-panel px-3 py-3">
      <div className="flex items-center mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Emotion (valence × arousal)</span>
        <span className="ml-auto text-[10px] text-text-faint">
          {valence != null && arousal != null
            ? `V ${valence.toFixed(2)} · A ${arousal.toFixed(2)}`
            : "—"}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: "1.6/1" }}>
          <defs>
            <radialGradient id="em-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0b1120" stopOpacity={0} />
            </radialGradient>
          </defs>
          <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="url(#em-bg)" stroke="#ffffff11" />
          <line x1={W / 2} y1={pad} x2={W / 2} y2={H - pad} stroke="#ffffff15" strokeDasharray="1 1" />
          <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#ffffff15" strokeDasharray="1 1" />
          <text x={W - pad - 2} y={pad + 3} fill="#94a3b8" fontSize="3" textAnchor="end">↑ aroused · +v</text>
          <text x={pad + 2}       y={pad + 3} fill="#94a3b8" fontSize="3">aroused · −v</text>
          <text x={pad + 2}       y={H - pad - 1} fill="#94a3b8" fontSize="3">calm · −v</text>
          <text x={W - pad - 2}   y={H - pad - 1} fill="#94a3b8" fontSize="3" textAnchor="end">calm · +v</text>
          {valence != null && arousal != null && (
            <g>
              <circle cx={toX(valence)} cy={toY(arousal)} r={3} fill="#a855f7" opacity={0.3} />
              <circle cx={toX(valence)} cy={toY(arousal)} r={1.2} fill="#a855f7">
                <animate attributeName="r" values="1.2;2.4;1.2" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>
      </div>
      {reason && (
        <div className="mt-2 text-[11px] text-text-muted italic line-clamp-2">&ldquo;{reason}&rdquo;</div>
      )}
    </div>
  );
}

function DrivesBars({ drives }: { drives: Record<string, number> | null }) {
  const entries = drives ? Object.entries(drives) : [];
  return (
    <div className="rounded-xl border border-white/10 bg-panel px-3 py-3">
      <div className="flex items-center mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Drives</span>
        <span className="ml-auto text-[10px] text-text-faint">{entries.length} axes</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-text-faint text-xs py-6 text-center">no drive data</div>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([k, v]) => {
            const pct = Math.max(0, Math.min(100, Math.round((v ?? 0) * 100)));
            const color = pct >= 80 ? "#f43f5e" : pct >= 60 ? "#fbbf24" : "#22d3ee";
            return (
              <li key={k} className="grid grid-cols-[80px_1fr_40px] items-center gap-2 text-[11px]">
                <span className="uppercase tracking-wider text-text-muted truncate">{k}</span>
                <div className="h-1.5 bg-white/5 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${color}aa, ${color})`,
                      boxShadow: `0 0 6px ${color}88`,
                      transition: "width 500ms ease",
                    }}
                  />
                </div>
                <span className="tabular-nums text-right text-text" style={{ color }}>{pct}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================= */
/*  4. ACTIVE GOALS                                               */
/* ============================================================= */

function ActiveGoals({ goals }: { goals: Goal[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-panel px-3 py-3 shrink-0">
      <div className="flex items-center mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Active goals</span>
        <Link href="/yuna/goals" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {goals.length === 0 ? (
        <div className="text-text-faint text-xs py-4">no active goals</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {goals.slice(0, 3).map(g => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </section>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const typeShort = goal.type === "long_term" ? "LONG" : goal.type === "mid_term" ? "MID" : goal.type === "short_term" ? "SHORT" : "";
  const typeColor = typeShort === "LONG" ? "#a855f7" : typeShort === "MID" ? "#22d3ee" : "#fbbf24";
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: `linear-gradient(180deg, ${typeColor}08 0%, #0b1120cc 70%)`,
        borderColor: `${typeColor}33`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ color: typeColor, background: `${typeColor}22` }}
        >
          {typeShort || "GOAL"}
        </span>
        <span className="text-text-faint font-mono text-[10px]">#{goal.id}</span>
      </div>
      <div className="text-[12px] text-text line-clamp-3">{goal.content}</div>
      {goal.progress && (
        <div className="mt-1 text-[10px] text-text-muted line-clamp-2">{goal.progress}</div>
      )}
    </div>
  );
}

/* ============================================================= */
/*  5. INTERESTS + RULES + HYPOTHESES                             */
/* ============================================================= */

function InterestsRulesHypotheses({ state }: { state: StateResponse | null }) {
  const interests = state?.currentInterests ?? [];
  const rules = state?.immediateRules ?? [];
  const hypos = state?.activeHypotheses ?? [];

  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
      <ColumnPanel title="Interests" accent="#f472b6" href="/yuna/interests-engagement">
        {interests.length === 0 ? (
          <div className="text-text-faint text-xs">none</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {interests.slice(0, 20).map((t, i) => {
              const w = t.weight ?? 0;
              const intensity = Math.max(0.3, Math.min(1, w));
              return (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded border tabular-nums"
                  style={{
                    borderColor: `#f472b6${Math.round(intensity * 100).toString(16).padStart(2, "0")}`,
                    color: `#f472b6`,
                    background: `#f472b6${Math.round(intensity * 22).toString(16).padStart(2, "0")}`,
                  }}
                  title={w ? `weight ${w.toFixed(2)}` : undefined}
                >
                  {t.topic}
                  {w > 0 && <span className="ml-1 text-text-faint">{w.toFixed(1)}</span>}
                </span>
              );
            })}
          </div>
        )}
      </ColumnPanel>

      <ColumnPanel title="Immediate rules" accent="#fbbf24" href="/yuna/immediate-rules">
        {rules.length === 0 ? (
          <div className="text-text-faint text-xs">none</div>
        ) : (
          <ul className="space-y-1">
            {rules.slice(0, 5).map(r => (
              <li key={r.id} className="text-[11px] border-l-2 pl-2" style={{ borderColor: "#fbbf2455" }}>
                <div className="text-text line-clamp-2">{r.rule}</div>
                {r.reason && <div className="text-text-faint text-[10px] line-clamp-1">{r.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </ColumnPanel>

      <ColumnPanel title="Active hypotheses" accent="#38bdf8" href="/yuna/hypotheses">
        {hypos.length === 0 ? (
          <div className="text-text-faint text-xs">none</div>
        ) : (
          <ul className="space-y-1">
            {hypos.slice(0, 5).map(h => (
              <li key={h.id} className="text-[11px] flex items-start gap-2">
                <span className="text-text-faint font-mono w-8 shrink-0">#{h.id}</span>
                <span className="text-text line-clamp-2 flex-1">{h.content}</span>
                {h.confidence != null && (
                  <span className="tabular-nums text-[10px]" style={{ color: "#38bdf8" }}>
                    {(h.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ColumnPanel>
    </section>
  );
}

function ColumnPanel({
  title, accent, href, children,
}: {
  title: string; accent: string; href: string; children: React.ReactNode;
}) {
  return (
    <section
      className="relative rounded-xl border bg-panel px-3 py-3"
      style={{ borderColor: `${accent}22` }}
    >
      <div className="flex items-center mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: `${accent}cc` }}>{title}</span>
        <Link href={href} className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {children}
    </section>
  );
}

/* ============================================================= */
/*  6. CYCLE PROGRESS                                             */
/* ============================================================= */

function CycleProgress({ state }: { state: StateResponse | null }) {
  const cycle = state?.cycleBlockProgress ?? null;
  const act = state?.actBlockProgress ?? null;

  return (
    <section className="rounded-xl border border-white/10 bg-panel px-3 py-3 shrink-0">
      <div className="flex items-center mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#e879f9", boxShadow: "0 0 8px #e879f9" }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Cycle progress</span>
        <Link href="/yuna/cycle-blocks" className="ml-auto text-[10px] text-accent hover:underline">history →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ProgressBlock label="Cycle block" block={cycle} color="#e879f9" />
        <ProgressBlock label="Act block"   block={act}   color="#22d3ee" />
      </div>
    </section>
  );
}

function ProgressBlock({ label, block, color }: { label: string; block: BlockProgress | null; color: string }) {
  const progress = block?.progress ?? 0;
  const pct = Math.max(0, Math.min(100, progress * 100));
  const total = block?.total ?? null;
  const index = block?.index ?? null;
  const remainingMin = block?.remainingMs != null ? Math.round(block.remainingMs / 60_000) : null;

  return (
    <div className="rounded-lg border border-white/5 p-2.5" style={{ background: `${color}06` }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: `${color}cc` }}>{label}</span>
        <span className="text-sm font-semibold text-text truncate flex-1">{block?.name ?? "—"}</span>
        <span className="text-[10px] text-text-faint tabular-nums">
          {index != null && total != null ? `${index + 1}/${total}` : ""}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-white/5 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            boxShadow: `0 0 6px ${color}aa`,
            transition: "width 500ms ease",
          }}
        />
      </div>
      <div className="mt-1 flex items-center text-[10px] text-text-faint tabular-nums">
        <span>{pct.toFixed(0)}%</span>
        <span className="ml-auto">
          {remainingMin != null ? `${remainingMin}m left` : ""}
        </span>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  7. QUICK NAV                                                  */
/* ============================================================= */

function QuickNav() {
  const items: Array<{ href: string; label: string; sub: string; color: string }> = [
    { href: "/yuna/state",               label: "Current state",     sub: "emotion / survival / body",   color: "#a855f7" },
    { href: "/yuna/goals",               label: "Goals",             sub: "long / mid / short term",     color: "#22d3ee" },
    { href: "/yuna/immediate-rules",     label: "Immediate rules",   sub: "runtime behavior rules",      color: "#fbbf24" },
    { href: "/yuna/hypotheses",          label: "Hypotheses",        sub: "beliefs with confidence",     color: "#38bdf8" },
    { href: "/yuna/thoughts",            label: "Thoughts",          sub: "recent cognitive traces",     color: "#e879f9" },
    { href: "/yuna/pending-actions",     label: "Pending actions",   sub: "scheduled tasks",             color: "#f472b6" },
    { href: "/yuna/persons",             label: "Persons",           sub: "relationships & identities",  color: "#60a5fa" },
    { href: "/yuna/drives",              label: "Drives",            sub: "internal motivation axes",    color: "#fb7185" },
    { href: "/yuna/interests-engagement",label: "Interests",         sub: "current engagement topics",   color: "#c084fc" },
    { href: "/yuna/research-findings",   label: "Research findings", sub: "new knowledge",               color: "#4ade80" },
    { href: "/yuna/cycle-blocks",        label: "Cycle blocks",      sub: "cognitive scheduling",        color: "#f59e0b" },
    { href: "/yuna/api-usage",           label: "API usage",         sub: "cost breakdown",              color: "#34d399" },
    { href: "/yuna/memory",              label: "Memory",            sub: "events / situations / facts", color: "#fca5a5" },
  ];
  return (
    <section className="rounded-xl border border-white/10 bg-panel px-3 py-3 shrink-0">
      <div className="flex items-center mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Explore</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
        {items.map(it => (
          <Link
            key={it.href}
            href={it.href}
            className="group relative rounded-md border border-white/10 px-3 py-2 hover:border-white/30 transition overflow-hidden"
            style={{ background: `linear-gradient(90deg, ${it.color}08, transparent 70%)` }}
          >
            <span
              className="absolute left-0 top-0 bottom-0 w-[2px] transition-all"
              style={{ background: it.color, opacity: 0.5 }}
            />
            <div className="text-sm text-text pl-1">{it.label}</div>
            <div className="text-[10px] text-text-faint pl-1">{it.sub}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
