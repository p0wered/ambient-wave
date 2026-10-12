# Ambient Wave

A tunable Three.js background: a woven cloth surface, a circular wave impulse that plays once
at startup, slow idle swells afterwards, floating dust and an art-directed depth of field.
Originally built for the Hero of the [Nortlyn Bank](https://github.com/p0wered/nortlyn-bank)
concept; the defaults reproduce that scene.

The demo page shows the background full-screen with a collapsible settings panel.

## Run

Node.js 22+:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5174. Production build: `npm run build`, then `npm run preview`.

## Settings panel

The button in the top-right corner shows and hides the panel; `Esc` hides it as well.
Settings and the panel state are saved in `localStorage`. **Copy JSON** copies the current
settings; **Reset** restores the defaults; **Replay** restarts the startup impulse.

| Setting | Effect |
| --- | --- |
| Shadow, Lift, Glow | The three scene colors; also used by the CSS fallback gradient. |
| Intensity | Overall strength of the light sources, wave glow and dust. |
| Focus width | Width of the sharp band that follows the impulse crest. |
| Aperture | Strength of the depth-of-field blur. |
| Dust glow | Brightness of the dust particles only. |
| Speed | Playback speed of the whole animation. |
| Impulse strength | Height and glow of the startup wave. |
| Idle swell | Height and glow of the idle swells. |
| Swell wavelength | Distance between idle swell crests, in scene units. |
| Swell period | Seconds for one crest to travel one wavelength. |
| Particles | Number of dust particles drawn, up to 4,000. |
| Camera tilt, roll | Camera angle above the cloth and rotation around the view axis. |

## Using the background

Copy `src/lib/` and `src/components/AmbientBackground/` into a React project with `three`
installed. The component fills its positioned parent:

```tsx
import { AmbientBackground } from './components/AmbientBackground/AmbientBackground.tsx';
import { normalizeSettings } from './lib/settings.ts';

// JSON copied from the settings panel; missing or invalid fields fall back to defaults.
const settings = normalizeSettings(copiedJson);

<section style={{ position: 'relative' }}>
  <AmbientBackground settings={settings} />
</section>
```

Props: `settings`, `playing`, `stillTime` (the frame shown with reduced motion),
`className`, and a `ref` exposing `replay()`. The engine is created once; changed settings are
applied to the running scene without recreating the WebGL context.

Without React, `src/lib/background.ts` is framework-independent:

```ts
const controller = createBackground(canvas, settings, { autoPlay: true });
controller.update(nextSettings);
controller.setPlaying(false);
controller.replay();
controller.dispose();
```

## How it works

- A 300 × 300 segmented cloth mesh is displaced in the vertex shader by the circular impulse;
  focus leaves the frame with its crest. Idle swells then roll out from the same origin. Their
  phase is accumulated on the CPU, so changing the period does not make the rings jump.
- 4,000 seeded dust anchors are generated once; the particle setting changes only the draw
  range, so lowering the count keeps the same particles.
- A post pass applies a 64-sample depth-of-field blur and a 12-sample highlight halo.
- DPR is capped at 1.5 and the render buffer at about 1.8 million pixels.
- Idle frames render at about 30 fps. Hidden tabs and an offscreen canvas suspend rendering.
- `prefers-reduced-motion` shows a single static frame; Play has no effect in that mode.
- If WebGL is unavailable or the context is lost, a CSS gradient in the same colors remains.

The camera field of view narrows at low tilt to keep the horizon out of the frame.
Physical phone performance has not been measured.
