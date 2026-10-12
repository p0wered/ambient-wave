export const IMPULSE_DURATION = 7.6;
// Idle swells fade in after the impulse and are fully established from IDLE_START.
export const IDLE_START = 9;
export const REFERENCE_TIME = 0.35;
export const MAX_PARTICLES = 4000;

export type BackgroundColors = {
  shadow: string;
  lift: string;
  glow: string;
};

export type BackgroundSettings = {
  colors: BackgroundColors;
  intensity: number;
  focus: number;
  aperture: number;
  dust: number;
  speed: number;
  impulse: number;
  swell: number;
  wavelength: number;
  period: number;
  particles: number;
  tilt: number;
  roll: number;
};

export type NumericSetting = Exclude<keyof BackgroundSettings, 'colors'>;

export type SettingRange = {
  min: number;
  max: number;
  step: number;
};

// The values tuned for the Nortlyn Bank Hero. Camera angles are in degrees.
export const DEFAULT_SETTINGS: BackgroundSettings = {
  colors: {
    shadow: '#5288d3',
    lift: '#c1b7e4',
    glow: '#5d71d1',
  },
  intensity: 1.1,
  focus: 0.36,
  aperture: 1.15,
  dust: 1,
  speed: 1,
  impulse: 1,
  swell: 1,
  wavelength: 4,
  period: 14,
  particles: 1800,
  tilt: 21.94,
  roll: 37.24,
};

export const SETTING_RANGES: Record<NumericSetting, SettingRange> = {
  intensity: { min: 0, max: 2, step: 0.01 },
  focus: { min: 0, max: 1, step: 0.01 },
  aperture: { min: 0, max: 2.5, step: 0.01 },
  dust: { min: 0, max: 3, step: 0.01 },
  speed: { min: 0.1, max: 3, step: 0.05 },
  impulse: { min: 0, max: 2.5, step: 0.05 },
  swell: { min: 0, max: 3, step: 0.05 },
  wavelength: { min: 1.5, max: 10, step: 0.1 },
  period: { min: 4, max: 40, step: 0.5 },
  particles: { min: 0, max: MAX_PARTICLES, step: 100 },
  tilt: { min: 14, max: 60, step: 0.1 },
  roll: { min: 0, max: 75, step: 0.1 },
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function clamp(value: number, { min, max }: SettingRange): number {
  return Math.min(max, Math.max(min, value));
}

// Accepts untrusted input, such as stored or pasted JSON, and fills gaps with defaults.
export function normalizeSettings(input: unknown): BackgroundSettings {
  const source = typeof input === 'object' && input !== null
    ? input as Record<string, unknown>
    : {};
  const colorSource = typeof source.colors === 'object' && source.colors !== null
    ? source.colors as Record<string, unknown>
    : {};
  const settings = structuredClone(DEFAULT_SETTINGS);

  for (const key of Object.keys(settings.colors) as Array<keyof BackgroundColors>) {
    const value = colorSource[key];
    if (typeof value === 'string' && HEX_COLOR.test(value)) {
      settings.colors[key] = value.toLowerCase();
    }
  }

  for (const key of Object.keys(SETTING_RANGES) as NumericSetting[]) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      settings[key] = clamp(value, SETTING_RANGES[key]);
    }
  }

  return settings;
}
