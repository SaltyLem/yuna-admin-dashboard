export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}

/**
 * Pill-style tab bar for picking one of a few options. Used for filters
 * and compact mode toggles.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`flex gap-0.5 bg-panel-2 rounded-md p-0.5 border border-border ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition ${
            value === o.value
              ? "bg-panel-hover text-text"
              : "text-text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
