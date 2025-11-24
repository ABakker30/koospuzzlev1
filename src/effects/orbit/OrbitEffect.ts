// Orbit Effect — Constant-Speed Arc-Length Edition (drop-in)
//
// Key ideas:
// - Build one continuous path (adds a seam segment last->first when loop=true)
// - Sample each segment, compute arc length tables
// - Total length L, movement time Tm = duration - sum(pauses)
// - Constant speed v = L/Tm
// - In tick(): map global time -> segment (move or pause).
//   If moving: convert local time -> distance -> u via per-segment lookup -> pose.
//   If pausing: snap to destination key pose.
//
// Notes:
// - Position runs at true constant speed. We ignore `easeToNext` for position.
//   (You can still ease FOV independently if desired.)
// - Pauses are applied at the *destination* key of each segment; the seam has pause=0.
// - Works with your existing OrbitConfig/OrbitKeyframe shapes.

import { OrbitConfig, OrbitKeyframe } from './types';
import { DEFAULT_CONFIG, validateConfig } from './presets';
import { OrbitState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';
import * as THREE from 'three';

export class OrbitEffect implements Effect {
  private state: OrbitState = OrbitState.IDLE;
  private config: OrbitConfig = { ...DEFAULT_CONFIG };
  private context: any = null;
  private onComplete?: () => void;
  private isRecording = false;

  // Cached context
  private scene: any = null;
  private camera: any = null;
  private controls: any = null;
  private renderer: any = null;

  // Time
  private startTime = 0;
  private currentTime = 0;
  private originalCameraState: any = null;

  // Geometry / orbit helpers
  private centroid = new THREE.Vector3();
  private sphericalTrack: { r: number; phi: number; theta: number }[] = [];
  private orbitTurns = 1;                 // can be overridden via (config as any).orbitTurns
  private orbitDirection: 1 | -1 | 0 = 0; // 0=auto from first step

  // Constant-speed sampling/timeline
  private readonly DEFAULT_SAMPLES_PER_SEGMENT = 128;
  private samplesPerSegment = this.DEFAULT_SAMPLES_PER_SEGMENT;

  private segCount = 0;
  private totalLength = 0;
  private totalPause = 0;
  private moveTimeTotal = 0;
  private speed = 0; // v = totalLength / moveTimeTotal

  // For each segment i in [0..segCount-1]:
  //   - lookup tables for arc length: s[k] (cumulative), u[k] (0..1), pos[k]
  private segTableS: Float32Array[] = [];
  private segTableU: Float32Array[] = [];
  private segLen: number[] = [];

  // Timeline per segment (global time):
  //   timeStart[i] -> start of movement
  //   timeEndMove[i] -> end of movement (arrival at next key)
  //   timeEndPause[i] -> end of pause after arrival
  private timeStart: number[] = [];
  private timeEndMove: number[] = [];
  private timeEndPause: number[] = [];
  private pauseAfter: number[] = []; // pause at destination key (seam has 0)

  constructor() {
    console.log('🎥 OrbitEffect (constant-speed) initialized');
  }

  // ---------- lifecycle ----------
  async init(context: any): Promise<void> {
    this.context = context;
    if (!context?.scene || !context?.camera || !context?.controls || !context?.renderer) {
      throw new Error('OrbitEffect: Invalid context - missing scene, camera, controls, or renderer');
    }
    this.scene = context.scene;
    this.camera = context.camera;
    this.controls = context.controls;
    this.renderer = context.renderer;
    this.updateCentroid();
  }

  dispose(): void {
    if (isDisposed(this.state)) return;
    this.stop();
    this.state = OrbitState.DISPOSED;
  }

  getConfig(): OrbitConfig { return { ...this.config }; }
  setConfig(config: OrbitConfig): void {
    this.config = { ...config };
  }
  setOnComplete(cb: () => void): void { this.onComplete = cb; }
  setRecording(recording: boolean): void { this.isRecording = recording; }

  play(): void {
    if (!canPlay(this.state)) return;

    // Optional overrides from config
    this.samplesPerSegment = Math.max(
      16,
      Math.floor((this.config as any).samplesPerSegment ?? this.DEFAULT_SAMPLES_PER_SEGMENT)
    );
    this.orbitTurns = Math.max(1, Math.floor((this.config as any).orbitTurns ?? 1));
    this.orbitDirection = ((this.config as any).orbitDirection ?? 0) as any;

    const validation = validateConfig(this.config, this.centroid.toArray() as [number, number, number]);
    if (!validation.isValid) {
      console.error('🎥 OrbitEffect: invalid config:', validation.errors);
      return;
    }

    this.saveOriginalCameraState();
    if (this.controls) this.controls.enabled = false;

    // Build orbit helpers (unwrapped θ) for locked mode
    this.buildSphericalTrack();

    // Build constant-speed tables and timeline
    const ok = this.buildArcLengthTablesAndTimeline();
    if (!ok) {
      console.warn('🎥 OrbitEffect: nothing to animate');
      return;
    }

    this.state = OrbitState.PLAYING;
    this.startTime = performance.now();
    this.currentTime = 0;
  }

  pause(): void { if (canPause(this.state)) this.state = OrbitState.PAUSED; }
  resume(): void {
    if (!canResume(this.state)) return;
    this.state = OrbitState.PLAYING;
    this.startTime = performance.now() - this.currentTime * 1000;
  }

  stop(): void {
    if (!canStop(this.state)) return;
    this.state = OrbitState.IDLE;
    this.handleFinalization();
    if (this.controls) this.controls.enabled = true;
  }

  tick(_: number): void {
    if (!canTick(this.state)) return;

    const rawT = (performance.now() - this.startTime) / 1000;

    // Seamless loop: play once and stop (path already returns to start)
    // This allows video players to loop the recording smoothly
    if (rawT >= this.config.durationSec) {
      this.stop();
      this.onComplete?.();
      return;
    }

    // Clamp time to duration (never wrap/loop during playback)
    const t = Math.min(rawT, this.config.durationSec);
    this.currentTime = t;

    this.applyCameraAtGlobalTime(t);
  }

  jumpToKeyframe(keyIndex: number): void {
    if (keyIndex < 0 || keyIndex >= this.config.keys.length) return;
    const key = this.config.keys[keyIndex];
    const wasPlaying = this.state === OrbitState.PLAYING;
    if (wasPlaying) this.pause();
    if (!this.originalCameraState) this.saveOriginalCameraState();
    if (this.controls) this.controls.enabled = false;
    this.animateToKeyframe(key, 400);
  }

  // ---------- building helpers ----------

  private updateCentroid(): void {
    const box = new THREE.Box3();
    this.scene.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox?.();
        if (child.geometry.boundingBox) box.expandByObject(child);
      }
    });
    if (!box.isEmpty()) box.getCenter(this.centroid); else this.centroid.set(0, 0, 0);
  }

  private saveOriginalCameraState(): void {
    this.originalCameraState = {
      position: this.camera.position.clone(),
      target: this.controls?.target?.clone() || new THREE.Vector3(),
      fov: this.camera.fov
    };
  }

  /** Build unwrapped spherical track for 'locked' mode. */
  private buildSphericalTrack(): void {
    this.sphericalTrack = [];
    const keys = this.config.keys;
    if (!keys.length) return;

    const sph = keys.map(k => {
      const v = new THREE.Vector3(...k.pos).sub(this.centroid);
      const s = new THREE.Spherical().setFromVector3(v);
      return { r: s.radius, phi: s.phi, theta: s.theta };
    });

    // Direction (forced or inferred)
    let dir: 1 | -1 = (this.orbitDirection || 0) as any;
    if (!dir) {
      const d = ((sph[1]?.theta ?? 0) - sph[0].theta);
      dir = (d >= 0 ? 1 : -1);
    }

    // Unwrap θ monotonically
    for (let i = 1; i < sph.length; i++) {
      let d = sph[i].theta - sph[i - 1].theta;
      while (dir > 0 && d <= 0) d += Math.PI * 2;
      while (dir < 0 && d >= 0) d -= Math.PI * 2;
      sph[i].theta = sph[i - 1].theta + d;
    }

    if (this.config.loop) {
      const first = sph[0];
      const last = sph[sph.length - 1];
      const span = Math.abs(last.theta - first.theta);
      const endTheta = (span >= Math.PI * 1.5)
        ? (last.theta + dir * Math.PI * 2)
        : (first.theta + dir * (this.orbitTurns * Math.PI * 2));
      this.sphericalTrack = [...sph, { r: first.r, phi: first.phi, theta: endTheta }];
    } else {
      this.sphericalTrack = sph;
    }
  }

  /** Build arc-length lookup tables and the global timeline. */
  private buildArcLengthTablesAndTimeline(): boolean {
    const keys = this.config.keys;
    if (keys.length < 2) return false;

    // Segment count (include seam if loop)
    this.segCount = this.config.loop ? keys.length : (keys.length - 1);
    if (this.segCount <= 0) return false;

    // Prepare arrays
    this.segTableS = new Array(this.segCount);
    this.segTableU = new Array(this.segCount);
    this.segLen = new Array(this.segCount).fill(0);

    this.timeStart = new Array(this.segCount).fill(0);
    this.timeEndMove = new Array(this.segCount).fill(0);
    this.timeEndPause = new Array(this.segCount).fill(0);
    this.pauseAfter = new Array(this.segCount).fill(0);

    // Build per-segment arc-length tables
    const N = this.samplesPerSegment;
    const vTempA = new THREE.Vector3();
    const vTempB = new THREE.Vector3();

    const getPos = (segIndex: number, u: number): THREE.Vector3 => {
      // Evaluate position along segment segIndex at param u in [0,1]
      const i = segIndex;
      const j = (i + 1) % keys.length; // destination key index (wraps to 0 for seam)
      if (this.config.mode === 'locked') {
        // Map to spherical endpoints (use appended virtual entry for seam)
        const s1 = this.sphericalTrack[i];
        const s2 = (this.config.loop && j === 0)
          ? this.sphericalTrack[this.sphericalTrack.length - 1]
          : this.sphericalTrack[j];

        // Optional turntable locks
        const lockR = (this.config as any).turntableLockRadius === true;
        const lockPhi = (this.config as any).turntableLockPhi === true;

        const r = lockR ? s1.r : (s1.r + (s2.r - s1.r) * u);
        const phi = lockPhi ? s1.phi : (s1.phi + (s2.phi - s1.phi) * u);
        const theta = s1.theta + (s2.theta - s1.theta) * u;

        const out = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta));
        out.add(this.centroid);
        return out;
      } else {
        // Free: linear in Cartesian
        vTempA.set(...keys[i].pos);
        vTempB.set(...keys[j].pos);
        return vTempA.clone().lerp(vTempB, u);
      }
    };

    // Build tables per segment
    for (let i = 0; i < this.segCount; i++) {
      const sArr = new Float32Array(N + 1);
      const uArr = new Float32Array(N + 1);

      let prev = getPos(i, 0);
      sArr[0] = 0;
      uArr[0] = 0;

      let acc = 0;
      for (let k = 1; k <= N; k++) {
        const u = k / N;
        const p = getPos(i, u);
        acc += p.distanceTo(prev);
        sArr[k] = acc;
        uArr[k] = u;
        prev = p;
      }

      this.segTableS[i] = sArr;
      this.segTableU[i] = uArr;
      this.segLen[i] = acc;
    }

    // Total length & pauses (pause at DESTINATION key; seam pause forced to 0)
    this.totalLength = this.segLen.reduce((s, x) => s + x, 0);
    this.pauseAfter = this.pauseAfter.map((_) => 0); // initialize

    for (let i = 0; i < this.segCount; i++) {
      const destKeyIndex = (i + 1) % keys.length;
      const p = (keys[destKeyIndex].pauseSec ?? 0);
      this.pauseAfter[i] = (this.config.loop && destKeyIndex === 0) ? 0 : p; // no seam pause
    }

    this.totalPause = this.pauseAfter.reduce((s, x) => s + x, 0);
    this.moveTimeTotal = Math.max(0, this.config.durationSec - this.totalPause);
    this.speed = this.moveTimeTotal > 0 ? (this.totalLength / this.moveTimeTotal) : 0;

    // Build global timeline
    let t = 0;
    for (let i = 0; i < this.segCount; i++) {
      const moveDur = this.speed > 0 ? (this.segLen[i] / this.speed) : 0;
      this.timeStart[i] = t;
      this.timeEndMove[i] = t + moveDur;
      this.timeEndPause[i] = this.timeEndMove[i] + this.pauseAfter[i];
      t = this.timeEndPause[i];
    }

    // Minor numeric drift correction: clamp final to duration
    if (this.segCount > 0) {
      const drift = this.config.durationSec - this.timeEndPause[this.segCount - 1];
      if (Math.abs(drift) > 1e-4) {
        // Distribute small drift across movement intervals
        for (let i = 0; i < this.segCount; i++) {
          this.timeStart[i] += drift * (i / this.segCount);
          this.timeEndMove[i] += drift * (i / this.segCount);
          this.timeEndPause[i] += drift * (i / this.segCount);
        }
      }
    }

    return this.totalLength > 0 && this.moveTimeTotal >= 0;
  }

  // ---------- runtime evaluation ----------

  private applyCameraAtGlobalTime(tGlobal: number): void {
    if (this.segCount <= 0) return;

    // Find segment index by global time
    let i = 0;
    for (; i < this.segCount; i++) {
      if (tGlobal < this.timeEndPause[i]) break;
    }
    if (i >= this.segCount) i = this.segCount - 1; // safety

    if (tGlobal <= this.timeEndMove[i]) {
      // Moving along segment i
      const tLocal = tGlobal - this.timeStart[i];
      const sLocal = Math.min(this.segLen[i], Math.max(0, this.speed * tLocal));
      const u = this.uFromDistance(i, sLocal);

      this.setPoseOnSegment(i, u);
    } else {
      // Pausing at destination key (i -> next)
      this.setPoseAtKey((i + 1) % this.config.keys.length);
    }

    // Update controls / projection
    this.camera.updateProjectionMatrix();
    this.controls?.update?.();
  }

  private uFromDistance(segIndex: number, s: number): number {
    const S = this.segTableS[segIndex];
    const U = this.segTableU[segIndex];

    // Binary search for s within S
    let lo = 0, hi = S.length - 1;
    if (s <= 0) return 0;
    const sMax = S[hi];
    if (s >= sMax) return 1;

    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= s) lo = mid; else hi = mid;
    }

    const s0 = S[lo], s1 = S[hi];
    const u0 = U[lo], u1 = U[hi];
    const f = (s1 > s0) ? (s - s0) / (s1 - s0) : 0;
    return u0 + (u1 - u0) * f;
  }

  private setPoseOnSegment(segIndex: number, u: number): void {
    const keys = this.config.keys;
    const i = segIndex;
    const j = (i + 1) % keys.length;

    // Position (constant-speed param u)
    const pos = this.evalSegmentPosition(i, u);
    this.camera.position.copy(pos);

    // Target
    const target = this.evalSegmentTarget(i, j, u);
    this.controls?.target?.copy(target);

    // FOV (linear across segment; independent of speed)
    const fov1 = keys[i].fov ?? this.camera.fov;
    const fov2 = keys[j].fov ?? this.camera.fov;
    this.camera.fov = fov1 + (fov2 - fov1) * u;
  }

  private setPoseAtKey(keyIndex: number): void {
    const keys = this.config.keys;
    const k = keys[keyIndex];

    // Position
    this.camera.position.set(...k.pos);

    // Target
    const target =
      (this.config.lockTargetToCentroid || this.config.mode === 'locked')
        ? this.centroid
        : (k.target ? new THREE.Vector3(...k.target) : this.centroid);
    this.controls?.target?.copy(target);

    // FOV
    if (k.fov !== undefined) this.camera.fov = k.fov;
  }

  private evalSegmentPosition(segIndex: number, u: number): THREE.Vector3 {
    const keys = this.config.keys;
    const i = segIndex;
    const j = (i + 1) % keys.length;

    if (this.config.mode === 'locked') {
      const s1 = this.sphericalTrack[i];
      const s2 = (this.config.loop && j === 0)
        ? this.sphericalTrack[this.sphericalTrack.length - 1]
        : this.sphericalTrack[j];

      const lockR = (this.config as any).turntableLockRadius === true;
      const lockPhi = (this.config as any).turntableLockPhi === true;

      const r = lockR ? s1.r : (s1.r + (s2.r - s1.r) * u);
      const phi = lockPhi ? s1.phi : (s1.phi + (s2.phi - s1.phi) * u);
      const theta = s1.theta + (s2.theta - s1.theta) * u;

      const out = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta));
      out.add(this.centroid);
      return out;
    } else {
      const a = new THREE.Vector3(...keys[i].pos);
      const b = new THREE.Vector3(...keys[j].pos);
      return a.lerp(b, u);
    }
  }

  private evalSegmentTarget(i: number, j: number, u: number): THREE.Vector3 {
    if (this.config.lockTargetToCentroid || this.config.mode === 'locked') {
      return this.centroid.clone();
    }
    const k1 = this.config.keys[i];
    const k2 = this.config.keys[j];
    if (k1.target && k2.target) {
      const a = new THREE.Vector3(...k1.target);
      const b = new THREE.Vector3(...k2.target);
      return a.lerp(b, u);
    }
    return this.centroid.clone();
  }

  // ---------- misc helpers ----------

  private animateToKeyframe(key: OrbitKeyframe, duration: number): void {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls?.target?.clone() || new THREE.Vector3();
    const startFov = this.camera.fov;

    const endPos = new THREE.Vector3(...key.pos);
    const endTarget = (this.config.lockTargetToCentroid || this.config.mode === 'locked')
      ? this.centroid.clone()
      : (key.target ? new THREE.Vector3(...key.target) : this.centroid.clone());
    const endFov = key.fov ?? this.camera.fov;

    const t0 = performance.now();
    const step = () => {
      const p = Math.min((performance.now() - t0) / duration, 1);
      const e = (p < 0.5) ? 2 * p * p : -1 + (4 - 2 * p) * p; // easeInOut

      this.camera.position.lerpVectors(startPos, endPos, e);
      this.controls?.target?.lerpVectors(startTarget, endTarget, e);
      this.camera.fov = startFov + (endFov - startFov) * e;

      this.camera.updateProjectionMatrix();
      this.controls?.update?.();

      if (p < 1) requestAnimationFrame(step);
      else if (this.controls) this.controls.enabled = (this.state !== OrbitState.PLAYING);
    };
    step();
  }

  private handleFinalization(): void {
    if (!this.originalCameraState) return;
    switch (this.config.finalize) {
      case 'returnToStart':
        this.camera.position.copy(this.originalCameraState.position);
        this.controls?.target?.copy(this.originalCameraState.target);
        this.camera.fov = this.originalCameraState.fov;
        this.camera.updateProjectionMatrix();
        break;
      case 'snapToPose':
        break;
      case 'leaveAsEnded':
      default:
        if (this.controls?.target) {
          this.controls.target.copy(this.config.lockTargetToCentroid ? this.centroid : this.controls.target);
        }
        break;
    }
    this.controls?.update?.();
    setTimeout(() => this.controls?.update?.(), 16);
  }
}
