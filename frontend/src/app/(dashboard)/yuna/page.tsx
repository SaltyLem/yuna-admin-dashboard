"use client";

/**
 * /yuna — YUNA の "Mind" ランディング。
 *
 * 1画面に収めるレイアウト。縦横メリハリ:
 *   Row A (flex-[1.5]): hero (8col) + vital stack (4col, 縦3枚)
 *   Row B (flex-1):     emotion scatter (3col) + drives (4col) + goals (5col 縦スタック)
 *   Row C (flex-[0.8]): interests (4col) + rules (3col) + hypotheses (3col) + cycle (2col)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/components/use-api";

/* ============================================================= */
/*  types                                                         */
/* ============================================================= */

interface EmotionState {
  valence?: number; arousal?: number; confidence?: number;
  reason?: string; category?: string;
}
interface VirtualBody { feeling?: string; energyReserves?: number }
interface SurvivalState { status?: string; daysRemaining?: number; dailyCostAvg?: number }
interface Goal { id: number; type?: string; content: string; status?: string; progress?: string | null }
interface Hypothesis { id: number; content: string; confidence?: number }
interface Rule { id: number; rule: string; reason: string }
interface Interest { topic: string; weight?: number }
interface BlockProgress {
  name?: string; index?: number; total?: number;
  progress?: number; remainingMs?: number;
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
interface Pending { total: number }

/* ============================================================= */
/*  hook                                                          */
/* ============================================================= */

function usePolling<T>(fn: () => Promise<T>, ms: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() { try { const d = await fn(); if (!cancelled) setData(d); } catch { /* keep */ } }
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
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Row A — hero + vitals */}
      <div className="flex-[1.5] min-h-0 grid grid-cols-12 gap-3">
        <ConsciousnessHero state={state} className="col-span-12 xl:col-span-8" />
        <VitalsStack state={state} pending={pending} className="col-span-12 xl:col-span-4" />
      </div>

