import * as THREE from 'three';
import {
  clothFragment,
  clothVertex,
  particleFragment,
  particleVertex,
  postFragment,
  postVertex,
} from './wave-shaders';
import {
  DEFAULT_SETTINGS,
  IDLE_START,
  IMPULSE_DURATION,
  MAX_PARTICLES,
  REFERENCE_TIME,
  type BackgroundSettings,
} from './settings';

type Disposable = { dispose: () => void };

export type BackgroundOptions = {
  autoPlay?: boolean;
  // Scene time shown when paused by reduced-motion preferences.
  stillTime?: number;
};

export type BackgroundController = {
  update(settings: BackgroundSettings): void;
  setPlaying(playing: boolean): void;
  // Restarts the startup impulse.
  replay(): void;
  dispose(): void;
};

// Idle swells are slow, so they render at about 30 fps to spare the GPU.
const IDLE_FRAME_MS = 1000 / 30;
// Past this time only the idle phase changes; the delayed particle field is settled too.
const SETTLED_TIME = IDLE_START + 1;
const CAMERA_DISTANCE = Math.hypot(1.45, 3.6);
// At the default 21.94-degree tilt this leaves the 12.5-degree half-angle that keeps
// the far edge and horizon out of the crop.
const HORIZON_MARGIN = THREE.MathUtils.degToRad(9.44);
const MAX_HALF_ANGLE = THREE.MathUtils.degToRad(12.5);
const MIN_HALF_ANGLE = THREE.MathUtils.degToRad(3);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// Used when a screen position looks above the horizon.
const MAX_ORIGIN_DISTANCE = 12;

