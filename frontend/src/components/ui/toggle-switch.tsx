export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Text shown on the left. */
  label?: string;
}

/**
 * iOS-style on/off switch. Visual label flips color with state.
 */
export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      {label && (
        <span
          className={`text-xs font-mono uppercase tracking-wider ${
            checked ? "text-accent" : "text-text-muted"
          }`}
        >
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-accent" : "bg-panel-2 border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
