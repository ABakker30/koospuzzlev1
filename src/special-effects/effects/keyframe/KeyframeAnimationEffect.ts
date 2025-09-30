import * as THREE from 'three';
import type { EffectInstance, EffectCtx, Easing, CameraKeyOrbit, KeyframeConfig } from '../../_shared/types';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Capture current camera → orbit key
 */
export function captureOrbitKey(camera: THREE.PerspectiveCamera, controls: any): CameraKeyOrbit {
  const target = controls.target.clone();
  const offset = new THREE.Vector3().subVectors(camera.position, target);

  const radius = offset.length();
  const spherical = new THREE.Spherical().setFromVector3(offset);

  // Clamp phi to avoid poles
  const eps = 1e-3;
  const phi = Math.min(Math.max(spherical.phi, eps), Math.PI - eps);

  // Normalize theta to (-π, π]
  let theta = ((spherical.theta + Math.PI) % (2 * Math.PI)) - Math.PI;

  return {
    theta: parseFloat(theta.toFixed(4)),
    phi: parseFloat(phi.toFixed(4)),
    radius: parseFloat(radius.toFixed(4)),
    target: [target.x, target.y, target.z],
    fov: camera.fov
  };
}

/**
 * Apply orbit key → camera + controls
 */
export function applyOrbitKey(camera: THREE.PerspectiveCamera, controls: any, key: CameraKeyOrbit) {
  const t = new THREE.Vector3(...key.target);
  const spherical = new THREE.Spherical(key.radius, key.phi, key.theta);
  const pos = new THREE.Vector3().setFromSpherical(spherical).add(t);

  camera.position.copy(pos);
  camera.lookAt(t);
  camera.fov = key.fov ?? camera.fov;
  camera.updateProjectionMatrix();

  controls.target.copy(t);
  controls.update();
}

/**
 * Angle wrapping helper
 */
export function shortestAngleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Catmull–Rom target interpolation
 */
export function catmullRom(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3 {
  const v0 = (p2.x - p0.x) * 0.5;
  const v1 = (p3.x - p1.x) * 0.5;
  const x = ((2 * p1.x - 2 * p2.x + v0 + v1) * t + (-3 * p1.x + 3 * p2.x - 2 * v0 - v1)) * t * t + v0 * t + p1.x;

  const v0y = (p2.y - p0.y) * 0.5;
  const v1y = (p3.y - p1.y) * 0.5;
  const y = ((2 * p1.y - 2 * p2.y + v0y + v1y) * t + (-3 * p1.y + 3 * p2.y - 2 * v0y - v1y)) * t * t + v0y * t + p1.y;

  const v0z = (p2.z - p0.z) * 0.5;
  const v1z = (p3.z - p1.z) * 0.5;
  const z = ((2 * p1.z - 2 * p2.z + v0z + v1z) * t + (-3 * p1.z + 3 * p2.z - 2 * v0z - v1z)) * t * t + v0z * t + p1.z;

  return new THREE.Vector3(x, y, z);
}

/**
 * Arc-length LUT (constant speed support)
 */
export function buildArcLengthLUT(evalFn: (u: number) => THREE.Vector3, samples = 100) {
  const pts: number[] = [0];
  let total = 0;
  let last = evalFn(0);
  for (let i = 1; i <= samples; i++) {
    const u = i / samples;
    const p = evalFn(u);
    total += p.distanceTo(last);
    pts.push(total);
    last = p;
  }
  // Normalize to [0,1]
  return pts.map(v => v / total);
}

export function mapTimeToU(lut: number[], tNorm: number): number {
  // Binary search to invert LUT
  let lo = 0, hi = lut.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lut[mid] < tNorm) lo = mid + 1; else hi = mid;
  }
  const i = Math.max(1, lo);
  const prev = lut[i - 1], next = lut[i];
  const span = next - prev || 1e-6;
  const frac = (tNorm - prev) / span;
  return (i - 1 + frac) / (lut.length - 1);
}

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

function ease(e: Easing, u: number): number {
  switch (e) {
    case 'linear': return u;
    case 'easeIn': return u*u*(3-2*u);                 // smooth start
    case 'easeOut': return 1 - (1-u)*(1-u)*(3-2*(1-u));// smooth end
    case 'easeInOut': default:
      return u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u+2, 2)/2;
  }
}

// ============================================================================
// SEGMENT CACHE TYPES
// ============================================================================

type Segment = {
  i0: number;           // start key index
  i1: number;           // end key index
  dur: number;          // seconds
  // Wrapped deltas for angles/radius
  theta0: number; dTheta: number;
  phi0: number;   dPhi: number;
  r0: number;     dr: number;
  // Target interpolation support
  t0: THREE.Vector3; t1: THREE.Vector3; tPrev: THREE.Vector3; tNext: THREE.Vector3;
  // Optional constant-speed LUT (position only, for pacing)
  lut?: number[];
};

