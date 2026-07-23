// MatchReplayClipModal — the PvP match-replay share clip (Q4, product review
// 2026-07-22): from a FINISHED real-PvP game's end screen, either player can
// record a vertical 1080×1920 MP4 of the WHOLE match reconstructed from its
// game_moves — both names + live-ticking scores in a header, every piece
// forming sphere-by-sphere in its recorded click order (white hot-glass +
// dark rim, then solidifying to the palette color), hint 💡 beats, check
// repairs as drama beats (doomed pieces glow, then vanish), and an outcome
// end-card — with light game SFX mixed into the recording.
//
// Architecture: the timeline comes from the PURE planner (matchClipPlanner:
// summarizeMatch → planMatchClip); this modal owns every side effect. The
// replay is drawn on the SAME live board scene GamePage already renders
// (exactly how the solo ShareClipModal drives it): the finished board's
// piece meshes are hidden and re-revealed beat by beat via InstancedMesh
// counts (instance order == recorded click order), while pieces that were
// REMOVED mid-game (check/hint repairs) — absent from the final board — get
// temporary meshes built from the replay data and torn down on close.
//
// Audio: the SFX schedule is rendered OFFLINE into the encoded MP4
// (clipEncoder.recordClipWithAudio), and the same beats also fire the normal
// in-game sounds while recording so the live preview is audible.
//
// Preview note (same gotcha as ShareClipModal): we never play the blob in an
// inline <video> — the done-state loops the live composited replay instead,
// and the downloadable MP4 is the real artifact.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import {
  ClipComposer,
  downloadClip,
  waitForFrames,
  type ClipOverlay,
} from '../../services/clipRecorder';
import { recordClipWithAudio, type ClipSfxEvent } from '../../services/clipEncoder';
import { track } from '../../lib/observability';
import { sounds } from '../../utils/audio';
import { cellToKey, type PuzzleData, type IJK } from '../puzzle/PuzzleTypes';
import type { InventoryState } from '../contracts/GameState';
import { computeViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import {
  mat4ToThree,
  estimateSphereRadiusFromView,
  getPieceColor,
} from '../../components/scene/sceneMath';
import { buildBonds } from '../../components/scene/buildBonds';
import { getSessionMoves, getPlayerStats } from './pvpApi';
import type { PvPGameSession } from './types';
import {
  summarizeMatch,
  planMatchClip,
  type MatchClipPlan,
  type ClipBeat,
  type ReplayPiece,
} from './matchClipPlanner';

// Same IJK→XYZ basis useGameBoard/ManualGameBoard use for this board.
const T_IJK_TO_XYZ = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

// Forming material grammar — echoes SceneCanvas's in-progress language
// (white hot-glass + dark back-side rim; see SELECTION_GLOW_* there).
const FORMING_COLOR = 0xf4f7ff;
const FORMING_EMISSIVE = 0xffffff;
const FORMING_EMISSIVE_INTENSITY = 0.6;
const FORMING_OPACITY = 0.92;
const RIM_COLOR = 0x141824;
const RIM_SCALE = 1.14;
const RIM_OPACITY = 0.45;
// Repair drama: doomed pieces glow warm before vanishing.
const DOOM_GLOW_COLOR = 0xff5544;
const DOOM_GLOW_INTENSITY = 0.85;
const REMOVE_FADE_SEC = 0.35;
const FLASH_SEC = 0.8;

// SFX assets (existing files only — no new binaries).
const SFX = {
  formingTick: { url: '/data/Audio/draw.wav', volume: 0.12 },
  place: { url: '/data/Audio/Pop.mp3', volume: 0.5 },
  remove: { url: '/data/Audio/Pop.mp3', volume: 0.22 },
  outcome: { url: '/data/Audio/puzzle solved 2.wav', volume: 0.35 },
} as const;

type SceneObjects = {
  scene: any;
  camera: any;
  renderer: { domElement: HTMLCanvasElement };
  controls: any;
  spheresGroup: THREE.Group & { rotation: { y: number } };
  centroidWorld: any;
};

export interface MatchReplayBoardPiece {
  uid: string;
  pieceId: string;
  cells: IJK[];
}

interface MatchReplayClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneObjects: SceneObjects | null;
  session: PvPGameSession;
  /** Which seat the sharer occupies — only used for analytics/labels. */
  myPlayerNumber: 1 | 2;
  puzzle: PuzzleData;
  /** Final live board (gameState.boardState) — maps replay pieces onto the
   *  live scene meshes by piece signature. */
  boardPieces: MatchReplayBoardPiece[];
  /** Same fallback inventory GamePage hands rebuildGameState. */
  fallbackInventory?: InventoryState;
}

