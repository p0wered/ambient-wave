import { useId } from 'react';
import styles from './ColorField.module.css';

type ColorFieldProps = {
  label: string;
  value: string;
  onChange(value: string): void;
};

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId();

  return (
    <div className={styles.field}>
      <input
        id={id}
        className={styles.swatch}
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <output className={styles.value} htmlFor={id}>
        {value}
      </output>
    </div>
  );
}