export function createBackground(
  canvas: HTMLCanvasElement,
  initial: BackgroundSettings = DEFAULT_SETTINGS,
  options: BackgroundOptions = {},
): BackgroundController {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let settings = initial;
  let playing = options.autoPlay ?? true;
  const stillTime = Math.max(0, options.stillTime ?? REFERENCE_TIME);
  let disposed = false;
  let failed = false;
  let lost = false;
  let offscreen = false;
  let time = 0;
  // Idle swell phase in wavelengths, wrapped to [0, 1).
  let phase = 0;
  let raf = 0;
  let previous = 0;
  let renderer: THREE.WebGLRenderer | undefined;
  let target: THREE.WebGLRenderTarget | undefined;
  let clothGeometry: THREE.PlaneGeometry | undefined;
  let clothMaterial: THREE.ShaderMaterial | undefined;
  let particleGeometry: THREE.BufferGeometry | undefined;
  let particleMaterial: THREE.ShaderMaterial | undefined;
  let postGeometry: THREE.PlaneGeometry | undefined;
  let postMaterial: THREE.ShaderMaterial | undefined;
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let particles: THREE.Scene | undefined;
  let postScene: THREE.Scene | undefined;
  let postCamera: THREE.Camera | undefined;

  const raycaster = new THREE.Raycaster();
  const screenPoint = new THREE.Vector2();
  const groundPoint = new THREE.Vector3();

  const sceneColors = {
    shadow: new THREE.Color(),
    lift: new THREE.Color(),
    glow: new THREE.Color(),
  };

  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uFocus: { value: 0 },
    uAperture: { value: 1 },
    uImpulse: { value: 1 },
    uSwell: { value: 1 },
    uWavelength: { value: 1 },
    uPeriod: { value: 1 },
    uIdlePhase: { value: 0 },
    uDrop: { value: 1 },
    uCrestWidth: { value: 1 },
    uAmbient: { value: 1 },
    uGlow: { value: 1 },
    uDustLevel: { value: 0 },
    uOrigin: { value: new THREE.Vector2() },
    uDust: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColorShadow: { value: sceneColors.shadow },
    uColorLift: { value: sceneColors.lift },
    uColorGlow: { value: sceneColors.glow },
  };

  function seek(seconds: number): void {
    time = Math.min(seconds, SETTLED_TIME);
    phase = (seconds / settings.period) % 1;
  }

  function applySettings(): void {
    sceneColors.shadow.set(settings.colors.shadow);
    sceneColors.lift.set(settings.colors.lift);
    sceneColors.glow.set(settings.colors.glow);
    const clear = sceneColors.shadow.clone().lerp(sceneColors.lift, 0.22);
    renderer?.setClearColor(clear, 1);
    uniforms.uIntensity.value = settings.intensity;
    uniforms.uFocus.value = settings.focus;
    uniforms.uAperture.value = settings.aperture;
    uniforms.uImpulse.value = settings.impulse;
    uniforms.uDrop.value = settings.shape === 'drop' ? 1 : 0;
    uniforms.uSwell.value = settings.swell;
    uniforms.uWavelength.value = settings.wavelength;
    uniforms.uPeriod.value = settings.period;
    uniforms.uDust.value = settings.dust;
    uniforms.uDustLevel.value = settings.dustLevel;
    uniforms.uCrestWidth.value = settings.crestWidth;
    uniforms.uAmbient.value = settings.ambient;
    uniforms.uGlow.value = settings.glow;
    particleGeometry?.setDrawRange(0, Math.round(settings.particles));
    applyCamera();
  }

  function applyCamera(): void {
    if (!camera) return;
    const tilt = THREE.MathUtils.degToRad(settings.tilt);
    const roll = THREE.MathUtils.degToRad(settings.roll);
    // The default 37-degree roll matches the reference diagonal in portrait.
    camera.position.set(0, Math.sin(tilt) * CAMERA_DISTANCE, Math.cos(tilt) * CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(roll);
    // Keep the far edge/horizon outside the crop, including wide windows.
    const halfAngle = Math.max(MIN_HALF_ANGLE, Math.min(MAX_HALF_ANGLE, tilt - HORIZON_MARGIN));
    const spread = Math.cos(roll) + camera.aspect * Math.sin(roll);
    camera.fov = Math.min(
      24,
      THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfAngle) / spread)),
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    applyOrigin();
  }

  // The arc origin sits beyond the far edge. The drop origin follows a screen position,
  // so the impact stays next to the same corner at any aspect ratio.
  function applyOrigin(): void {
    if (!camera) return;
    if (settings.shape === 'arc') {
      uniforms.uOrigin.value.set(0, -6);
      return;
    }
    screenPoint.set(settings.originX, settings.originY);
    raycaster.setFromCamera(screenPoint, camera);
    const hit = raycaster.ray.intersectPlane(GROUND, groundPoint)
      ?? raycaster.ray.at(MAX_ORIGIN_DISTANCE, groundPoint);
    uniforms.uOrigin.value.set(hit.x, hit.z);
  }

  function render(): void {
    if (!renderer || !target || !scene || !camera || !postScene || !postCamera) return;
    if (!particles || disposed || lost || failed) return;
    uniforms.uTime.value = time;
    uniforms.uIdlePhase.value = phase;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCamera);
    // Particle CoC is computed individually; surface depth still occludes them.
    renderer.clearDepth();
    renderer.render(particles, camera);
  }

  function resize(): void {
    if (!renderer || !target || !camera || disposed || failed || lost) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1_800_000 / (w * h)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    target.setSize(uniforms.uResolution.value.x, uniforms.uResolution.value.y);
    camera.aspect = w / h;
    applyCamera();
    render();
  }

  function running(): boolean {
    return playing && !reduced.matches && !document.hidden && !offscreen
      && !disposed && !failed && !lost;
  }

  function frame(now: number): void {
    raf = 0;
    if (!running()) return;
    if (previous && time >= IMPULSE_DURATION && now - previous < IDLE_FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (previous) {
      const delta = Math.min((now - previous) / 1000, 0.05) * settings.speed;
      time = Math.min(time + delta, SETTLED_TIME);
      phase = (phase + delta / settings.period) % 1;
    }
    previous = now;
    render();
    raf = requestAnimationFrame(frame);
  }

  function sync(): void {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
    render();
    if (running()) raf = requestAnimationFrame(frame);
  }

  function visibilityChange([entry]: IntersectionObserverEntry[]): void {
    offscreen = !entry.isIntersecting;
    sync();
  }

  function motionChange(): void {
    if (reduced.matches) seek(stillTime);
    sync();
  }

  function contextLost(event: Event): void {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    canvas.style.visibility = 'hidden';
  }

  function contextRestored(): void {
    lost = false;
    canvas.style.visibility = 'visible';
    resize();
    sync();
  }

  if (reduced.matches) seek(stillTime);

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    renderer.autoClear = false;
    renderer.debug.onShaderError = () => {
      failed = true;
      canvas.style.visibility = 'hidden';
    };

    camera = new THREE.PerspectiveCamera(24, 1, 0.1, 40);

    scene = new THREE.Scene();
    particles = new THREE.Scene();
    clothGeometry = new THREE.PlaneGeometry(22, 22, 300, 300);
    clothGeometry.rotateX(-Math.PI / 2);
    clothMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: clothVertex,
      fragmentShader: clothFragment,
      side: THREE.DoubleSide,
    });
    const cloth = new THREE.Mesh(clothGeometry, clothMaterial);
    cloth.frustumCulled = false;
    scene.add(cloth);

    target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

    // Stable seeded anchors in world space, with different heights above cloth.
    // The full pool is generated once and the particle setting only changes the draw
    // range, so a lower count keeps the same anchors.
    let seed = 92741;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const seeds = new Float32Array(MAX_PARTICLES);
    const lifts = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3] = (random() - 0.5) * 10;
      positions[i * 3 + 2] = (random() - 0.5) * 10;
      seeds[i] = random();
      // Mostly fine dust close to the yarn, fewer suspended bokeh highlights.
      const layer = random();
      lifts[i] = layer < 0.68 ? 0.008 + random() * 0.055 : 0.1 + Math.pow(random(), 1.5) * 0.48;
    }

    particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    particleGeometry.setAttribute('aLift', new THREE.BufferAttribute(lifts, 1));
    particleMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uDepthTexture: { value: target.depthTexture } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(particleGeometry, particleMaterial);
    dust.frustumCulled = false;
    particles.add(dust);

    postScene = new THREE.Scene();
    postCamera = new THREE.Camera();
    postGeometry = new THREE.PlaneGeometry(2, 2);
    postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uColorTexture: { value: target.texture },
        uDepthTexture: { value: target.depthTexture },
        uInverseProjection: { value: camera.projectionMatrixInverse },
        uCameraWorld: { value: camera.matrixWorld },
      },
      vertexShader: postVertex,
      fragmentShader: postFragment,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(postGeometry, postMaterial);
    quad.frustumCulled = false;
    postScene.add(quad);

    applySettings();
    resize();
    sync();
  } catch (error) {
    failed = true;
    console.error(error);
    canvas.style.visibility = 'hidden';
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(visibilityChange);
  intersection.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', motionChange);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  return {
    update(next) {
      settings = next;
      applySettings();
      // A running loop picks the change up on its next frame.
      if (!running()) render();
    },
    setPlaying(next) {
      if (playing === next) return;
      playing = next;
      sync();
    },
    replay() {
      seek(reduced.matches ? stillTime : 0);
      sync();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', motionChange);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      const resources: Array<Disposable | undefined> = [
        clothGeometry,
        clothMaterial,
        particleGeometry,
        particleMaterial,
        postGeometry,
        postMaterial,
        target,
        renderer,
      ];
      for (const resource of resources) resource?.dispose();
    },
  };
}
