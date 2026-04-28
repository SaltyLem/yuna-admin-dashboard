"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken } from "@/components/use-api";

type Channel = "ja" | "en";
const CHANNELS: Channel[] = ["ja", "en"];
const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

interface ScheduleItem {
  channel: Channel;
  date: string;        // YYYY-MM-DD
  image_url: string;
  source: string;
  updated_at: string;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayJst(): Date {
  return new Date(Date.now() + 9 * 60 * 60_000);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export default function ThumbnailCalendarPage(): React.JSX.Element {
  const today = useMemo(() => {
    const j = todayJst();
    return new Date(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
  }, []);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(todayJst()));
  const [items, setItems] = useState<Record<string, ScheduleItem>>({});
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ date: string; channel: Channel } | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = addMonths(monthStart, 1);
  const keyOf = (date: string, channel: Channel): string => `${channel}:${date}`;

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: ScheduleItem[] }>(
        `/stream/youtube/thumbnail-schedule?from=${ymd(monthStart)}&to=${ymd(monthEnd)}`,
        { silent: true },
      );
      const map: Record<string, ScheduleItem> = {};
      for (const it of data.items) map[keyOf(it.date, it.channel)] = it;
      setItems(map);
    } catch (err) {
      console.error("load failed", err);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { void reload(); }, [reload]);

  // Calendar grid: weeks × 7 days, leading/trailing days from prev/next month grayed.
  const cells = useMemo(() => {
    const firstDow = monthStart.getDay();           // 0 = Sun
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - firstDow);
    const arr: { date: Date; inMonth: boolean; iso: string }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      arr.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth(), iso: ymd(d) });
    }
    return arr;
  }, [monthStart]);

  return (
    <div className="p-6 max-w-6xl mx-auto text-zinc-100">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Thumbnail Calendar</h1>
        <a href="/stream/youtube-slot" className="text-cyan-400 underline text-sm">← Slot Manager</a>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        日付ごとに ja/en の完成サムネ PNG を予約。当日 04:00 JST の自動 switch 時に予約があれば、そのまま YouTube に upload (render skip)。
      </p>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setCursor(addMonths(cursor, -1))} className={navBtn}>← Prev</button>
        <div className="text-lg font-bold">
          {cursor.getFullYear()}年 {cursor.getMonth() + 1}月
        </div>
        <button onClick={() => setCursor(addMonths(cursor, 1))} className={navBtn}>Next →</button>
        <button onClick={() => setCursor(startOfMonth(todayJst()))} className={navBtn}>Today</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-zinc-500 mb-1">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
          <div key={d} className="text-center font-bold py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const isToday = c.iso === ymd(today);
          const isPast = c.date < today && !isToday;
          const ja = items[keyOf(c.iso, "ja")];
          const en = items[keyOf(c.iso, "en")];
          return (
            <div
              key={c.iso}
              className={`relative rounded border p-1 min-h-[120px] ${
                c.inMonth ? "bg-zinc-900 border-zinc-700" : "bg-zinc-950 border-zinc-800 opacity-40"
              } ${isToday ? "ring-2 ring-cyan-500" : ""} ${isPast ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-xs font-bold ${
                  c.date.getDay() === 0 ? "text-rose-400" :
                  c.date.getDay() === 6 ? "text-cyan-400" : "text-zinc-300"
                }`}>{c.date.getDate()}</div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {CHANNELS.map((ch) => {
                  const item = ch === "ja" ? ja : en;
                  return (
                    <button
                      key={ch}
                      onClick={() => setModal({ date: c.iso, channel: ch })}
                      className={`relative rounded border h-12 flex items-center justify-center text-[10px] font-bold ${
                        item ? "border-emerald-500" : "border-zinc-700 hover:border-zinc-500"
                      }`}
                      style={item ? {
                        backgroundImage: `url(${item.image_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      } : undefined}
                    >
                      <span className={`absolute top-0 left-0.5 ${
                        ch === "ja" ? "text-cyan-300" : "text-fuchsia-300"
                      }`}>{ch.toUpperCase()}</span>
                      {!item && <span className="text-zinc-600">+</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <ScheduleModal
          date={modal.date}
          channel={modal.channel}
          existing={items[keyOf(modal.date, modal.channel)]}
          onClose={() => setModal(null)}
          onSaved={async () => { await reload(); setModal(null); }}
          busy={busy}
          setBusy={setBusy}
        />
      )}
    </div>
  );
}

const navBtn = "px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded";

// ─────────────────────────── Modal ───────────────────────────

interface ModalProps {
  date: string;
  channel: Channel;
  existing?: ScheduleItem;
  onClose: () => void;
  onSaved: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}

function ScheduleModal({ date, channel, existing, onClose, onSaved, busy, setBusy }: ModalProps): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const onPick = useCallback((f: File | null) => {
    setErr("");
    if (!f) { setFile(null); setPreview(null); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      setErr("PNG / JPEG / WEBP のみ");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setErr("8MB 以下にしてください");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API_URL}/stream/youtube/thumbnail-schedule/${date}/${channel}`, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          Authorization: `Bearer ${getToken()}`,
        },
        body: file,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr((data as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [file, date, channel, onSaved, setBusy]);

  const remove = useCallback(async () => {
    if (!confirm(`${date} ${channel.toUpperCase()} の予約を削除しますか?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/stream/youtube/thumbnail-schedule/${date}/${channel}`, {
        method: "DELETE",
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [date, channel, onSaved, setBusy]);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-zinc-500">{channel.toUpperCase()} channel</div>
            <div className="text-xl font-bold">{date}</div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none">×</button>
        </div>

        {existing && !preview && (
          <div className="mb-4">
            <div className="text-xs text-zinc-400 mb-1">現在の予約</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={existing.image_url} alt="" className="w-full rounded border border-zinc-700" />
            <div className="text-xs text-zinc-500 mt-1 break-all">
              <a href={existing.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{existing.image_url}</a>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-zinc-400 mb-2">{existing ? "差し替え" : "アップロード"} (PNG / JPEG / WEBP, 8MB 以下)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-100 hover:file:bg-zinc-600"
          />
        </div>

        {preview && (
          <div className="mb-4">
            <div className="text-xs text-zinc-400 mb-1">プレビュー</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="w-full rounded border border-zinc-700" />
          </div>
        )}

        {err && <div className="text-sm text-rose-400 mb-3">{err}</div>}

        <div className="flex gap-2">
          <button
            onClick={upload}
            disabled={!file || busy}
            className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-sm disabled:opacity-50"
          >
            {busy ? "Uploading..." : existing ? "差し替えて保存" : "アップロードして予約"}
          </button>
          {existing && (
            <button
              onClick={remove}
              disabled={busy}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded text-sm disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
