import { useId, type CSSProperties } from 'react';
import type { SettingRange } from '../../lib/settings.ts';
import styles from './RangeField.module.css';

type RangeFieldProps = {
  label: string;
  value: number;
  range: SettingRange;
  digits?: number;
  unit?: string;
  onChange(value: number): void;
};

export function RangeField({
  label,
  value,
  range,
  digits = 2,
  unit = '',
  onChange,
}: RangeFieldProps) {
  const id = useId();
  const fill = ((value - range.min) / (range.max - range.min)) * 100;

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <output className={styles.value} htmlFor={id}>
          {value.toFixed(digits)}
          {unit}
        </output>
      </div>
      <input
        id={id}
        className={styles.input}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}