type Phase = 'loading' | 'idle' | 'recording' | 'done' | 'error' | 'unavailable';

/** Stable piece identity across clients (mirrors replaySession's). */
function pieceSignature(pieceId: string, cells: IJK[]): string {
  return `${pieceId}|${cells.map(cellToKey).sort().join(';')}`;
}

/** Everything the driver needs to animate one replay piece. */
interface DrivenPiece {
  replay: ReplayPiece;
  mesh: THREE.InstancedMesh;
  rim: THREE.InstancedMesh;
  bonds: THREE.Group | null;
  /** Piece material (bonds share the same instance — see buildBonds). */
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  baseOpacity: number;
  total: number;
  /** True when the mesh/bonds were created by this modal (removed pieces). */
  temp: boolean;
}

export const MatchReplayClipModal: React.FC<MatchReplayClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  session,
  myPlayerNumber,
  puzzle,
  boardPieces,
  fallbackInventory,
}) => {
  const { t } = useTranslation();
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const rafRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const recordCountRef = useRef(0);
  const baseRotationRef = useRef(0);
  const piecesRef = useRef<Map<string, DrivenPiece>>(new Map());
  const tempObjectsRef = useRef<THREE.Object3D[]>([]);
  const tempDisposablesRef = useRef<{ dispose(): void }[]>([]);
  const setupDoneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MatchClipPlan | null>(null);
  const [winnerBadge, setWinnerBadge] = useState<string | null>(null);
  const [captionMsg, setCaptionMsg] = useState<string | null>(null);

  const p1Name = session.player1_name || 'Player 1';
  const p2Name = session.player2_name || 'Player 2';
  const puzzleName = (puzzle.geometry as any)?.name || session.puzzle_name || '';
  const winner = session.winner;
  const winnerName = winner === 1 ? p1Name : winner === 2 ? p2Name : null;
  const loserName = winner === 1 ? p2Name : winner === 2 ? p1Name : null;

  // View transforms for THIS board — the same math useGameBoard runs, so
  // temporary meshes (removed pieces) land exactly where live ones do.
  const boardGeom = useMemo(() => {
    const cells: IJK[] = (puzzle.geometry as any)?.geometry || [];
    try {
      const view = computeViewTransforms(
        cells,
        ijkToXyz,
        T_IJK_TO_XYZ,
        quickHullWithCoplanarMerge
      );
      return {
        M: mat4ToThree((view as any).M_world),
        radius: estimateSphereRadiusFromView(view as any),
      };
    } catch (e) {
      console.warn('🎬 [MatchClip] view transforms failed:', e);
      return null;
    }
  }, [puzzle]);

  // ---- Load moves + build the plan when the modal opens ----
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPhase('loading');
    setError(null);
    (async () => {
      const moves = await getSessionMoves(session.id);
      if (cancelled) return;
      if (!moves || moves.length === 0) {
        setPhase('unavailable');
        return;
      }
      const summary = summarizeMatch(session, moves, puzzle.spec, fallbackInventory);
      if (cancelled) return;
      if (!summary) {
        setPhase('unavailable');
        return;
      }
      setPlan(planMatchClip(summary));
      setPhase('idle');
    })().catch((e) => {
      console.warn('🎬 [MatchClip] load failed:', e);
      if (!cancelled) setPhase('unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Standings badge: winner's PvP record (player_stats) ----
  useEffect(() => {
    if (!isOpen || !winner) {
      setWinnerBadge(null);
      return;
    }
    const winnerUserId = winner === 1 ? session.player1_id : session.player2_id;
    if (!winnerUserId) return;
    let cancelled = false;
    getPlayerStats(winnerUserId)
      .then((stats) => {
        if (cancelled || !stats) return;
        if (stats.games_played >= 2 && stats.games_won >= 1) {
          setWinnerBadge(
            t('matchClip.recordBadge', {
              wins: stats.games_won,
              games: stats.games_played,
            })
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, winner, session.player1_id, session.player2_id, t]);

  // ==========================================================================
  // SCENE DRIVER
  // ==========================================================================

  /** Map replay pieces onto live meshes (by signature) and build temporary
   *  meshes for pieces missing from the final board (repair removals). */
  const setupScene = (p: MatchClipPlan): boolean => {
    const group = sceneObjects?.spheresGroup;
    if (!group || !boardGeom) return false;
    if (setupDoneRef.current) return true;

    // Live scene objects by uid (mesh + bond groups share userData.uid).
    const liveMeshByUid = new Map<string, THREE.InstancedMesh>();
    const liveBondsByUid = new Map<string, THREE.Group>();
    (group.children || []).forEach((ch: any) => {
      const uid = ch?.userData?.uid;
      if (!uid) return;
      if (ch.isInstancedMesh) liveMeshByUid.set(uid, ch);
      else if (ch.isGroup) liveBondsByUid.set(uid, ch);
    });

    const liveUidBySig = new Map<string, string>();
    for (const bp of boardPieces) {
      liveUidBySig.set(pieceSignature(bp.pieceId, bp.cells), bp.uid);
    }

    const makeRim = (source: THREE.InstancedMesh, count: number): THREE.InstancedMesh => {
      const mat = new THREE.MeshBasicMaterial({
        color: RIM_COLOR,
        side: THREE.BackSide,
        transparent: true,
        opacity: RIM_OPACITY,
        depthWrite: false,
      });
      const rim = new THREE.InstancedMesh(source.geometry, mat, count);
      const m = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        source.getMatrixAt(i, m);
        m.decompose(pos, quat, scl);
        m.compose(pos, quat, scl.multiplyScalar(RIM_SCALE));
        rim.setMatrixAt(i, m);
      }
      rim.instanceMatrix.needsUpdate = true;
      rim.renderOrder = 2;
      rim.visible = false;
      group.add(rim);
      tempObjectsRef.current.push(rim);
      tempDisposablesRef.current.push(mat);
      return rim;
    };

    for (const replay of Object.values(p.pieces)) {
      const sig = pieceSignature(replay.pieceId, replay.cells);
      const liveUid = liveUidBySig.get(sig);
      const liveMesh = liveUid ? liveMeshByUid.get(liveUid) : undefined;

      if (liveMesh) {
        const material = liveMesh.material as THREE.MeshStandardMaterial;
        piecesRef.current.set(replay.uid, {
          replay,
          mesh: liveMesh,
          rim: makeRim(liveMesh, replay.cells.length),
          bonds: liveUid ? liveBondsByUid.get(liveUid) ?? null : null,
          material,
          baseColor: material.color.clone(),
          baseOpacity: material.opacity,
          total: replay.cells.length,
          temp: false,
        });
        continue;
      }

      // Removed mid-game — build a temporary mesh the same way
      // renderPlacedPieces would have drawn it while it lived.
      const { M, radius } = boardGeom;
      const geom = new THREE.SphereGeometry(radius, 32, 24);
      const material = new THREE.MeshStandardMaterial({
        color: getPieceColor(replay.pieceId),
        metalness: 0.4,
        roughness: 0.35,
        transparent: true,
        opacity: 1,
        envMapIntensity: 1.5,
      });
      const mesh = new THREE.InstancedMesh(geom, material, replay.cells.length);
      const positions: THREE.Vector3[] = [];
      replay.cells.forEach((cell, i) => {
        const pos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
        positions.push(pos);
        const m = new THREE.Matrix4();
        m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 1;
      mesh.visible = false;
      group.add(mesh);
      const { bondGroup, cylinderGeo } = buildBonds({
        spherePositions: positions,
        radius,
        material,
        bondRadiusFactor: 0.35,
        thresholdFactor: 1.1,
        radialSegments: 48,
      });
      bondGroup.visible = false;
      group.add(bondGroup);
      tempObjectsRef.current.push(mesh, bondGroup);
      tempDisposablesRef.current.push(geom, material, cylinderGeo);

      piecesRef.current.set(replay.uid, {
        replay,
        mesh,
        rim: makeRim(mesh, replay.cells.length),
        bonds: bondGroup,
        material,
        baseColor: material.color.clone(),
        baseOpacity: 1,
        total: replay.cells.length,
        temp: true,
      });
    }

    baseRotationRef.current = group.rotation.y;
    setupDoneRef.current = true;
    return true;
  };

  /** Rewind the replay: everything hidden, materials restored, score 0-0. */
  const resetReplayState = () => {
    for (const p of piecesRef.current.values()) {
      p.mesh.visible = false;
      p.mesh.count = p.total;
      p.rim.visible = false;
      if (p.bonds) p.bonds.visible = false;
      p.material.color.copy(p.baseColor);
      p.material.opacity = p.baseOpacity;
      p.material.emissive.setHex(0x000000);
      p.material.emissiveIntensity = 0;
      p.material.needsUpdate = true;
    }
    composerRef.current?.update({
      matchHeader: {
        title: puzzleName || undefined,
        p1: { name: p1Name, score: 0 },
        p2: { name: p2Name, score: 0 },
        activeSide: null,
      },
      flash: { text: t('matchClip.vsTitle', { p1: p1Name, p2: p2Name }) },
      card: null,
    });
  };

  /** Restore the live scene exactly as GamePage had it. */
  const restoreScene = () => {
    const group = sceneObjects?.spheresGroup;
    for (const p of piecesRef.current.values()) {
      if (p.temp) continue;
      p.mesh.visible = true;
      p.mesh.count = p.total;
      if (p.bonds) p.bonds.visible = true;
      p.material.color.copy(p.baseColor);
      p.material.opacity = p.baseOpacity;
      p.material.emissive.setHex(0x000000);
      p.material.emissiveIntensity = 0;
      p.material.needsUpdate = true;
    }
    // Any live piece the replay never touched (defensive) stays visible.
    (group?.children || []).forEach((ch: any) => {
      if (ch?.userData?.uid && !tempObjectsRef.current.includes(ch)) {
        ch.visible = true;
      }
    });
    for (const obj of tempObjectsRef.current) group?.remove(obj);
    for (const d of tempDisposablesRef.current) {
      try {
        d.dispose();
      } catch {
        /* already disposed */
      }
    }
    tempObjectsRef.current = [];
    tempDisposablesRef.current = [];
    piecesRef.current.clear();
    setupDoneRef.current = false;
    if (group) group.rotation.y = baseRotationRef.current;
  };

  /** Apply one beat to the scene/overlay (and optionally play it aloud). */
  const applyBeat = (
    beat: ClipBeat,
    p: MatchClipPlan,
    audible: boolean,
    tweens: { mat: THREE.MeshStandardMaterial; piece: DrivenPiece; start: number }[],
    nowSec: number,
    flashState: { until: number }
  ) => {
    const composer = composerRef.current;
    switch (beat.type) {
      case 'formingSphere': {
        const piece = piecesRef.current.get(beat.uid);
        if (!piece) break;
        if (beat.sphereIndex === 0) {
          piece.mesh.visible = true;
          if (piece.bonds) piece.bonds.visible = false;
          piece.material.color.setHex(FORMING_COLOR);
          piece.material.emissive.setHex(FORMING_EMISSIVE);
          piece.material.emissiveIntensity = FORMING_EMISSIVE_INTENSITY;
          piece.material.opacity = FORMING_OPACITY;
          piece.material.needsUpdate = true;
          piece.rim.visible = true;
        }
        piece.mesh.count = beat.sphereIndex + 1;
        piece.rim.count = beat.sphereIndex + 1;
        if (audible) sounds.formingTick();
        break;
      }
      case 'solidify': {
        const piece = piecesRef.current.get(beat.uid);
        if (!piece) break;
        piece.mesh.visible = true;
        piece.mesh.count = piece.total;
        piece.rim.visible = false;
        if (piece.bonds) piece.bonds.visible = true;
        piece.material.color.copy(piece.baseColor);
        piece.material.emissive.setHex(0x000000);
        piece.material.emissiveIntensity = 0;
        piece.material.opacity = piece.baseOpacity;
        piece.material.needsUpdate = true;
        composer?.update({
          matchHeader: {
            title: puzzleName || undefined,
            p1: { name: p1Name, score: beat.scoreAfter.p1 },
            p2: { name: p2Name, score: beat.scoreAfter.p2 },
            activeSide: beat.placedBy,
          },
        });
        if (audible) sounds.place();
        break;
      }
      case 'hintFlash': {
        composer?.update({
          flash: { text: '💡', sub: t('matchClip.hintUsed') },
        });
        flashState.until = nowSec + FLASH_SEC;
        break;
      }
      case 'removeGlow': {
        for (const uid of beat.uids) {
          const piece = piecesRef.current.get(uid);
          if (!piece) continue;
          piece.material.emissive.setHex(DOOM_GLOW_COLOR);
          piece.material.emissiveIntensity = DOOM_GLOW_INTENSITY;
          piece.material.needsUpdate = true;
        }
        composer?.update({
          flash: { text: '🔍', sub: t('matchClip.checkStamp') },
        });
        flashState.until = nowSec + FLASH_SEC;
        break;
      }
      case 'remove': {
        for (const uid of beat.uids) {
          const piece = piecesRef.current.get(uid);
          if (!piece) continue;
          tweens.push({ mat: piece.material, piece, start: nowSec });
        }
        composer?.update({
          matchHeader: {
            title: puzzleName || undefined,
            p1: { name: p1Name, score: beat.scoreAfter.p1 },
            p2: { name: p2Name, score: beat.scoreAfter.p2 },
            activeSide: null,
          },
        });
        if (audible) sounds.remove();
        break;
      }
      case 'outcome': {
        composer?.update({
          flash: null,
          card: {
            heading: winnerName
              ? t('matchClip.winsBanner', { name: winnerName })
              : t('matchClip.draw'),
            score: `${p.finalScore.p1} – ${p.finalScore.p2}`,
            reason: endReasonText(),
            badge: winnerBadge ?? undefined,
            cta: winnerName
              ? t('matchClip.cardCta', { name: winnerName })
              : undefined,
            watermark: 'koospuzzle.com',
          },
        });
        if (audible) sounds.puzzleSolved();
        break;
      }
    }
  };

  const endReasonText = (): string | undefined => {
    switch (session.end_reason) {
      case 'completed':
        return t('matchClip.reasonCompleted');
      case 'resign':
        return loserName
          ? t('matchClip.reasonResigned', { name: loserName })
          : undefined;
      case 'timeout':
        return loserName
          ? t('matchClip.reasonTimeout', { name: loserName })
          : undefined;
      case 'disconnect':
        return loserName
          ? t('matchClip.reasonDisconnect', { name: loserName })
          : undefined;
      case 'stalled':
        return t('matchClip.reasonStalled');
      default:
        return undefined;
    }
  };

  /** Play the whole replay once (or in a loop) against the plan. */
  const playTimeline = (
    p: MatchClipPlan,
    opts: { loop: boolean; audible: boolean; onDone?: () => void }
  ) => {
    const group = sceneObjects?.spheresGroup;
    if (!group) return;
    resetReplayState();

    let startMs = performance.now();
    let nextBeat = 0;
    let tweens: { mat: THREE.MeshStandardMaterial; piece: DrivenPiece; start: number }[] = [];
    const flashState = { until: p.introSec };

    const step = () => {
      const now = (performance.now() - startMs) / 1000;

      // One graceful full rotation across the whole clip.
      group.rotation.y =
        baseRotationRef.current + (now / p.durationSec) * Math.PI * 2;

      while (nextBeat < p.beats.length && p.beats[nextBeat].t <= now) {
        applyBeat(p.beats[nextBeat], p, opts.audible, tweens, now, flashState);
        nextBeat++;
      }

      // Removal fade-outs.
      tweens = tweens.filter((tw) => {
        const k = (now - tw.start) / REMOVE_FADE_SEC;
        if (k >= 1) {
          tw.piece.mesh.visible = false;
          tw.piece.rim.visible = false;
          if (tw.piece.bonds) tw.piece.bonds.visible = false;
          tw.mat.opacity = tw.piece.baseOpacity;
          tw.mat.emissive.setHex(0x000000);
          tw.mat.emissiveIntensity = 0;
          tw.mat.needsUpdate = true;
          return false;
        }
        tw.mat.opacity = tw.piece.baseOpacity * (1 - k);
        tw.mat.needsUpdate = true;
        return true;
      });

      // Transient flash expiry.
      if (flashState.until > 0 && now >= flashState.until) {
        composerRef.current?.update({ flash: null });
        flashState.until = 0;
      }

      if (now >= p.durationSec) {
        if (opts.loop) {
          startMs = performance.now();
          nextBeat = 0;
          tweens = [];
          flashState.until = p.introSec;
          resetReplayState();
        } else {
          rafRef.current = null;
          opts.onDone?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const stopDriver = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // ---- Full teardown: driver, compositor, scene, blob URL ----
  const teardown = () => {
    stopDriver();
    composerRef.current?.stop();
    composerRef.current = null;
    if (setupDoneRef.current) restoreScene();
  };

  useEffect(() => {
    return () => {
      teardown();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  const sfxSchedule = (p: MatchClipPlan): ClipSfxEvent[] => {
    const events: ClipSfxEvent[] = [];
    for (const beat of p.beats) {
      switch (beat.type) {
        case 'formingSphere':
          events.push({ timeSec: beat.t, ...SFX.formingTick });
          break;
        case 'solidify':
          events.push({ timeSec: beat.t, ...SFX.place });
          break;
        case 'remove':
          events.push({ timeSec: beat.t, ...SFX.remove });
          break;
        case 'outcome':
          events.push({ timeSec: beat.t, ...SFX.outcome });
          break;
        default:
          break;
      }
    }
    return events;
  };

  const handleRecord = async () => {
    const source = sceneObjects?.renderer?.domElement;
    if (!source || !plan) return;
    if (!setupScene(plan)) {
      setError(t('shareClip.sceneNotReady'));
      setPhase('error');
      return;
    }

    setError(null);
    setPhase('recording');
    await new Promise((r) => setTimeout(r, 0));

    const composer = new ClipComposer();
    composerRef.current = composer;

    try {
      const c = composer.canvas;
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.objectFit = 'contain';
      c.style.display = 'block';
      if (previewRef.current) {
        previewRef.current.innerHTML = '';
        previewRef.current.appendChild(c);
      }
      const overlay: ClipOverlay = {
        watermark: 'koospuzzle.com',
        matchHeader: {
          title: puzzleName || undefined,
          p1: { name: p1Name, score: 0 },
          p2: { name: p2Name, score: 0 },
          activeSide: null,
        },
      };
      composer.start(source, overlay);

      await waitForFrames();
      // Pre-hide the board so no frame of the finished puzzle leaks into the
      // clip while the SFX track is being pre-rendered; the beat driver then
      // starts exactly when capture does (onCaptureStart), keeping the
      // scheduled audio in sync with the video timeline.
      resetReplayState();
      const result = await recordClipWithAudio(
        c,
        plan.durationSec + 0.3,
        sfxSchedule(plan),
        () => playTimeline(plan, { loop: false, audible: true })
      );

      stopDriver();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = result.url;
      blobRef.current = result.blob;
      recordCountRef.current += 1;
      track('match_clip_recorded', {
        moves: plan.beats.length,
        duration_sec: Math.round(plan.durationSec),
        end_reason: session.end_reason ?? 'unknown',
        sharer_won: winner === myPlayerNumber,
      });

      // Done-state: loop the live replay silently as the reliable preview.
      playTimeline(plan, { loop: true, audible: false });
      setPhase('done');
    } catch (e) {
      console.error('🎬 [MatchClip] recording failed', e);
      teardown();
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e instanceof Error ? e.message : t('shareClip.recordingFailed'));
      setPhase('error');
    }
  };

  // ==========================================================================
  // SHARE / DOWNLOAD
  // ==========================================================================

  const buildCaption = () =>
    [
      t('matchClip.captionLine', {
        p1: p1Name,
        p2: p2Name,
        score: plan ? `${plan.finalScore.p1}-${plan.finalScore.p2}` : '',
      }),
      winnerName ? t('matchClip.cardCta', { name: winnerName }) : null,
      'koospuzzle.com',
      t('shareClip.hashtags'),
    ]
      .filter(Boolean)
      .join('\n');

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(buildCaption());
      setCaptionMsg(t('shareClip.captionCopied'));
      track('caption_copied');
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  };

  const clipFile = (blob: Blob): File => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], `koospuzzle-match-${session.id.slice(0, 8)}.${ext}`, {
      type: blob.type || 'video/mp4',
    });
  };

  const canShareFile = (): boolean => {
    const blob = blobRef.current;
    if (!blob || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [clipFile(blob)] });
    } catch {
      return false;
    }
  };

  const handleShareVideo = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    await copyCaption();
    try {
      await navigator.share({
        files: [clipFile(blob)],
        title: 'Koos Puzzle',
        text: buildCaption(),
      });
      track('share_completed', { channel: 'match_clip_share_sheet' });
    } catch {
      // user cancelled the sheet — caption stays on the clipboard
    }
  };

  const handleDownload = () => {
    if (!urlRef.current) return;
    const n = recordCountRef.current;
    downloadClip(
      urlRef.current,
      `koospuzzle-match-${session.id.slice(0, 8)}${n > 1 ? `-${n}` : ''}.mp4`
    );
    void copyCaption();
    track('share_completed', { channel: 'match_clip_download' });
  };

  const handleClose = () => {
    teardown();
    onClose();
  };

  const handleRecordAgain = () => {
    stopDriver();
    composerRef.current?.stop();
    composerRef.current = null;
    if (setupDoneRef.current) restoreScene();
    if (previewRef.current) previewRef.current.innerHTML = '';
    setPhase('idle');
  };

  const canRecord =
    !!sceneObjects && !!plan && !!boardGeom && (phase === 'idle' || phase === 'error');

  // ==========================================================================
  // UI (mobile-first; mirrors ShareClipModal's structure)
  // ==========================================================================

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
      }}
      onClick={phase === 'recording' ? undefined : handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
          color: 'white',
          padding: '24px 24px',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(30,136,229,0.5)',
          maxWidth: '380px',
          width: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 60px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎬</div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          {t('matchClip.title')}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '16px', lineHeight: 1.5 }}>
          {t('matchClip.subtitle', { p1: p1Name, p2: p2Name })}
        </div>

        {phase === 'loading' && (
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>
            {t('matchClip.loadingReplay')}
          </div>
        )}

        {phase === 'unavailable' && (
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>
            {t('matchClip.unavailable')}
          </div>
        )}

        {(phase === 'recording' || phase === 'done') && (
          <div
            style={{
              width: '200px',
              height: '356px', // 9:16
              margin: '0 auto 16px',
              background: '#000',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            }}
          >
            <div ref={previewRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {phase === 'recording' && (
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            {t('matchClip.recording')}
          </div>
        )}

        {phase === 'done' && (
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '12px', lineHeight: 1.4 }}>
            {canShareFile()
              ? t('shareClip.looksGoodShare')
              : t('shareClip.looksGoodDownload')}
          </div>
        )}
        {captionMsg && (
          <div style={{ fontSize: '12px', color: '#d1ffe8', marginBottom: '10px' }}>
            {captionMsg}
          </div>
        )}

        {phase === 'error' && (
          <div style={{ fontSize: '14px', color: '#ffd1d1', marginBottom: '16px' }}>
            {error || t('shareClip.somethingWrong')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(phase === 'idle' || phase === 'recording' || phase === 'error') && (
            <button
              onClick={handleRecord}
              disabled={!canRecord}
              style={{
                background: canRecord ? '#10b981' : 'rgba(255,255,255,0.25)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 20px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: canRecord ? 'pointer' : 'not-allowed',
              }}
            >
              {phase === 'recording'
                ? t('shareClip.recordingBtn')
                : t('shareClip.recordBtn')}
            </button>
          )}

          {phase === 'done' && (
            <>
              {canShareFile() && (
                <button
                  onClick={handleShareVideo}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 20px',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('shareClip.shareVideo')}
                </button>
              )}
              <button
                onClick={handleDownload}
                style={{
                  background: canShareFile() ? 'rgba(255,255,255,0.18)' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: canShareFile() ? '14px' : '16px',
                  fontWeight: canShareFile() ? 600 : 700,
                  cursor: 'pointer',
                }}
              >
                {t('shareClip.downloadClip')}
              </button>
              <button
                onClick={handleRecordAgain}
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('shareClip.recordAgain')}
              </button>
            </>
          )}

          <button
            onClick={handleClose}
            disabled={phase === 'recording'}
            style={{
              background: 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: phase === 'recording' ? 'not-allowed' : 'pointer',
              opacity: phase === 'recording' ? 0.5 : 1,
            }}
          >
            {t('shareClip.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchReplayClipModal;
