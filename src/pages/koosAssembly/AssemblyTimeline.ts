import * as THREE from 'three';
import { PieceId } from './loadSolutionForAssembly';
import { PieceTransform, ThreeTransforms } from './computeAssemblyTransforms';
import { WORLD_SPHERE_RADIUS } from './constants';

export interface AssemblyTimelineConfig {
  pieceOrder: string[];
  tMoveCurve: number;
  tMoveLine: number;
  tPauseBetween: number;
  rotateMode: 'slerp';
}

export interface PiecePose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export type PoseMap = Record<PieceId, PiecePose>;

export interface TimelineState {
  stage: 'assembling' | 'done';
  activePieceId: PieceId | null;
  activePieceIndex: number; // Index of active piece in pieceOrder (-1 if none/done)
  poses: PoseMap;
  progress01: number;
}

export class AssemblyTimeline {
  private config: AssemblyTimelineConfig;
  private transforms: ThreeTransforms;
  private pieceIds: PieceId[];
  private startTime: number = 0;
  private currentTime: number = 0;
  private paused: boolean = false;

  constructor(
    config: AssemblyTimelineConfig,
    transforms: ThreeTransforms
  ) {
    this.config = config;
    this.transforms = transforms;
    this.pieceIds = config.pieceOrder;
  }

  start(): void {
    this.startTime = performance.now();
    this.currentTime = 0;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.startTime = performance.now() - this.currentTime;
  }

  restart(): void {
    this.start();
  }

  isPaused(): boolean {
    return this.paused;
  }

  getPieceOrder(): string[] {
    return this.pieceIds;
  }

  update(nowMs: number): TimelineState {
    if (this.paused) {
      return this.computeState(this.currentTime);
    }

    this.currentTime = nowMs - this.startTime;
    return this.computeState(this.currentTime);
  }

  private computeState(timeMs: number): TimelineState {
    const { tMoveCurve, tMoveLine, tPauseBetween } = this.config;
    const pieceDuration = (tMoveCurve + tMoveLine + tPauseBetween) * 1000;
    const totalDuration = this.pieceIds.length * pieceDuration;

    if (timeMs >= totalDuration) {
      // Animation complete - all pieces in FINAL
      return {
        stage: 'done',
        activePieceId: null,
        activePieceIndex: -1,
        poses: this.getAllFinalPoses(),
        progress01: 1.0,
      };
    }

    const pieceIndex = Math.floor(timeMs / pieceDuration);
    const pieceLocalTime = timeMs % pieceDuration;
    const activePieceId = this.pieceIds[pieceIndex];

    const poses: PoseMap = {};

    // Set poses for all pieces
    this.pieceIds.forEach((pieceId, idx) => {
      if (idx < pieceIndex) {
        // Already placed - use FINAL
        poses[pieceId] = this.clonePose(this.transforms.final[pieceId]);
      } else if (idx === pieceIndex) {
        // Active piece - compute animated pose
        poses[pieceId] = this.computePiecePose(pieceId, pieceLocalTime);
      } else {
        // Not yet placed - use TABLE
        poses[pieceId] = this.clonePose(this.transforms.table[pieceId]);
      }
    });

    return {
      stage: 'assembling',
      activePieceId,
      activePieceIndex: pieceIndex,
      poses,
      progress01: timeMs / totalDuration,
    };
  }

