import { useId } from 'react';
import styles from './SegmentedField.module.css';

type SegmentedFieldProps<T extends string> = {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
};

export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedFieldProps<T>) {
  const name = useId();

  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {label}
      </legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.text}>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
