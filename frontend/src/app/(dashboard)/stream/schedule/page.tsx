"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/components/use-api";
import { modal } from "@/components/modal";
import { WeekView } from "@/components/week-view";
import {
  type Schedule, type Program, DAYS,
  fmtTime, parseTime, fmtDate, slotColor, slotInstanceForDate,
} from "@/components/schedule-utils";

type ViewMode = "month" | "week";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

interface ScheduleFormValues {
  channel: "ja" | "en";
  repeatType: "once" | "daily" | "weekly";
  repeatDays: number[];
  date: string | null;     // once 用 (YYYY-MM-DD, timezone local)
  startTime: string;       // "HH:MM"
  endTime: string;         // "HH:MM"
  timezone: string;
  program: string;
  label: string;
  title: string;
}

const DEFAULT_TZ = "Asia/Tokyo";
const TIMEZONE_OPTIONS = ["Asia/Tokyo", "America/New_York", "UTC"];

function defaultForm(programs: Program[], date: string | null): ScheduleFormValues {
  return {
    channel: "ja",
    repeatType: date ? "once" : "weekly",
    repeatDays: [],
    date,
    startTime: "19:00",
    endTime: "22:00",
    timezone: DEFAULT_TZ,
    program: programs[0]?.name ?? "chat:golden",
    label: "",
    title: "",
  };
}

/** ISO TIMESTAMPTZ → 指定 tz の "YYYY-MM-DD" / "HH:MM" を抽出。 */
function splitInTz(iso: string, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hh = get("hour"); if (hh === "24") hh = "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hh}:${get("minute")}`,
  };
}

/** "YYYY-MM-DD" + "HH:MM" を timezone 上の wall clock として ISO 化 (offset 補正)。 */
function composeIso(dateStr: string, timeStr: string, tz: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(naive));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  let hour = get("hour"); if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  const offset = asUtc - naive;
  return new Date(naive - offset).toISOString();
}

function addDayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return fmtDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formFromSchedule(s: Schedule): ScheduleFormValues {
  const tz = s.timezone || DEFAULT_TZ;
  if (s.repeat_type === "once" && s.starts_at && s.ends_at) {
    const start = splitInTz(s.starts_at, tz);
    const end = splitInTz(s.ends_at, tz);
    return {
      channel: s.channel as "ja" | "en",
      repeatType: "once",
      repeatDays: [],
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      timezone: tz,
      program: s.program,
      label: s.label,
      title: s.title,
    };
  }
  return {
    channel: s.channel as "ja" | "en",
    repeatType: s.repeat_type,
    repeatDays: s.repeat_days ?? [],
    date: null,
    startTime: (s.start_time ?? "19:00").slice(0, 5),
    endTime: (s.end_time ?? "22:00").slice(0, 5),
    timezone: tz,
    program: s.program,
    label: s.label,
    title: s.title,
  };
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  const load = useCallback(async () => {
    try {
      const [sData, pData] = await Promise.all([
        apiFetch<{ schedules: Schedule[] }>("/schedules"),
        apiFetch<{ programs: Program[] }>("/programs"),
      ]);
      setSchedules(sData.schedules);
      setPrograms(pData.programs);
    } catch { /* toast already shown */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openForm = (initial: ScheduleFormValues, schedule: Schedule | null) => {
    modal.open({
      title: schedule ? "Edit schedule" : "New schedule",
      size: "md",
      content: (
        <ScheduleForm
          initial={initial}
          schedule={schedule}
          programs={programs}
          onSaved={() => { modal.close(); void load(); }}
          onDeleted={() => { modal.close(); void load(); }}
        />
      ),
    });
  };

  const openAdd = (date: string | null) => openForm(defaultForm(programs, date), null);

  const openAddWithTime = (date: string, startMinutes: number, endMinutes: number) => {
    openForm(
      {
        ...defaultForm(programs, date),
        repeatType: "once",
        startTime: fmtTime(startMinutes),
        endTime: fmtTime(endMinutes % 1440),
      },
      null,
    );
  };

  const openEdit = (s: Schedule) => openForm(formFromSchedule(s), s);

  // Month nav
  const prevMonth = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); };

  // Week nav
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const thisWeek = () => setWeekStart(getWeekStart(new Date()));

  const days = daysInMonth(year, month);
  const startDay = firstDayOfWeek(year, month);
  const today = fmtDate(new Date());

  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekLabel = `${fmtDate(weekStart).slice(5)} - ${fmtDate(weekEndDate).slice(5)}`;

  const renderSlot = (s: Schedule, date: string) => {
    const inst = slotInstanceForDate(s, date);
    return (
      <div
        key={s.id}
        onClick={(e) => { e.stopPropagation(); openEdit(s); }}
        className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer transition hover:brightness-125 ${slotColor(s)}`}
      >
        {inst ? fmtTime(inst.startMin) : "??:??"} {s.label || s.program}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <h2 className="text-xl font-semibold">Schedule</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-panel border border-border rounded-lg p-0.5">
            <button onClick={() => setViewMode("week")}
              className={`px-3 py-1 rounded text-sm transition ${viewMode === "week" ? "bg-panel-hover text-text" : "text-text-muted hover:text-text"}`}>
              Week
            </button>
            <button onClick={() => setViewMode("month")}
              className={`px-3 py-1 rounded text-sm transition ${viewMode === "month" ? "bg-panel-hover text-text" : "text-text-muted hover:text-text"}`}>
              Month
            </button>
          </div>
          <button onClick={() => openAdd(null)}
            className="px-3 py-1.5 bg-panel border border-border rounded text-sm hover:bg-panel-hover transition">
            + New
          </button>
        </div>
      </div>

      {/* Calendar / Week View */}
      <div className="panel p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {viewMode === "week" ? (
          <>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <button onClick={prevWeek} className="text-text-muted hover:text-text px-2 py-1">&lt;</button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-medium">{weekLabel}</h3>
                <button onClick={thisWeek} className="text-xs text-text-muted hover:text-text border border-border rounded px-2 py-0.5">Today</button>
              </div>
              <button onClick={nextWeek} className="text-text-muted hover:text-text px-2 py-1">&gt;</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
              <WeekView
                weekStart={weekStart}
                schedules={schedules}
                onClickSlot={openEdit}
                onClickDate={(d) => openAdd(d)}
                onDragCreate={openAddWithTime}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <button onClick={prevMonth} className="text-text-muted hover:text-text px-2 py-1">&lt;</button>
              <h3 className="text-lg font-medium">{year}/{String(month + 1).padStart(2, "0")}</h3>
              <button onClick={nextMonth} className="text-text-muted hover:text-text px-2 py-1">&gt;</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none grid grid-cols-7 gap-px">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs text-text-muted py-2">{d}</div>
              ))}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`e-${i}`} className="min-h-24" />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySchedules = schedules.filter((s) => slotInstanceForDate(s, date) !== null);
                const isToday = date === today;
                return (
                  <div key={day} onClick={() => openAdd(date)}
                    className={`min-h-24 border border-border p-1 cursor-pointer transition hover:bg-panel/50 ${isToday ? "border-border-strong bg-panel/30" : ""}`}>
                    <div className={`text-xs mb-1 ${isToday ? "text-text font-bold" : "text-text-muted"}`}>{day}</div>
                    <div className="space-y-0.5">{daySchedules.map((s) => renderSlot(s, date))}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal content: schedule form ──

interface ScheduleFormProps {
  initial: ScheduleFormValues;
  schedule: Schedule | null;
  programs: Program[];
  onSaved: () => void;
  onDeleted: () => void;
}

/** info:morning は 2 時間枠固定 (config/cognition 都合)。editor もその前提で振る舞う。 */
const MORNING_PROGRAM = "info:morning";
const MORNING_DURATION_MIN = 120;
const MIN_MORNING_DURATION_MIN = 60;

function addMinutes(hhmm: string, deltaMin: number): string {
  const total = parseTime(hhmm) + deltaMin;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function ScheduleForm({ initial, schedule, programs, onSaved, onDeleted }: ScheduleFormProps) {
  const [form, setForm] = useState<ScheduleFormValues>(() => {
    if (initial.program === MORNING_PROGRAM) {
      return { ...initial, endTime: addMinutes(initial.startTime, MORNING_DURATION_MIN) };
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const isMorning = form.program === MORNING_PROGRAM;

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(day)
        ? f.repeatDays.filter((d) => d !== day)
        : [...f.repeatDays, day].sort(),
    }));
  };

  const handleStartChange = (v: string) => {
    setForm((f) =>
      f.program === MORNING_PROGRAM
        ? { ...f, startTime: v, endTime: addMinutes(v, MORNING_DURATION_MIN) }
        : { ...f, startTime: v },
    );
  };

  const handleProgramChange = (next: string) => {
    setForm((f) =>
      next === MORNING_PROGRAM
        ? { ...f, program: next, endTime: addMinutes(f.startTime, MORNING_DURATION_MIN) }
        : { ...f, program: next },
    );
  };

  const handleSave = async () => {
    setError(null);
    const startMin = parseTime(form.startTime);
    const endMin = parseTime(form.endTime);
    const duration = endMin > startMin
      ? endMin - startMin
      : endMin < startMin
        ? endMin + 1440 - startMin
        : 0;

    if (form.program === MORNING_PROGRAM && duration < MIN_MORNING_DURATION_MIN) {
      setError(`${MORNING_PROGRAM} は最低 1 時間必要です (現在 ${duration} 分)`);
      return;
    }

    let body: Record<string, unknown>;
    if (form.repeatType === "once") {
      if (!form.date) {
        setError("once schedule requires date");
        return;
      }
      const startsAt = composeIso(form.date, form.startTime, form.timezone);
      // overnight 対応: end < start なら翌日扱い
      const endDate = endMin <= startMin ? addDayISO(form.date) : form.date;
      const endsAt = composeIso(endDate, form.endTime, form.timezone);
      body = {
        channel: form.channel,
        repeatType: "once",
        startsAt,
        endsAt,
        timezone: form.timezone,
        program: form.program,
        label: form.label,
        title: form.title,
      };
    } else {
      body = {
        channel: form.channel,
        repeatType: form.repeatType,
        repeatDays: form.repeatType === "weekly" ? form.repeatDays : [],
        startTime: form.startTime,
        endTime: form.endTime,
        timezone: form.timezone,
        program: form.program,
        label: form.label,
        title: form.title,
      };
    }
    try {
      if (schedule) {
        await apiFetch(`/schedules/${schedule.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/schedules", { method: "POST", body: JSON.stringify(body) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return;
    }
    onSaved();
  };

  const requestDelete = () => {
    if (!schedule) return;
    if (schedule.repeat_type === "once") {
      void hardDelete(schedule.id, onDeleted);
      return;
    }
    modal.open({
      title: "Delete recurring schedule",
      size: "sm",
      content: (
        <DeleteRecurringContent
          schedule={schedule}
          onDone={onDeleted}
        />
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel">
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as "ja" | "en" })}
            className={FIELD_CLASS}>
            <option value="ja">JA</option>
            <option value="en">EN</option>
          </select>
        </Field>
        <Field label="Repeat">
          <select value={form.repeatType} onChange={(e) => setForm({ ...form, repeatType: e.target.value as ScheduleFormValues["repeatType"] })}
            className={FIELD_CLASS}>
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
      </div>

      {form.repeatType === "weekly" && (
        <Field label="Days">
          <div className="flex gap-1">
            {DAYS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`px-2.5 py-1 rounded text-xs transition ${form.repeatDays.includes(i) ? "bg-accent text-bg" : "bg-panel text-text-muted hover:bg-panel-hover"}`}>
                {d}
              </button>
            ))}
          </div>
        </Field>
      )}

      {form.repeatType === "once" && (
        <Field label="Date">
          <input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value || null })}
            className={FIELD_CLASS} />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Start">
          <input type="time" value={form.startTime} onChange={(e) => handleStartChange(e.target.value)}
            className={FIELD_CLASS} />
        </Field>
        <Field label={isMorning ? "End (start + 2h, 固定)" : "End"}>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            disabled={isMorning}
            title={isMorning ? `${MORNING_PROGRAM} は 2 時間枠固定` : undefined}
            className={`${FIELD_CLASS} ${isMorning ? "opacity-60 cursor-not-allowed" : ""}`}
          />
        </Field>
        <Field label="Timezone">
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className={FIELD_CLASS}>
            {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Program">
        <select value={form.program} onChange={(e) => handleProgramChange(e.target.value)}
          className={FIELD_CLASS}>
          {programs.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </Field>

      <Field label="Label">
        <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="e.g. ゴールデンタイム" className={FIELD_CLASS} />
      </Field>

      <Field label="Title">
        <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. 夜のまったり雑談" className={FIELD_CLASS} />
      </Field>

      {error && (
        <div className="text-xs text-[color:var(--color-danger)] px-2 py-1.5 rounded bg-[color:var(--color-danger)]/10 border border-[color:var(--color-danger)]/30">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {schedule && (
          <button
            onClick={requestDelete}
            className="px-3 py-2 text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10 rounded transition"
          >
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition">
          Cancel
        </button>
        <button onClick={handleSave}
          className="px-4 py-2 bg-accent text-bg rounded-md font-medium text-sm hover:bg-accent-hover transition">
          {schedule ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}

// ── Modal content: recurring delete choice ──

function DeleteRecurringContent({ schedule, onDone }: { schedule: Schedule; onDone: () => void }) {
  const stopFromToday = async () => {
    try {
      await apiFetch(`/schedules/${schedule.id}`, {
        method: "PUT",
        body: JSON.stringify({ endsOn: yesterdayISO() }),
      });
    } catch { return; }
    onDone();
  };

  const removeAll = async () => {
    try {
      await apiFetch(`/schedules/${schedule.id}`, { method: "DELETE" });
    } catch { return; }
    onDone();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted leading-relaxed">
        &quot;{schedule.label}&quot; は繰り返しスケジュールです。
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={stopFromToday}
          className="text-left px-4 py-3 rounded-lg border border-border hover:bg-panel-hover transition"
        >
          <div className="text-sm font-medium text-text">今日から先を削除</div>
          <div className="text-xs text-text-muted mt-0.5">過去の配信履歴は残す（昨日まで有効）</div>
        </button>
        <button
          onClick={removeAll}
          className="text-left px-4 py-3 rounded-lg border border-[color:var(--color-danger)]/30 hover:bg-[color:var(--color-danger)]/10 transition"
        >
          <div className="text-sm font-medium text-[color:var(--color-danger)]">全て削除</div>
          <div className="text-xs text-text-muted mt-0.5">過去のインスタンスも含めて完全削除</div>
        </button>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => modal.close()}
          className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

async function hardDelete(id: number, onDone: () => void) {
  try {
    await apiFetch(`/schedules/${id}`, { method: "DELETE" });
  } catch { return; }
  onDone();
}

// ── Small helpers ──

const FIELD_CLASS =
  "w-full px-3 py-1.5 bg-panel border border-border rounded text-sm focus:outline-none focus:border-accent transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
