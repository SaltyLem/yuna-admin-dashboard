/**
 * stream_schedules row shape (admin DB).
 *
 * 旧 start_minutes/end_minutes/date 方式は廃止。
 *   once     : starts_at / ends_at に絶対 TIMESTAMPTZ を入れる
 *   daily/weekly : start_time / end_time (HH:MM[:SS]) + timezone を入れ、
 *                  対象日に対して per-date materialize する
 * end_time <= start_time は overnight。
 */
export interface Schedule {
  id: number;
  channel: string;
  repeat_type: "once" | "daily" | "weekly";
  repeat_days: number[];
  /** Last valid date for recurring schedules. NULL = no end. */
  ends_on: string | null;
  starts_at: string | null;   // ISO, once 専用
  ends_at: string | null;     // ISO, once 専用
  start_time: string | null;  // "HH:MM:SS", recurring 専用
  end_time: string | null;    // "HH:MM:SS", recurring 専用
  timezone: string;
  program: string;
  label: string;
  title: string;
  enabled: boolean;
}

export interface Program {
  id: number;
  name: string;
  overlay_path: string;
  description: string;
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "HH:MM" / "HH:MM:SS" → minutes-of-day (0-1439). 不正値は 0。 */
export function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return ((h ?? 0) % 24) * 60 + (m ?? 0);
}

export function fmtTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * tz の暦日 dateStr における slot の (startMin, endMin, crossesMidnight) を返す。
 * 該当日に出現しないなら null。endMin が >1440 なら overnight (翌日へ繰越)。
 */
export interface SlotInstance {
  startMin: number;
  endMin: number;          // 0..1440 (=日末) or >1440 for overnight
  crossesMidnight: boolean;
}
export function slotInstanceForDate(s: Schedule, dateStr: string): SlotInstance | null {
  if (!s.enabled) return null;
  if (s.ends_on && s.ends_on.slice(0, 10) < dateStr) return null;

  if (s.repeat_type === "once") {
    if (!s.starts_at || !s.ends_at) return null;
    const tz = s.timezone || "Asia/Tokyo";
    const startInTz = formatInTz(s.starts_at, tz);
    if (startInTz.date !== dateStr) return null;
    const endInTz = formatInTz(s.ends_at, tz);
    const startMin = startInTz.h * 60 + startInTz.m;
    // ends_at が翌日 (UTC上) なら endMin は >1440
    const dayDelta = isoDateDiffDays(startInTz.date, endInTz.date);
    const endMin = dayDelta * 1440 + endInTz.h * 60 + endInTz.m;
    return { startMin, endMin, crossesMidnight: dayDelta > 0 || endMin <= startMin };
  }

  // daily / weekly
  if (s.repeat_type === "weekly") {
    const dow = new Date(dateStr + "T00:00:00").getDay();
    if (!s.repeat_days.includes(dow)) return null;
  }
  if (!s.start_time || !s.end_time) return null;
  const startMin = timeToMinutes(s.start_time);
  const endMinSameDay = timeToMinutes(s.end_time);
  const crosses = endMinSameDay <= startMin;
  const endMin = crosses ? endMinSameDay + 1440 : endMinSameDay;
  return { startMin, endMin, crossesMidnight: crosses };
}

function formatInTz(iso: string, tz: string): { date: string; h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10); if (hour === 24) hour = 0;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    h: hour,
    m: parseInt(get("minute"), 10),
  };
}

function isoDateDiffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Calendar セル用: その date に slot が出現するか (時刻ずらし不要)。 */
export function matchesDate(s: Schedule, date: string): boolean {
  return slotInstanceForDate(s, date) !== null;
}

export function slotColor(s: Schedule): string {
  if (!s.enabled) return "bg-panel-2 text-text-muted line-through";
  return s.channel === "ja" ? "bg-red-900/40 text-red-300" : "bg-blue-900/40 text-blue-300";
}