// ============================================================================
// SEGMENT BUILDING
// ============================================================================

function buildSegments(keys: CameraKeyOrbit[], cfg: KeyframeConfig): Segment[] {
  if (keys.length < 2) return [];

  const N = keys.length;
  const segCount = cfg.closed ? N : (N - 1);
  const equalDur = cfg.durationSec / segCount;

  const toV3 = (k: CameraKeyOrbit) => new THREE.Vector3(k.target[0], k.target[1], k.target[2]);

  const segments: Segment[] = [];
  for (let s = 0; s < segCount; s++) {
    const i0 = s;
    const i1 = (s + 1) % N;

    const k0 = keys[i0], k1 = keys[i1];

    // Angle deltas (shortest paths)
    const dTheta = shortestAngleDiff(k0.theta, k1.theta);
    const dPhi   = shortestAngleDiff(k0.phi,   k1.phi);

    // Catmull–Rom control points for target
    const iPrev = (i0 - 1 + N) % N;
    const iNext = (i1 + 1) % N;
    const tPrev = toV3(keys[iPrev]);
    const t0    = toV3(k0);
    const t1    = toV3(k1);
    const tNext = toV3(keys[iNext]);

    const seg: Segment = {
      i0, i1, dur: equalDur,
      theta0: k0.theta, dTheta,
      phi0:   k0.phi,   dPhi,
      r0:     k0.radius, dr: (k1.radius - k0.radius),
      t0, t1, tPrev, tNext
    };

    segments.push(seg);
  }
  return segments;
}

/**
 * Optional constant-speed LUTs (precompute after segments)
 */
function attachConstantSpeedLUTs(keys: CameraKeyOrbit[], segs: Segment[], cfg: KeyframeConfig) {
  if (!cfg.constantSpeed) return;
  const tmpPos = new THREE.Vector3();

  for (const seg of segs) {
    const evalPos = (u: number) => {
      // base eased u for geometry sampling (use linear here; pacing is handled by LUT)
      const theta = seg.theta0 + seg.dTheta * u;
      const phi   = seg.phi0   + seg.dPhi   * u;
      const r     = seg.r0     + seg.dr     * u;

      // target via Catmull–Rom
      const target = catmullRom(seg.tPrev, seg.t0, seg.t1, seg.tNext, u);

      // position from spherical
      const spherical = new THREE.Spherical(r, phi, theta);
      return tmpPos.copy(new THREE.Vector3().setFromSpherical(spherical).add(target)).clone();
    };

    seg.lut = buildArcLengthLUT(evalPos, 120);
  }
}

/**
 * Evaluate pose for a given global time t
 */
function evalCameraAtTime(keys: CameraKeyOrbit[], segs: Segment[], cfg: KeyframeConfig, tGlobal: number) {
  const total = cfg.durationSec;
  if (total <= 0 || segs.length === 0) return null;

  // Wrap or clamp t
  let t = tGlobal;
  if (cfg.loop) t = ((t % total) + total) % total; else t = Math.min(Math.max(t, 0), total - 1e-6);

  // Find segment
  let acc = 0, segIdx = 0;
  for (; segIdx < segs.length; segIdx++) {
    const next = acc + segs[segIdx].dur;
    if (t < next) break;
    acc = next;
  }
  const seg = segs[Math.min(segIdx, segs.length - 1)];

  // Local normalized time
  const u0 = (t - acc) / seg.dur;

  // Global easing for pacing, then optional remap via LUT (constant speed)
  let u = ease(cfg.easing, u0);
  if (cfg.constantSpeed && seg.lut) {
    u = mapTimeToU(seg.lut, u);
  }

  // Interpolate spherical params
  const theta = seg.theta0 + seg.dTheta * u;
  const phi   = seg.phi0   + seg.dPhi   * u;
  const r     = seg.r0     + seg.dr     * u;

  // Interpolate target via Catmull–Rom
  const target = catmullRom(seg.tPrev, seg.t0, seg.t1, seg.tNext, u);

  // Build final position
  const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta)).add(target);

  // FOV (optional): interpolate if your keys store per-key FOV; else keep current
  const fov = keys[seg.i0].fov ?? undefined;

  return { pos, target, fov };
}

// ============================================================================
// KEYFRAME ANIMATION EFFECT
// ============================================================================

export class KeyframeAnimationEffect implements EffectInstance<KeyframeConfig> {
  id = 'keyframe' as const;
  name = 'Keyframe Animation';

  private keys: CameraKeyOrbit[] = [];
  private cfg: KeyframeConfig = {
    durationSec: 12,
    easing: 'easeInOut',
    constantSpeed: true,
    closed: false,
    loop: false,
    keys: []
  };

