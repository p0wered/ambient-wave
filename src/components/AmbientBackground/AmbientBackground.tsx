import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import { createBackground, type BackgroundController } from '../../lib/background.ts';
import { DEFAULT_SETTINGS, type BackgroundSettings } from '../../lib/settings.ts';
import styles from './AmbientBackground.module.css';

export type AmbientBackgroundHandle = {
  replay(): void;
};

export type AmbientBackgroundProps = {
  settings?: BackgroundSettings;
  playing?: boolean;
  stillTime?: number;
  className?: string;
  ref?: Ref<AmbientBackgroundHandle>;
};

export function AmbientBackground({
  settings = DEFAULT_SETTINGS,
  playing = true,
  stillTime,
  className = '',
  ref,
}: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BackgroundController>(null);
  // The engine is created once; later changes are applied in place.
  const initialRef = useRef({ settings, playing, stillTime });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initial = initialRef.current;
    const controller = createBackground(canvas, initial.settings, {
      autoPlay: initial.playing,
      stillTime: initial.stillTime,
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    initialRef.current.settings = settings;
    controllerRef.current?.update(settings);
  }, [settings]);

  useEffect(() => {
    initialRef.current.playing = playing;
    controllerRef.current?.setPlaying(playing);
  }, [playing]);

  useImperativeHandle(ref, () => ({
    replay: () => controllerRef.current?.replay(),
  }), []);

  const style = {
    '--ambient-shadow': settings.colors.shadow,
    '--ambient-lift': settings.colors.lift,
    '--ambient-glow': settings.colors.glow,
    // The corner light overlay dims with the scene's ambient light.
    '--ambient-overlay': Math.min(1, settings.ambient),
  } as CSSProperties;

  return (
    <div
      className={`${styles.background} ${className}`}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.overlay} />
    </div>
  );
}
