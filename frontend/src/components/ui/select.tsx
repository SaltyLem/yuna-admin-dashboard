export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  className?: string;
}

/**
 * Styled native <select>. Use for small enum pickers inside forms.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: SelectProps<T>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      disabled={disabled}
      className={`w-full px-2 py-2 bg-panel-2 border border-border rounded-md text-sm focus:outline-none focus:border-accent disabled:opacity-50 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
