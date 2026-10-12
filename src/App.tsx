import { useEffect, useRef, useState } from 'react';
import {
  AmbientBackground,
  type AmbientBackgroundHandle,
} from './components/AmbientBackground/AmbientBackground.tsx';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel.tsx';
import { DEFAULT_SETTINGS, normalizeSettings } from './lib/settings.ts';
import styles from './App.module.css';

const SETTINGS_KEY = 'ambient-wave:settings';
const PANEL_KEY = 'ambient-wave:panel-open';

// Storage can be unavailable (private mode, blocked site data); the demo still works.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is a convenience only.
  }
}

function loadSettings() {
  const stored = readStorage(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function App() {
  const backgroundRef = useRef<AmbientBackgroundHandle>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [open, setOpen] = useState(() => readStorage(PANEL_KEY) !== 'false');
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    writeStorage(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    writeStorage(PANEL_KEY, String(open));
  }, [open]);

  return (
    <main className={styles.app}>
      <AmbientBackground ref={backgroundRef} settings={settings} playing={playing} />
      <h1 className={styles.title}>
        Ambient Wave
      </h1>
      <SettingsPanel
        settings={settings}
        open={open}
        playing={playing}
        onChange={setSettings}
        onOpenChange={setOpen}
        onPlayingChange={setPlaying}
        onReplay={() => backgroundRef.current?.replay()}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />
    </main>
  );
}