      {/* Row B — scatter + drives + goals */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        <EmotionScatter state={state} className="col-span-12 md:col-span-4 xl:col-span-3" />
        <DrivesBars drives={state?.drives ?? null} className="col-span-12 md:col-span-4 xl:col-span-4" />
        <ActiveGoalsVertical goals={state?.activeGoals ?? []} className="col-span-12 md:col-span-4 xl:col-span-5" />
      </div>

      {/* Row C — tags + rules + hypotheses + cycle */}
      <div className="flex-[0.9] min-h-0 grid grid-cols-12 gap-3">
        <InterestsPanel interests={state?.currentInterests ?? []} className="col-span-12 md:col-span-6 xl:col-span-4" />
        <RulesPanel rules={state?.immediateRules ?? []} className="col-span-12 md:col-span-3 xl:col-span-3" />
        <HypothesesPanel hypos={state?.activeHypotheses ?? []} className="col-span-12 md:col-span-3 xl:col-span-3" />
        <CycleColumn state={state} className="col-span-12 xl:col-span-2" />
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Row A — Hero                                                  */
/* ============================================================= */

function ConsciousnessHero({ state, className = "" }: { state: StateResponse | null; className?: string }) {
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
      className={["relative rounded-2xl border overflow-hidden flex flex-col", className].join(" ")}
      style={{
        background: `radial-gradient(140% 140% at 0% 0%, ${accent}25, #0b1120 50%, #05070d 90%)`,
        borderColor: `${accent}77`,
        boxShadow: `0 0 40px -12px ${accent}aa, 0 0 1px ${accent}99 inset`,
      }}
    >
      <div className="absolute right-3 top-3 z-10">
        <LivePill connected={connected} />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-5 gap-4 p-4 md:p-5">
        <div className="col-span-3 flex flex-col justify-center min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: accent }}>
            Emotion
          </div>
          <div
            className="font-black leading-none mt-1 truncate"
            style={{
              fontSize: "clamp(2.25rem, 6vw, 4rem)",
              background: `linear-gradient(135deg, ${accent} 0%, #22d3ee 80%)`,
              WebkitBackgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 16px ${accent}66`,
            }}
          >
            {emotion}
          </div>
          {valence != null && arousal != null && (
            <div className="mt-2 flex items-baseline gap-4 text-[11px] tabular-nums">
              <span className="text-text-muted"><span className="text-text-faint uppercase tracking-wider mr-1">V</span><span className="text-text font-semibold">{valence.toFixed(2)}</span></span>
              <span className="text-text-muted"><span className="text-text-faint uppercase tracking-wider mr-1">A</span><span className="text-text font-semibold">{arousal.toFixed(2)}</span></span>
              {state?.emotion?.confidence != null && (
                <span className="text-text-muted"><span className="text-text-faint uppercase tracking-wider mr-1">conf</span><span className="text-text font-semibold">{state.emotion.confidence.toFixed(2)}</span></span>
              )}
            </div>
          )}
          {reason && <div className="mt-2 text-[11px] text-text-muted line-clamp-2">{reason}</div>}
          <div className="mt-auto pt-3 flex flex-wrap items-center gap-3 text-[10px] text-text-muted uppercase tracking-wider">
            {activity && <span><span className="text-text-faint">status</span> <span className="text-text">{activity}</span></span>}
            {phase && <span><span className="text-text-faint">phase</span> <span className="text-text">{phase}</span></span>}
            {tz && <span><span className="text-text-faint">tz</span> <span className="text-text">{tz}</span></span>}
          </div>
        </div>

        <div className="col-span-2 flex flex-col min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#22d3ee" }}>
            Current thought
          </div>
          <blockquote
            className="mt-2 flex-1 min-h-0 text-sm italic text-text leading-relaxed border-l-2 pl-3 overflow-y-auto scrollbar-none"
            style={{ borderColor: `${accent}66` }}
          >
            {thought ?? <span className="text-text-faint">thinking…</span>}
          </blockquote>
        </div>
      </div>
    </section>
  );
}

function LivePill({ connected }: { connected?: boolean }) {
  const live = !!connected;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
      style={{
        color: live ? "#22d3ee" : "#f43f5e",
        background: live ? "#22d3ee22" : "#f43f5e22",
        border: `1px solid ${live ? "#22d3ee77" : "#f43f5e77"}`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
        style={{ background: live ? "#22d3ee" : "#f43f5e", boxShadow: `0 0 6px ${live ? "#22d3ee" : "#f43f5e"}` }}
      />
      {live ? "CONNECTED" : "OFFLINE"}
    </span>
  );
}

/* Vertical KPI stack — 2 columns × 3 rows */
function VitalsStack({
  state, pending, className = "",
}: {
  state: StateResponse | null; pending: Pending | null; className?: string;
}) {
  const cost = state?.todayCostUsd;
  const daysLeft = state?.survival?.daysRemaining;
  const energy = state?.virtualBody?.energyReserves;
  const goalsCount = state?.activeGoals?.length ?? 0;
  const pendingCount = pending?.total ?? 0;
  const interestCount = state?.currentInterests?.length ?? 0;

  const items: Array<{ label: string; value: string | number; color: string }> = [
    { label: "Today $",  value: cost != null ? `$${cost.toFixed(2)}` : "—", color: "#38bdf8" },
    { label: "Survival", value: daysLeft != null ? `${daysLeft}d` : "—", color: daysLeft != null && daysLeft < 14 ? "#f43f5e" : "#22d3ee" },
    { label: "Energy",   value: energy != null ? `${Math.round(energy * 100)}%` : "—", color: "#fbbf24" },
    { label: "Goals",    value: goalsCount, color: "#a855f7" },
    { label: "Pending",  value: pendingCount, color: "#e879f9" },
    { label: "Interests", value: interestCount, color: "#f472b6" },
  ];

  return (
    <div className={["grid grid-cols-2 grid-rows-3 gap-2 auto-rows-fr", className].join(" ")}>
      {items.map(it => (
        <VitalTile key={it.label} {...it} />
      ))}
    </div>
  );
}

function VitalTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2 flex flex-col justify-between min-h-0"
      style={{
        background: `linear-gradient(180deg, ${color}12 0%, #0b1120cc 70%)`,
        borderColor: `${color}33`,
        boxShadow: `0 0 10px -8px ${color}66, 0 0 1px ${color}22 inset`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: `${color}bb` }}>{label}</div>
      <div
        className="text-2xl font-bold tabular-nums leading-none"
        style={{ color, textShadow: `0 0 10px ${color}55` }}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  Row B — scatter + drives + goals (vertical stack)             */
/* ============================================================= */

function EmotionScatter({ state, className = "" }: { state: StateResponse | null; className?: string }) {
  const valence = state?.emotion?.valence ?? null;
  const arousal = state?.emotion?.arousal ?? null;
  const reason = state?.emotion?.reason ?? null;
  const W = 100, H = 100, pad = 10;
  const toX = (v: number) => pad + ((v + 1) / 2) * (W - 2 * pad);
  const toY = (a: number) => (H - pad) - ((a + 1) / 2) * (H - 2 * pad);

  return (
    <div className={["rounded-xl border border-white/10 bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}>
      <div className="flex items-center shrink-0">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Emotion (V × A)</span>
        <span className="ml-auto text-[10px] text-text-faint tabular-nums">
          {valence != null && arousal != null ? `${valence.toFixed(2)} · ${arousal.toFixed(2)}` : "—"}
        </span>
      </div>
      <div className="flex-1 min-h-0 mt-1 flex items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="em-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0b1120" stopOpacity={0} />
            </radialGradient>
          </defs>
          <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="url(#em-bg)" stroke="#ffffff11" />
          <line x1={W / 2} y1={pad} x2={W / 2} y2={H - pad} stroke="#ffffff15" strokeDasharray="1 1" />
          <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#ffffff15" strokeDasharray="1 1" />
          <text x={W - pad - 2} y={pad + 3} fill="#94a3b8" fontSize="3" textAnchor="end">↑ +v</text>
          <text x={pad + 2}       y={pad + 3} fill="#94a3b8" fontSize="3">−v</text>
          <text x={pad + 2}       y={H - pad - 1} fill="#94a3b8" fontSize="3">↓ −v</text>
          <text x={W - pad - 2}   y={H - pad - 1} fill="#94a3b8" fontSize="3" textAnchor="end">+v</text>
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
      {reason && <div className="text-[10px] text-text-muted italic line-clamp-1 shrink-0 mt-1">&ldquo;{reason}&rdquo;</div>}
    </div>
  );
}

function DrivesBars({ drives, className = "" }: { drives: Record<string, number> | null; className?: string }) {
  const entries = drives ? Object.entries(drives) : [];
  return (
    <div className={["rounded-xl border border-white/10 bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}>
      <div className="flex items-center shrink-0 mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#fb7185", boxShadow: "0 0 8px #fb7185" }} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Drives</span>
        <Link href="/yuna/drives" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-xs">no drive data</div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-1.5">
          {entries.map(([k, v]) => {
            const pct = Math.max(0, Math.min(100, Math.round((v ?? 0) * 100)));
            const color = pct >= 80 ? "#f43f5e" : pct >= 60 ? "#fbbf24" : "#22d3ee";
            return (
              <li key={k} className="grid grid-cols-[72px_1fr_32px] items-center gap-2 text-[11px]">
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
                <span className="tabular-nums text-right" style={{ color }}>{pct}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActiveGoalsVertical({ goals, className = "" }: { goals: Goal[]; className?: string }) {
  return (
    <div className={["rounded-xl border border-white/10 bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}>
      <div className="flex items-center shrink-0 mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Active goals</span>
        <Link href="/yuna/goals" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {goals.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-xs">no active goals</div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-1.5">
          {goals.slice(0, 6).map(g => <GoalCard key={g.id} goal={g} />)}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const typeShort = goal.type === "long_term" ? "LONG" : goal.type === "mid_term" ? "MID" : goal.type === "short_term" ? "SHORT" : "";
  const typeColor = typeShort === "LONG" ? "#a855f7" : typeShort === "MID" ? "#22d3ee" : "#fbbf24";
  return (
    <li
      className="rounded-md border px-2.5 py-1.5 flex items-start gap-2"
      style={{ background: `linear-gradient(90deg, ${typeColor}10, transparent 70%)`, borderColor: `${typeColor}33` }}
    >
      <span
        className="text-[9px] font-mono font-bold uppercase tracking-widest px-1 py-0.5 rounded shrink-0 mt-0.5"
        style={{ color: typeColor, background: `${typeColor}22` }}
      >
        {typeShort || "GOAL"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-text line-clamp-2 leading-snug">{goal.content}</div>
        {goal.progress && <div className="text-[10px] text-text-muted line-clamp-1 mt-0.5">{goal.progress}</div>}
      </div>
      <span className="text-text-faint font-mono text-[9px] shrink-0">#{goal.id}</span>
    </li>
  );
}

/* ============================================================= */
/*  Row C — tags + rules + hypotheses + cycle                     */
/* ============================================================= */

function InterestsPanel({ interests, className = "" }: { interests: Interest[]; className?: string }) {
  return (
    <div className={["rounded-xl border bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}
         style={{ borderColor: "#f472b622" }}>
      <div className="flex items-center shrink-0 mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#f472b6", boxShadow: "0 0 8px #f472b6" }} />
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#f472b6cc" }}>Interests</span>
        <Link href="/yuna/interests-engagement" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {interests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-xs">none</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-wrap gap-1 content-start">
          {interests.slice(0, 40).map((t, i) => {
            const w = t.weight ?? 0;
            const intensity = Math.max(0.3, Math.min(1, w));
            const alphaBg = Math.round(intensity * 34).toString(16).padStart(2, "0");
            const alphaBorder = Math.round(intensity * 120).toString(16).padStart(2, "0");
            return (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded border tabular-nums"
                style={{
                  borderColor: `#f472b6${alphaBorder}`,
                  color: "#f472b6",
                  background: `#f472b6${alphaBg}`,
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
    </div>
  );
}

function RulesPanel({ rules, className = "" }: { rules: Rule[]; className?: string }) {
  return (
    <div className={["rounded-xl border bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}
         style={{ borderColor: "#fbbf2422" }}>
      <div className="flex items-center shrink-0 mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#fbbf24", boxShadow: "0 0 8px #fbbf24" }} />
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#fbbf24cc" }}>Rules</span>
        <Link href="/yuna/immediate-rules" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {rules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-xs">none</div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-1">
          {rules.slice(0, 10).map(r => (
            <li key={r.id} className="text-[11px] border-l-2 pl-2" style={{ borderColor: "#fbbf2455" }}>
              <div className="text-text line-clamp-2">{r.rule}</div>
              {r.reason && <div className="text-text-faint text-[10px] line-clamp-1">{r.reason}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HypothesesPanel({ hypos, className = "" }: { hypos: Hypothesis[]; className?: string }) {
  return (
    <div className={["rounded-xl border bg-panel px-3 py-2.5 flex flex-col min-h-0", className].join(" ")}
         style={{ borderColor: "#38bdf822" }}>
      <div className="flex items-center shrink-0 mb-2">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#38bdf8", boxShadow: "0 0 8px #38bdf8" }} />
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#38bdf8cc" }}>Hypotheses</span>
        <Link href="/yuna/hypotheses" className="ml-auto text-[10px] text-accent hover:underline">all →</Link>
      </div>
      {hypos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-faint text-xs">none</div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-none space-y-1">
          {hypos.slice(0, 10).map(h => (
            <li key={h.id} className="text-[11px] flex items-start gap-2">
              <span className="text-text-faint font-mono w-6 shrink-0">#{h.id}</span>
              <span className="text-text line-clamp-2 flex-1">{h.content}</span>
              {h.confidence != null && (
                <span className="tabular-nums text-[10px] shrink-0" style={{ color: "#38bdf8" }}>
                  {(h.confidence * 100).toFixed(0)}%
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CycleColumn({ state, className = "" }: { state: StateResponse | null; className?: string }) {
  const cycle = state?.cycleBlockProgress ?? null;
  const act = state?.actBlockProgress ?? null;
  return (
    <div className={["rounded-xl border bg-panel px-3 py-2.5 flex flex-col gap-2 min-h-0", className].join(" ")}
         style={{ borderColor: "#e879f922" }}>
      <div className="flex items-center shrink-0">
        <span className="inline-block h-1 w-1 rounded-full mr-2" style={{ background: "#e879f9", boxShadow: "0 0 8px #e879f9" }} />
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#e879f9cc" }}>Cycle</span>
        <Link href="/yuna/cycle-blocks" className="ml-auto text-[10px] text-accent hover:underline">→</Link>
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2 justify-center">
        <ProgressMini label="Cycle" block={cycle} color="#e879f9" />
        <ProgressMini label="Act"   block={act}   color="#22d3ee" />
      </div>
    </div>
  );
}

function ProgressMini({ label, block, color }: { label: string; block: BlockProgress | null; color: string }) {
  const pct = Math.max(0, Math.min(100, (block?.progress ?? 0) * 100));
  const total = block?.total ?? null;
  const index = block?.index ?? null;
  const remainingMin = block?.remainingMs != null ? Math.round(block.remainingMs / 60_000) : null;

  return (
    <div>
      <div className="flex items-baseline gap-1 text-[9px]">
        <span className="uppercase tracking-wider" style={{ color: `${color}cc` }}>{label}</span>
        <span className="text-text truncate flex-1 text-[10px]">{block?.name ?? ""}</span>
        <span className="text-text-faint tabular-nums">
          {index != null && total != null ? `${index + 1}/${total}` : ""}
        </span>
      </div>
      <div className="mt-1 h-1 bg-white/5 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}aa, ${color})`,
            boxShadow: `0 0 4px ${color}88`,
            transition: "width 500ms ease",
          }}
        />
      </div>
      <div className="mt-0.5 flex items-center text-[9px] text-text-faint tabular-nums">
        <span>{pct.toFixed(0)}%</span>
        <span className="ml-auto">{remainingMin != null ? `${remainingMin}m` : ""}</span>
      </div>
    </div>
  );
}