  private computePiecePose(pieceId: PieceId, localTimeMs: number): PiecePose {
    const { tMoveCurve, tMoveLine } = this.config;
    const curveMs = tMoveCurve * 1000;
    const lineMs = tMoveLine * 1000;

    const tableTransform = this.transforms.table[pieceId];
    const explodedTransform = this.transforms.exploded[pieceId];
    const finalTransform = this.transforms.final[pieceId];

    if (!tableTransform || !explodedTransform || !finalTransform) {
      return this.clonePose(tableTransform || finalTransform);
    }

    const totalMoveMs = curveMs + lineMs;
    
    if (localTimeMs < curveMs) {
      // Curved segment: TABLE → EXPLODED
      const t = localTimeMs / curveMs;
      const position = this.computeCurvedPath(
        tableTransform.position,
        explodedTransform.position,
        t
      );
      
      // Rotation: ease over entire move duration
      const overallT = localTimeMs / totalMoveMs;
      const easedT = this.easeInOutCubic(overallT);
      const quaternion = this.slerpQuaternion(
        tableTransform.quaternion,
        finalTransform.quaternion,
        easedT
      );

      return { position, quaternion };
    } else if (localTimeMs < totalMoveMs) {
      // Linear segment: EXPLODED → FINAL
      const t = (localTimeMs - curveMs) / lineMs;
      const position = this.lerpVector(
        explodedTransform.position,
        finalTransform.position,
        t
      );

      // Rotation: continue easing over entire move
      const overallT = localTimeMs / totalMoveMs;
      const easedT = this.easeInOutCubic(overallT);
      const quaternion = this.slerpQuaternion(
        tableTransform.quaternion,
        finalTransform.quaternion,
        easedT
      );

      return { position, quaternion };
    } else {
      // Pause phase - stay at FINAL
      return this.clonePose(finalTransform);
    }
  }

  private computeCurvedPath(
    p0: THREE.Vector3,
    p2: THREE.Vector3,
    t: number
  ): THREE.Vector3 {
    // Compute control point for quadratic Bezier
    const midpoint = p0.clone().add(p2).multiplyScalar(0.5);
    
    // Add vertical lift
    const lift = 2.5 * WORLD_SPHERE_RADIUS;
    midpoint.y += lift;

    // Add sideways bow
    const dir = p2.clone().sub(p0).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
    const bow = side.multiplyScalar(1.5 * WORLD_SPHERE_RADIUS);
    const p1 = midpoint.add(bow);

    // Evaluate quadratic Bezier: B(t) = (1-t)^2 * p0 + 2(1-t)t * p1 + t^2 * p2
    const s = 1 - t;
    const result = new THREE.Vector3();
    result.addScaledVector(p0, s * s);
    result.addScaledVector(p1, 2 * s * t);
    result.addScaledVector(p2, t * t);

    return result;
  }

  private lerpVector(v0: THREE.Vector3, v1: THREE.Vector3, t: number): THREE.Vector3 {
    return v0.clone().lerp(v1, t);
  }

  private slerpQuaternion(q0: THREE.Quaternion, q1: THREE.Quaternion, t: number): THREE.Quaternion {
    return q0.clone().slerp(q1, t);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private clonePose(transform: PieceTransform): PiecePose {
    return {
      position: transform.position.clone(),
      quaternion: transform.quaternion.clone(),
    };
  }

  private getAllFinalPoses(): PoseMap {
    const poses: PoseMap = {};
    this.pieceIds.forEach((pieceId) => {
      poses[pieceId] = this.clonePose(this.transforms.final[pieceId]);
    });
    return poses;
  }

  getTotalDuration(): number {
    const { tMoveCurve, tMoveLine, tPauseBetween } = this.config;
    const pieceDuration = (tMoveCurve + tMoveLine + tPauseBetween) * 1000;
    return this.pieceIds.length * pieceDuration;
  }
}

export function createDeterministicPieceOrder(
  pieceIds: PieceId[],
  transforms: ThreeTransforms,
  puzzleCentroid: THREE.Vector3
): PieceId[] {
  // Sort by distance from puzzle centroid (farther first for better visual)
  const sorted = pieceIds.slice().sort((a, b) => {
    const distA = transforms.final[a].position.distanceTo(puzzleCentroid);
    const distB = transforms.final[b].position.distanceTo(puzzleCentroid);
    return distB - distA; // Farther first
  });
  return sorted;
}