  private segs: Segment[] = [];

  getConfig(): KeyframeConfig { 
    return { ...this.cfg, keys: this.keys }; 
  }
  
  setConfig(cfg: Partial<KeyframeConfig> & { keys?: CameraKeyOrbit[] }): void {
    if (cfg.keys) this.keys = cfg.keys.slice();
    Object.assign(this.cfg, cfg);
    this.invalidateCache();
  }

  canPlay(): boolean { 
    return this.keys.length >= 2 && this.cfg.durationSec > 0; 
  }
  
  getDurationSec(): number | undefined { 
    return this.cfg.durationSec; 
  }

  private invalidateCache(): void { 
    this.segs = []; 
  }

  onEnable(ctx: EffectCtx): void {
    console.log('🎬 KeyframeAnimation: Building segment caches');
    const startTime = performance.now();
    
    // Build segment caches
    this.segs = buildSegments(this.keys, this.cfg);
    attachConstantSpeedLUTs(this.keys, this.segs, this.cfg);
    
    const buildTime = performance.now() - startTime;
    console.log(`🎬 KeyframeAnimation: Cache built in ${buildTime.toFixed(1)}ms, ${this.segs.length} segments`);
  }

  onUpdate(dt: number, t: number, ctx: EffectCtx): void {
    if (!this.segs.length) return;

    const pose = evalCameraAtTime(this.keys, this.segs, this.cfg, t);
    if (!pose) return;

    // Apply to camera + controls
    const { pos, target, fov } = pose;
    const camera = ctx.camera as THREE.PerspectiveCamera;
    
    camera.position.copy(pos);
    camera.lookAt(target);
    if (fov !== undefined) { 
      camera.fov = fov; 
      camera.updateProjectionMatrix(); 
    }
    
    if (ctx.controls) {
      ctx.controls.target.copy(target);
      ctx.controls.update();
    }
  }

  onStop(ctx: EffectCtx): void {
    if (this.keys.length === 0) return;
    
    console.log('🎬 KeyframeAnimation: Snapping to first key');
    
    // Snap to first key for a predictable reset
    const k0 = this.keys[0];
    const camera = ctx.camera as THREE.PerspectiveCamera;
    applyOrbitKey(camera, ctx.controls, k0);
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR UI
  // ============================================================================

  /**
   * Capture current camera position as new keyframe
   */
  captureFromCurrentCamera(cam: THREE.PerspectiveCamera, controls: any): void {
    const k = captureOrbitKey(cam, controls);
    this.keys.push(k);
    this.invalidateCache();
    console.log(`🎬 KeyframeAnimation: Captured keyframe ${this.keys.length}`, k);
  }

  /**
   * Replace selected key with current camera position
   */
  replaceKey(index: number, cam: THREE.PerspectiveCamera, controls: any): void {
    if (index < 0 || index >= this.keys.length) return;
    this.keys[index] = captureOrbitKey(cam, controls);
    this.invalidateCache();
    console.log(`🎬 KeyframeAnimation: Replaced keyframe ${index + 1}`);
  }

  /**
   * Remove keyframe at index
   */
  removeKey(index: number): void {
    if (index < 0 || index >= this.keys.length) return;
    this.keys.splice(index, 1);
    this.invalidateCache();
    console.log(`🎬 KeyframeAnimation: Removed keyframe ${index + 1}`);
  }

  /**
   * Clear all keyframes
   */
  clearKeys(): void {
    this.keys = [];
    this.invalidateCache();
    console.log('🎬 KeyframeAnimation: Cleared all keyframes');
  }

  /**
   * Move keyframe up in list
   */
  moveKeyUp(index: number): void {
    if (index <= 0 || index >= this.keys.length) return;
    [this.keys[index - 1], this.keys[index]] = [this.keys[index], this.keys[index - 1]];
    this.invalidateCache();
  }

  /**
   * Move keyframe down in list
   */
  moveKeyDown(index: number): void {
    if (index < 0 || index >= this.keys.length - 1) return;
    [this.keys[index], this.keys[index + 1]] = [this.keys[index + 1], this.keys[index]];
    this.invalidateCache();
  }

  /**
   * Get keyframes for display
   */
  getKeys(): CameraKeyOrbit[] {
    return this.keys.slice();
  }

  /**
   * Snap to specific keyframe (for preview)
   */
  snapToKey(index: number, cam: THREE.PerspectiveCamera, controls: any): void {
    if (index < 0 || index >= this.keys.length) return;
    applyOrbitKey(cam, controls, this.keys[index]);
  }

  /**
   * Call after any reorder/delete to rebuild caches
   */
  recomputeCaches(): void {
    this.segs = buildSegments(this.keys, this.cfg);
    attachConstantSpeedLUTs(this.keys, this.segs, this.cfg);
  }
}
