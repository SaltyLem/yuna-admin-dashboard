"use client";

import { useState } from "react";

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

/**
 * Chip-style string array editor.
 * - Enter or `,` commits the draft
 * - Backspace on empty draft removes the last chip
 * - `×` on a chip removes that one
 */
export function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setDraft("");
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div className="flex flex-wrap items-center gap-1 min-h-[38px] px-2 py-1.5 bg-panel-2 border border-border rounded-md focus-within:border-accent transition">
      {value.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-panel-hover text-xs"
        >
          {t}
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-text-faint hover:text-[color:var(--color-danger)] leading-none"
            aria-label="Remove"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] bg-transparent text-sm placeholder:text-text-faint focus:outline-none"
      />
    </div>
  );
}
