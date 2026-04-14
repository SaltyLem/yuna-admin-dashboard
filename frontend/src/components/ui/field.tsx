import type { ReactNode } from "react";

export interface FieldProps {
  label: string;
  /** Small helper text next to label. */
  hint?: string;
  children: ReactNode;
}

/**
 * Form field wrapper — uppercase label on top, optional hint, children below.
 * Used by every admin form to keep typography consistent.
 */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <div>
      <label className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] text-text-muted uppercase tracking-wider">
          {label}
        </span>
        {hint && <span className="text-[10px] text-text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
