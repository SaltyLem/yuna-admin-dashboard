"use client";
import React from "react";

import { fmtTime, fmtDate, matchesDate, slotColor, DAYS, type Schedule } from "./schedule-utils";

interface WeekViewProps {
  weekStart: Date;
  schedules: Schedule[];
  onClickSlot: (s: Schedule) => void;
  onClickDate: (date: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ weekStart, schedules, onClickSlot, onClickDate }: WeekViewProps) {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = fmtDate(new Date());

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[3rem_repeat(7,1fr)] min-w-[700px]">
        {/* Header */}
        <div className="border-b border-neutral-800" />
        {dates.map((d) => {
          const date = fmtDate(d);
          const isToday = date === today;
          return (
            <div
              key={date}
              onClick={() => onClickDate(date)}
              className={`text-center text-xs py-2 border-b border-l border-neutral-800 cursor-pointer hover:bg-neutral-800/50 ${
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
            <div key={`h-${hour}`} className="text-xs text-neutral-600 text-right pr-2 pt-1 h-12 border-b border-neutral-800/50">
              {String(hour).padStart(2, "0")}
            </div>
            {dates.map((d) => {
              const date = fmtDate(d);
              const hourSlots = schedules.filter(
                (s) => matchesDate(s, date) && Math.floor(s.start_minutes / 60) <= hour && Math.floor((s.end_minutes - 1) / 60) >= hour,
              );
              const startsThisHour = hourSlots.filter((s) => Math.floor(s.start_minutes / 60) === hour);

              return (
                <div
                  key={`${date}-${hour}`}
                  className="h-12 border-b border-l border-neutral-800/50 relative"
                  onClick={() => onClickDate(date)}
                >
                  {startsThisHour.map((s) => {
                    const durationHours = (s.end_minutes - s.start_minutes) / 60;
                    const topOffset = (s.start_minutes % 60) / 60;
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); onClickSlot(s); }}
                        className={`absolute left-0.5 right-0.5 rounded px-1 text-xs cursor-pointer truncate hover:brightness-125 transition ${slotColor(s)}`}
                        style={{
                          top: `${topOffset * 100}%`,
                          height: `${Math.min(durationHours, 24 - hour - topOffset) * 48}px`,
                          zIndex: 1,
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
      </div>
    </div>
  );
}
