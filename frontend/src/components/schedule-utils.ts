export interface Schedule {
  id: number;
  channel: string;
  repeat_type: "once" | "daily" | "weekly";
  repeat_days: number[];
  date: string | null;
  start_minutes: number;
  end_minutes: number;
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

export function matchesDate(s: Schedule, date: string): boolean {
  if (!s.enabled) return false;
  if (s.repeat_type === "once") return s.date === date;
  if (s.repeat_type === "daily") return true;
  if (s.repeat_type === "weekly") {
    const dow = new Date(date + "T00:00:00").getDay();
    return s.repeat_days.includes(dow);
  }
  return false;
}

export function slotColor(s: Schedule): string {
  if (!s.enabled) return "bg-neutral-800 text-neutral-500 line-through";
  return s.channel === "ja" ? "bg-red-900/40 text-red-300" : "bg-blue-900/40 text-blue-300";
}
