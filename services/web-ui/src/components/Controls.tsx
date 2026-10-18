import type { ChangeEvent, ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="flex min-w-[180px] flex-col gap-1.5">
      <span className="font-label-md text-label-md font-medium text-on-surface-variant">{label}</span>
      {children}
      {hint ? <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Accepts plain strings for the common case where the value is also the label. */
export function toOptions(values: string[], label?: (value: string) => string): Option[] {
  return values.map((value) => ({ value, label: label ? label(value) : value }));
}

const CONTROL_CLASSES =
  'h-10 min-w-[180px] rounded-lg border border-outline-variant bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50';

interface SelectProps {
  value: string;
  options: Option[];
  /** Label for the empty option; omit to make the select mandatory. */
  anyLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
}

export function Select({ value, options, anyLabel, disabled, compact, onChange }: SelectProps) {
  return (
    <select
      className={`${CONTROL_CLASSES} ${compact ? 'min-w-[72px] px-2' : ''}`}
      value={value}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      {anyLabel !== undefined ? <option value="">{anyLabel}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface TextInputProps {
  id?: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'datetime-local' | 'email' | 'password';
  step?: string;
  autoComplete?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export function TextInput({ id, value, placeholder, type = 'text', step, autoComplete, invalid, onChange }: TextInputProps) {
  return (
    <input
      className={`${CONTROL_CLASSES} w-full ${invalid ? 'border-error focus:border-error focus:ring-error/15' : ''}`}
      id={id}
      type={type}
      step={step}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      aria-invalid={invalid || undefined}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
    />
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'quiet';
  size?: 'normal' | 'large';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-on-primary border border-primary hover:bg-primary-container hover:border-primary-container',
  ghost:
    'bg-surface-container-lowest text-on-surface border border-outline-variant hover:bg-surface-container-low hover:border-outline',
  quiet: 'bg-transparent text-on-surface-variant border border-transparent hover:text-on-surface',
};

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'normal',
  disabled,
  type = 'button',
  title,
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-label-md text-label-md font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${
        size === 'large' ? 'h-12 px-8 text-body-lg' : 'h-10 px-4'
      } ${BUTTON_VARIANTS[variant]}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}

export function Toggle({ checked, label, hint, onChange }: ToggleProps) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2.5" title={hint}>
      <span className="relative inline-flex h-[23px] w-10 flex-none">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-outline-variant bg-surface-container-high transition-colors peer-checked:border-primary peer-checked:bg-primary-fixed peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 h-[17px] w-[17px] rounded-full bg-on-surface-variant transition-transform peer-checked:translate-x-[17px] peer-checked:bg-primary"
        />
      </span>
      <span className="font-body-md text-body-md text-on-surface">{label}</span>
    </label>
  );
}
