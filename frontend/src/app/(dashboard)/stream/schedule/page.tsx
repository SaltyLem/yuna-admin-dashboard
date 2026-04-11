"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/components/use-api";
import { WeekView } from "@/components/week-view";
import {
  type Schedule, type Program, DAYS,
  fmtTime, parseTime, fmtDate, matchesDate, slotColor,
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

function repeatLabel(s: Schedule): string {
  if (s.repeat_type === "once") return s.date ?? "";
  if (s.repeat_type === "daily") return "Every day";
  return s.repeat_days.map((d) => DAYS[d]).join(", ");
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    channel: "ja",
    repeatType: "weekly" as "once" | "daily" | "weekly",
    repeatDays: [] as number[],
    date: null as string | null,
    startTime: "19:00",
    endTime: "22:00",
    program: "chat:golden",
    label: "",
    title: "",
  });

  const load = useCallback(async () => {
    const [sData, pData] = await Promise.all([
      apiFetch<{ schedules: Schedule[] }>("/schedules"),
      apiFetch<{ programs: Program[] }>("/programs"),
    ]);
    setSchedules(sData.schedules);
    setPrograms(pData.programs);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAdd = (date: string | null) => {
    setEditingId(null);
    setForm({
      channel: "ja",
      repeatType: date ? "once" : "weekly",
      repeatDays: [],
      date,
      startTime: "19:00",
      endTime: "22:00",
      program: programs[0]?.name ?? "chat:golden",
      label: "",
      title: "",
    });
    setShowModal(true);
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    setForm({
      channel: s.channel,
      repeatType: s.repeat_type,
      repeatDays: s.repeat_days ?? [],
      date: s.date,
      startTime: fmtTime(s.start_minutes),
      endTime: fmtTime(s.end_minutes),
      program: s.program,
      label: s.label,
      title: s.title,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const body = {
      channel: form.channel,
      repeatType: form.repeatType,
      repeatDays: form.repeatType === "weekly" ? form.repeatDays : [],
      date: form.repeatType === "once" ? form.date : null,
      startMinutes: parseTime(form.startTime),
      endMinutes: parseTime(form.endTime),
      program: form.program,
      label: form.label,
      title: form.title,
    };
    if (editingId) {
      await apiFetch(`/schedules/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch("/schedules", { method: "POST", body: JSON.stringify(body) });
    }
    setShowModal(false);
    await load();
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/schedules/${id}`, { method: "DELETE" });
    await load();
  };

  const handleToggle = async (s: Schedule) => {
    await apiFetch(`/schedules/${s.id}`, { method: "PUT", body: JSON.stringify({ enabled: !s.enabled }) });
    await load();
  };

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(day) ? f.repeatDays.filter((d) => d !== day) : [...f.repeatDays, day].sort(),
    }));
  };

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
  const repeating = schedules.filter((s) => s.repeat_type !== "once");

  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekLabel = `${fmtDate(weekStart).slice(5)} - ${fmtDate(weekEndDate).slice(5)}`;

  const renderSlot = (s: Schedule) => (
    <div
      key={s.id}
      onClick={(e) => { e.stopPropagation(); openEdit(s); }}
      className={`text-xs px-1 py-0.5 rounded truncate cursor-pointer transition hover:brightness-125 ${slotColor(s)}`}
    >
      {fmtTime(s.start_minutes)} {s.label || s.program}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Schedule</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            <button onClick={() => setViewMode("week")}
              className={`px-3 py-1 rounded text-sm transition ${viewMode === "week" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}>
              Week
            </button>
            <button onClick={() => setViewMode("month")}
              className={`px-3 py-1 rounded text-sm transition ${viewMode === "month" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}>
              Month
            </button>
          </div>
          <button onClick={() => openAdd(null)}
            className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition">
            + New
          </button>
        </div>
      </div>

      {/* Recurring schedules */}
      {repeating.length > 0 && (
        <div className="mb-6 bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-neutral-400 mb-3">Recurring</h3>
          <div className="space-y-2">
            {repeating.map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className={`w-6 font-medium ${s.channel === "ja" ? "text-red-400" : "text-blue-400"}`}>{s.channel.toUpperCase()}</span>
                <span className="text-neutral-300 w-28">{fmtTime(s.start_minutes)} - {fmtTime(s.end_minutes)}</span>
                <span className="text-neutral-300 flex-1">{s.label}</span>
                <span className="text-neutral-500 text-xs">{repeatLabel(s)}</span>
                <button onClick={() => handleToggle(s)} className={`w-8 text-center ${s.enabled ? "text-green-400" : "text-neutral-600"}`}>
                  {s.enabled ? "ON" : "OFF"}
                </button>
                <button onClick={() => openEdit(s)} className="text-neutral-500 hover:text-white">Edit</button>
                <button onClick={() => handleDelete(s.id)} className="text-neutral-500 hover:text-red-400">Del</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar / Week View */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        {viewMode === "week" ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevWeek} className="text-neutral-400 hover:text-white px-2 py-1">&lt;</button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-medium">{weekLabel}</h3>
                <button onClick={thisWeek} className="text-xs text-neutral-500 hover:text-white border border-neutral-700 rounded px-2 py-0.5">Today</button>
              </div>
              <button onClick={nextWeek} className="text-neutral-400 hover:text-white px-2 py-1">&gt;</button>
            </div>
            <WeekView
              weekStart={weekStart}
              schedules={schedules}
              onClickSlot={openEdit}
              onClickDate={(d) => openAdd(d)}
            />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="text-neutral-400 hover:text-white px-2 py-1">&lt;</button>
              <h3 className="text-lg font-medium">{year}/{String(month + 1).padStart(2, "0")}</h3>
              <button onClick={nextMonth} className="text-neutral-400 hover:text-white px-2 py-1">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-px">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs text-neutral-500 py-2">{d}</div>
              ))}
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`e-${i}`} className="min-h-24" />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const day = i + 1;
                const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySchedules = schedules.filter((s) => matchesDate(s, date));
                const isToday = date === today;
                return (
                  <div key={day} onClick={() => openAdd(date)}
                    className={`min-h-24 border border-neutral-800 p-1 cursor-pointer transition hover:bg-neutral-800/50 ${isToday ? "border-neutral-600 bg-neutral-800/30" : ""}`}>
                    <div className={`text-xs mb-1 ${isToday ? "text-white font-bold" : "text-neutral-500"}`}>{day}</div>
                    <div className="space-y-0.5">{daySchedules.map(renderSlot)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-[420px] space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{editingId ? "Edit Schedule" : "Add Schedule"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Channel</label>
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm">
                  <option value="ja">JA</option>
                  <option value="en">EN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Repeat</label>
                <select value={form.repeatType} onChange={(e) => setForm({ ...form, repeatType: e.target.value as "once" | "daily" | "weekly" })}
                  className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm">
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            {form.repeatType === "weekly" && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Days</label>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button key={i} type="button" onClick={() => toggleDay(i)}
                      className={`px-2.5 py-1 rounded text-xs transition ${form.repeatDays.includes(i) ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.repeatType === "once" && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Date</label>
                <input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value || null })}
                  className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Start</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">End</label>
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Program</label>
              <select value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm">
                {programs.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Label</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. ゴールデンタイム"
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm" />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. 夜のまったり雑談"
                className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm" />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave}
                className="flex-1 py-2 bg-white text-black rounded font-medium text-sm hover:bg-neutral-200 transition">
                {editingId ? "Update" : "Create"}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm hover:bg-neutral-700 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
