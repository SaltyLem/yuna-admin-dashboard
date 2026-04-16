"use client";
import React, { useState, useRef, useEffect } from "react";

import { fmtTime, fmtDate, matchesDate, DAYS, type Schedule } from "./schedule-utils";

interface WeekViewProps {
  weekStart: Date;
  schedules: Schedule[];
  onClickSlot: (s: Schedule) => void;
  onClickDate: (date: string) => void;
  onDragCreate: (date: string, startMinutes: number, endMinutes: number) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOTS_PER_HOUR = 4;
const SLOT_HEIGHT = 12;
const CHANNELS = ["ja", "en"] as const;

interface DragState {
  date: string;
  startSlot: number;
  endSlot: number;
}

function channelColor(channel: string, enabled: boolean): string {
  if (!enabled) return "bg-panel-2 text-text-muted line-through";
  return channel === "ja" ? "bg-red-900/60 text-red-300" : "bg-blue-900/60 text-blue-300";
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
      <div className="relative grid grid-cols-[3rem_repeat(7,1fr)] min-w-[800px] select-none">
        {/* Header — day + ja|en sub-labels */}
        <div className="border-b border-border" />
        {dates.map((d) => {
          const date = fmtDate(d);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`text-center text-xs py-1.5 border-b border-l border-border ${
                isToday ? "text-text font-bold" : "text-text-muted"
              }`}
            >
              <div>{DAYS[d.getDay()]}</div>
              <div className={`text-lg leading-tight ${isToday ? "text-text" : "text-text-soft"}`}>{d.getDate()}</div>
              <div className="flex justify-center gap-1 mt-0.5">
                <span className="text-[10px] text-red-400 font-medium">JA</span>
                <span className="text-[10px] text-text-faint">|</span>
                <span className="text-[10px] text-blue-400 font-medium">EN</span>
              </div>
            </div>
          );
        })}

        {/* Hour rows */}
        {HOURS.map((hour) => (
          <React.Fragment key={hour}>
            <div className="text-xs text-text-faint text-right pr-2 pt-1 h-12 border-b border-border/50">
              {String(hour).padStart(2, "0")}
            </div>
            {dates.map((d) => {
              const date = fmtDate(d);

              return (
                <div
                  key={`${date}-${hour}`}
                  className="h-12 border-b border-l border-border/50 relative"
                >
                  {/* Center divider between ja/en */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/30 z-[1]" />

                  {/* 15-min drag slots (full width) */}
                  {[0, 1, 2, 3].map((q) => {
                    const slot = hour * SLOTS_PER_HOUR + q;
                    const isSelecting =
                      drag && drag.date === date && slot >= drag.startSlot && slot <= drag.endSlot;
                    return (
                      <div
                        key={q}
                        className={`absolute left-0 right-0 cursor-pointer hover:bg-panel-hover/30 ${
                          isSelecting ? "bg-accent/30" : ""
                        } ${q > 0 ? "border-t border-border/30" : ""}`}
                        style={{ top: `${q * SLOT_HEIGHT}px`, height: `${SLOT_HEIGHT}px`, zIndex: 2 }}
                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(date, slot); }}
                        onMouseEnter={() => handleMouseEnter(date, slot)}
                      />
                    );
                  })}

                  {/* Schedules — ja left half, en right half */}
                  {CHANNELS.map((ch) => {
                    const chSchedules = schedules.filter(
                      (s) => s.channel === ch && matchesDate(s, date) && Math.floor(s.start_minutes / 60) === hour,
                    );
                    const isLeft = ch === "ja";
                    return chSchedules.map((s) => {
                      const durationMinutes = s.end_minutes - s.start_minutes;
                      const topOffset = (s.start_minutes % 60) / 60;
                      return (
                        <div
                          key={s.id}
                          onClick={(e) => { e.stopPropagation(); onClickSlot(s); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`absolute rounded px-0.5 text-[10px] leading-tight cursor-pointer truncate hover:brightness-125 transition ${channelColor(s.channel, s.enabled)}`}
                          style={{
                            top: `${topOffset * 48}px`,
                            height: `${Math.max((durationMinutes / 60) * 48, 10)}px`,
                            left: isLeft ? "1px" : "50%",
                            right: isLeft ? "50%" : "1px",
                            zIndex: 10,
                          }}
                          title={`[${ch.toUpperCase()}] ${fmtTime(s.start_minutes)}-${fmtTime(s.end_minutes)} ${s.label}`}
                        >
                          {fmtTime(s.start_minutes)} {s.label}
                        </div>
                      );
                    });
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {/* Current time indicator */}
        {(() => {
          const todayStr = fmtDate(now);
          const todayCol = dates.findIndex((d) => fmtDate(d) === todayStr);
          if (todayCol < 0) return null;
          const minutes = now.getHours() * 60 + now.getMinutes();
          const HEADER_H = 68;
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
