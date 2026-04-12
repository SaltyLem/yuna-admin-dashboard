"use client";
import React, { useState, useRef, useEffect } from "react";

import { fmtTime, fmtDate, matchesDate, slotColor, DAYS, type Schedule } from "./schedule-utils";

interface WeekViewProps {
  weekStart: Date;
  schedules: Schedule[];
  onClickSlot: (s: Schedule) => void;
  onClickDate: (date: string) => void;
  onDragCreate: (date: string, startMinutes: number, endMinutes: number) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOTS_PER_HOUR = 4; // 15分刻み
const SLOT_HEIGHT = 12; // px（1セル 15分 = 12px, 1時間 = 48px）

interface DragState {
  date: string;
  startSlot: number; // 0-95 (15分単位)
  endSlot: number;
}

export function WeekView({ weekStart, schedules, onClickSlot, onClickDate, onDragCreate }: WeekViewProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const dragStartRef = useRef<{ date: string; slot: number } | null>(null);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = fmtDate(new Date());

  const handleMouseDown = (date: string, slot: number) => {
    dragStartRef.current = { date, slot };
    setDrag({ date, startSlot: slot, endSlot: slot });
  };

  const handleMouseEnter = (date: string, slot: number) => {
    if (!dragStartRef.current || dragStartRef.current.date !== date) return;
    const start = dragStartRef.current.slot;
    setDrag({
      date,
      startSlot: Math.min(start, slot),
      endSlot: Math.max(start, slot),
    });
  };

  const handleMouseUp = () => {
    if (drag && dragStartRef.current) {
      const startMinutes = drag.startSlot * 15;
      const endMinutes = (drag.endSlot + 1) * 15;
      // 15分以上の選択のみ許可、それ以下はクリック扱い
      if (endMinutes - startMinutes >= 15) {
        onDragCreate(drag.date, startMinutes, endMinutes);
      } else {
        onClickDate(drag.date);
      }
    }
    dragStartRef.current = null;
    setDrag(null);
  };

  return (
    <div className="overflow-x-auto" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="relative grid grid-cols-[3rem_repeat(7,1fr)] min-w-[700px] select-none">
        {/* Header */}
        <div className="border-b border-neutral-800" />
        {dates.map((d) => {
          const date = fmtDate(d);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`text-center text-xs py-2 border-b border-l border-neutral-800 ${
                isToday ? "text-white font-bold" : "text-neutral-400"
              }`}
            >
              <div>{DAYS[d.getDay()]}</div>
              <div className={`text-lg ${isToday ? "text-white" : "text-neutral-300"}`}>{d.getDate()}</div>
            </div>
          );
        })}

        {/* Hour rows */}
        {HOURS.map((hour) => (
          <React.Fragment key={hour}>
            <div className="text-xs text-neutral-600 text-right pr-2 pt-1 h-12 border-b border-neutral-800/50">
              {String(hour).padStart(2, "0")}
            </div>
            {dates.map((d) => {
              const date = fmtDate(d);
              const daySchedules = schedules.filter(
                (s) => matchesDate(s, date) && Math.floor(s.start_minutes / 60) === hour,
              );

              return (
                <div
                  key={`${date}-${hour}`}
                  className="h-12 border-b border-l border-neutral-800/50 relative"
                >
                  {/* 15分刻みの subdivision */}
                  {[0, 1, 2, 3].map((q) => {
                    const slot = hour * SLOTS_PER_HOUR + q;
                    const isSelecting =
                      drag && drag.date === date && slot >= drag.startSlot && slot <= drag.endSlot;
                    return (
                      <div
                        key={q}
                        className={`absolute left-0 right-0 cursor-pointer hover:bg-neutral-700/30 ${
                          isSelecting ? "bg-neutral-500/50" : ""
                        } ${q > 0 ? "border-t border-neutral-800/30" : ""}`}
                        style={{ top: `${q * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px` }}
                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(date, slot); }}
                        onMouseEnter={() => handleMouseEnter(date, slot)}
                      />
                    );
                  })}

                  {/* 既存スケジュール */}
                  {daySchedules.map((s) => {
                    const durationMinutes = s.end_minutes - s.start_minutes;
                    const topOffset = (s.start_minutes % 60) / 60;
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); onClickSlot(s); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`absolute left-0.5 right-0.5 rounded px-1 text-xs cursor-pointer truncate hover:brightness-125 transition ${slotColor(s)}`}
                        style={{
                          top: `${topOffset * 48}px`,
                          height: `${(durationMinutes / 60) * 48}px`,
                          zIndex: 10,
                        }}
                      >
                        {fmtTime(s.start_minutes)} {s.label}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {/* 現在時刻ライン */}
        {(() => {
          const todayStr = fmtDate(now);
          const todayCol = dates.findIndex((d) => fmtDate(d) === todayStr);
          if (todayCol < 0) return null;
          const minutes = now.getHours() * 60 + now.getMinutes();
          // header 高さ（py-2 + 2行分）を概算
          const HEADER_H = 60;
          const topPx = HEADER_H + (minutes / 60) * 48;
          return (
            <div
              className="absolute pointer-events-none z-20"
              style={{
                top: `${topPx}px`,
                left: `calc(3rem + ${todayCol} * ((100% - 3rem) / 7))`,
                width: 'calc((100% - 3rem) / 7)',
              }}
            >
              <div className="relative h-0.5 bg-red-500">
                <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
