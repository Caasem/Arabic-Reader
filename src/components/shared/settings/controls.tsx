import type { ReactNode } from 'react';

export interface Option<T extends string> {
  id: T;
  label: string;
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="settings-section__note">{children}</p>;
}

export function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control settings-row__control--segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            className={'segmented__item' + (value === option.id ? ' segmented__item--active' : '')}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A checkbox row; `children` become the explanatory note under it. */
export function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="settings-row">
        <label className="settings-toggle">
          <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span className="settings-toggle__label">{label}</span>
        </label>
      </div>
      {children && <Note>{children}</Note>}
    </>
  );
}

export function RangeRow({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format(value: number): string;
  onChange(value: number): void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="settings-row__value">{format(value)}</span>
      </div>
    </div>
  );
}

export function SelectRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <select
        className="settings-row__select"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
