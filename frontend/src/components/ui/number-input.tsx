export interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}

/**
 * Styled number input with optional suffix (e.g. %).
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix,
  className = "",
}: NumberInputProps) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        min={min}
        max={max}
        className={`w-full px-2 py-1.5 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent tabular-nums ${
          suffix ? "pr-7" : ""
        } ${className}`}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
