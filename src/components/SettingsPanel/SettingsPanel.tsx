import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Pause, Play, RotateCcw, SlidersHorizontal, Undo2, X } from 'lucide-react';
import {
  SETTING_RANGES,
  type BackgroundColors,
  type BackgroundSettings,
  type ImpulseShape,
  type NumericSetting,
} from '../../lib/settings.ts';
import { ColorField } from '../ColorField/ColorField.tsx';
import { RangeField } from '../RangeField/RangeField.tsx';
import { SegmentedField } from '../SegmentedField/SegmentedField.tsx';
import styles from './SettingsPanel.module.css';

type NumericField = {
  key: NumericSetting;
  label: string;
  digits?: number;
  unit?: string;
  // Shown only for this impulse shape.
  shape?: ImpulseShape;
};

const COLOR_FIELDS: Array<{ key: keyof BackgroundColors; label: string }> = [
  { key: 'shadow', label: 'Shadow' },
  { key: 'lift', label: 'Lift' },
  { key: 'glow', label: 'Glow' },
];

const SHAPE_OPTIONS: Array<{ value: ImpulseShape; label: string }> = [
  { value: 'drop', label: 'Drop' },
  { value: 'arc', label: 'Arc' },
];

const GROUPS: Array<{ title: string; fields: NumericField[] }> = [
  {
    title: 'Light',
    fields: [
      { key: 'intensity', label: 'Intensity' },
      { key: 'focus', label: 'Focus width' },
      { key: 'aperture', label: 'Aperture' },
      { key: 'dust', label: 'Dust glow' },
    ],
  },
  {
    title: 'Impulse',
    fields: [
      { key: 'impulse', label: 'Strength' },
      { key: 'originX', label: 'Origin X', shape: 'drop' },
      { key: 'originY', label: 'Origin Y', shape: 'drop' },
    ],
  },
  {
    title: 'Motion',
    fields: [
      { key: 'speed', label: 'Speed', unit: '×' },
      { key: 'swell', label: 'Idle swell' },
      { key: 'wavelength', label: 'Swell wavelength', digits: 1 },
      { key: 'period', label: 'Swell period', digits: 1, unit: ' s' },
    ],
  },
  {
    title: 'Scene',
    fields: [
      { key: 'particles', label: 'Particles', digits: 0 },
      { key: 'tilt', label: 'Camera tilt', digits: 1, unit: '°' },
      { key: 'roll', label: 'Camera roll', digits: 1, unit: '°' },
    ],
  },
];

type CopyState = 'idle' | 'copied' | 'failed';

type SettingsPanelProps = {
  settings: BackgroundSettings;
  open: boolean;
  playing: boolean;
  onChange(settings: BackgroundSettings): void;
  onOpenChange(open: boolean): void;
  onPlayingChange(playing: boolean): void;
  onReplay(): void;
  onReset(): void;
};

export function SettingsPanel({
  settings,
  open,
  playing,
  onChange,
  onOpenChange,
  onPlayingChange,
  onReplay,
  onReset,
}: SettingsPanelProps) {
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (!open) return;

    function keyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      toggleRef.current?.focus();
    }

    document.addEventListener('keydown', keyDown);
    return () => document.removeEventListener('keydown', keyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timeout = setTimeout(() => setCopyState('idle'), 1600);
    return () => clearTimeout(timeout);
  }, [copyState]);

  async function copySettings() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  const copyLabel = {
    idle: 'Copy JSON',
    copied: 'Copied',
    failed: 'Copy failed',
  }[copyState];

  return (
    <div className={styles.root}>
      <button
        ref={toggleRef}
        className={styles.toggle}
        type="button"
        aria-label={open ? 'Hide settings' : 'Show settings'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        {open ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <SlidersHorizontal size={20} aria-hidden="true" />
        )}
      </button>
      <aside
        id={panelId}
        className={styles.panel}
        data-open={open || undefined}
        aria-label="Background settings"
      >
        <div className={styles.body}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Colors
            </h2>
            {COLOR_FIELDS.map(({ key, label }) => (
              <ColorField
                key={key}
                label={label}
                value={settings.colors[key]}
                onChange={(value) => onChange({
                  ...settings,
                  colors: { ...settings.colors, [key]: value },
                })}
              />
            ))}
          </section>
          {GROUPS.map((group) => (
            <section key={group.title} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {group.title}
              </h2>
              {group.title === 'Impulse' && (
                <SegmentedField
                  label="Shape"
                  value={settings.shape}
                  options={SHAPE_OPTIONS}
                  onChange={(shape) => {
                    onChange({ ...settings, shape });
                    // The impulse has usually finished; show the new shape right away.
                    onReplay();
                  }}
                />
              )}
              {group.fields
                .filter((field) => !field.shape || field.shape === settings.shape)
                .map((field) => (
                  <RangeField
                    key={field.key}
                    label={field.label}
                    value={settings[field.key]}
                    range={SETTING_RANGES[field.key]}
                    digits={field.digits}
                    unit={field.unit}
                    onChange={(value) => onChange({ ...settings, [field.key]: value })}
                  />
                ))}
            </section>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.action} type="button" onClick={onReplay}>
            <RotateCcw size={20} aria-hidden="true" />
            Replay
          </button>
          <button
            className={styles.action}
            type="button"
            onClick={() => onPlayingChange(!playing)}
          >
            {playing ? (
              <Pause size={20} aria-hidden="true" />
            ) : (
              <Play size={20} aria-hidden="true" />
            )}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className={styles.action} type="button" onClick={copySettings}>
            {copyState === 'copied' ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <Copy size={20} aria-hidden="true" />
            )}
            <span aria-live="polite">
              {copyLabel}
            </span>
          </button>
          <button className={styles.action} type="button" onClick={onReset}>
            <Undo2 size={20} aria-hidden="true" />
            Reset
          </button>
        </div>
      </aside>
    </div>
  );
}
