// src/game/pvp/matchClipPlanner.ts
// PvP match-replay share clip — PURE planning layer (Q4, product review
// 2026-07-22). Two responsibilities, both side-effect free and unit-testable:
//
//  1. summarizeMatch — replay a finished session's game_moves through the
//     SAME reducer path production uses (buildPvPBaseState +
//     applyPvPMoveToState) and diff consecutive board states into per-move
//     ADDED pieces (with cells in the recorded CLICK order) and REMOVED
//     pieces (check-repair / hint-repair drama beats), plus running scores.
//     Always replayed from player 1's perspective so scores map 1:1 onto
//     the session's player1/player2 regardless of who is sharing.
//
//  2. planMatchClip — turn that summary into a beat timeline for the clip:
//     {t, type} events (formingSphere / solidify / hintFlash / removeGlow /
//     remove / outcome) auto-paced to a fixed clip budget (~20-25s max):
//     ~1s per eventful move for short games, accelerating for long ones,
//     with the final move always getting a slower beat + a brief hold
//     before the outcome card.
//
// The modal (MatchReplayClipModal) owns all rendering/audio side effects.

import type { InventoryState } from '../contracts/GameState';
import type { PuzzleSpec, IJK } from '../puzzle/PuzzleTypes';
import { buildPvPBaseState, applyPvPMoveToState } from './replaySession';
import type { PvPGameSession, PvPGameMove } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface MatchScore {
  p1: number;
  p2: number;
}

/** One piece appearing in (or vanishing from) the replay. `cells` preserve
 *  the original tap sequence — the forming animation walks them in order. */
export interface ReplayPiece {
  uid: string;
  pieceId: string;
  cells: IJK[];
  placedBy: 1 | 2;
}

export type MatchMoveKind =
  | 'place'
  | 'hint'
  | 'check'
  | 'pass'
  | 'resign'
  | 'timeout';

export interface MatchMoveSummary {
  moveNumber: number;
  mover: 1 | 2;
  kind: MatchMoveKind;
  /** Piece(s) placed by this move (0 or 1). */
  added: ReplayPiece[];
  /** Pieces removed by this move's repair reconciliation (check-hit,
   *  hint-triggered repair, repair-only hint rows). */
  removed: ReplayPiece[];
  /** Running score AFTER this move, in session player order. */
  scoreAfter: MatchScore;
}

export interface MatchSummary {
  moves: MatchMoveSummary[];
  finalScore: MatchScore;
  /** Every piece that ever appeared, by replay uid (registry for the scene
   *  driver: final-board pieces map to live meshes, removed ones need
   *  temporary meshes). */
  pieces: Record<string, ReplayPiece>;
}

export type ClipBeat =
  | {
      t: number;
      type: 'formingSphere';
      uid: string;
      /** Reveal spheres [0..sphereIndex] of the piece (click order). */
      sphereIndex: number;
      totalSpheres: number;
      placedBy: 1 | 2;
    }
  | {
      t: number;
      type: 'solidify';
      uid: string;
      placedBy: 1 | 2;
      viaHint: boolean;
      scoreAfter: MatchScore;
    }
  | { t: number; type: 'hintFlash'; uid: string }
  | { t: number; type: 'removeGlow'; uids: string[] }
  | { t: number; type: 'remove'; uids: string[]; scoreAfter: MatchScore }
  | { t: number; type: 'outcome' };

export interface MatchClipPlan {
  /** Chronological beats (ascending t; ties keep emission order). */
  beats: ClipBeat[];
  /** Total clip length including the outcome card. */
  durationSec: number;
  /** Names/scores header shows from 0; board stays empty until this. */
  introSec: number;
  /** When the outcome card takes over (== the 'outcome' beat's t). */
  outcomeAtSec: number;
  pieces: Record<string, ReplayPiece>;
  finalScore: MatchScore;
}

// ============================================================================
// PACING CONSTANTS (exported for tests)
// ============================================================================

export const CLIP_PACING = {
  INTRO_SEC: 1.2,
  OUTCOME_SEC: 3.2,
  FINAL_HOLD_SEC: 1.0,
  /** The last eventful move always gets at least this much room. */
  FINAL_MOVE_SEC: 1.8,
  /** Short games: about one second per eventful move. */
  PER_MOVE_IDEAL_SEC: 1.0,
  /** The whole moves section never exceeds this (long games accelerate). */
  MOVES_BUDGET_MAX_SEC: 17,
  MOVES_BUDGET_MIN_SEC: 3,
  /** Sphere-forming tick spacing inside a move slot. */
  TICK_MIN_SEC: 0.1,
  TICK_MAX_SEC: 0.25,
} as const;

/** Hard ceiling any plan respects (intro + capped moves + slow final beat +
 *  hold + outcome card). */
export const CLIP_MAX_TOTAL_SEC =
  CLIP_PACING.INTRO_SEC +
  CLIP_PACING.MOVES_BUDGET_MAX_SEC +
  CLIP_PACING.FINAL_MOVE_SEC +
  CLIP_PACING.FINAL_HOLD_SEC +
  CLIP_PACING.OUTCOME_SEC;

// ============================================================================
// 1. SUMMARIZE — replay + diff (pure; uses the production reducer path)
// ============================================================================

/**
 * Replay a finished session's moves and summarize each into added/removed
 * pieces + running score. Returns null when the history cannot be replayed
 * (legacy hint rows, corrupt payloads) — callers hide the share option.
 *
 * Perspective: always player 1 (myPlayerNumber=1), so state.players[0] IS
 * session player1 and scores need no remapping.
 */
export function summarizeMatch(
  session: PvPGameSession,
  moves: PvPGameMove[],
  puzzleSpec: PuzzleSpec,
  fallbackInventory?: InventoryState
): MatchSummary | null {
  try {
    let state = buildPvPBaseState(session, puzzleSpec, fallbackInventory);

    const ordered = [...moves].sort(
      (a, b) =>
        (a.move_number ?? 0) - (b.move_number ?? 0) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
        String(a.id).localeCompare(String(b.id))
    );

    const summaries: MatchMoveSummary[] = [];
    const pieces: Record<string, ReplayPiece> = {};
    // Who placed each live piece (removed pieces report their PLACER).
    const placerByUid = new Map<string, 1 | 2>();

    for (const move of ordered) {
      const prev = state;
      const next = applyPvPMoveToState(state, move, 1);
      if (!next) return null; // history not reconstructable
      state = next;

      const added: ReplayPiece[] = [];
      const removed: ReplayPiece[] = [];
      for (const [uid, piece] of next.boardState) {
        if (!prev.boardState.has(uid)) {
          const rp: ReplayPiece = {
            uid,
            pieceId: piece.pieceId,
            // The recorded move cells carry the original tap sequence; the
            // reducer preserves them, but prefer the move payload when
            // present so click order provably survives.
            cells:
              move.cells && move.cells.length === piece.cells.length
                ? move.cells
                : piece.cells,
            placedBy: move.player_number,
          };
          added.push(rp);
          pieces[uid] = rp;
          placerByUid.set(uid, move.player_number);
        }
      }
      for (const [uid, piece] of prev.boardState) {
        if (!next.boardState.has(uid)) {
          const rp: ReplayPiece = {
            uid,
            pieceId: piece.pieceId,
            cells: piece.cells,
            placedBy: placerByUid.get(uid) ?? move.player_number,
          };
          removed.push(rp);
          pieces[uid] = pieces[uid] ?? rp;
        }
      }

      summaries.push({
        moveNumber: move.move_number ?? 0,
        mover: move.player_number,
        kind: (move.move_type as MatchMoveKind) ?? 'pass',
        added,
        removed,
        scoreAfter: {
          p1: state.players[0]?.score ?? 0,
          p2: state.players[1]?.score ?? 0,
        },
      });
    }

    return {
      moves: summaries,
      finalScore: {
        p1: state.players[0]?.score ?? 0,
        p2: state.players[1]?.score ?? 0,
      },
      pieces,
    };
  } catch (err) {
    console.warn('🎬 [MatchClip] summarizeMatch threw:', err);
    return null;
  }
}

// ============================================================================
// 2. PLAN — beat timeline under a fixed clip budget
// ============================================================================

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Build the beat timeline. Pure over the summary — deterministic for a given
 * input, so tests can assert exact pacing.
 */
export function planMatchClip(summary: MatchSummary): MatchClipPlan {
  const P = CLIP_PACING;
  // Only moves that change the board earn screen time.
  const eventful = summary.moves.filter(
    (m) => m.added.length > 0 || m.removed.length > 0
  );

  const beats: ClipBeat[] = [];
  let t = P.INTRO_SEC;

  if (eventful.length > 0) {
    const n = eventful.length;
    const budget = clamp(
      n * P.PER_MOVE_IDEAL_SEC,
      P.MOVES_BUDGET_MIN_SEC,
      P.MOVES_BUDGET_MAX_SEC
    );
    // Long games accelerate: the budget divides across all non-final moves;
    // the final move always gets the slow FINAL_MOVE_SEC beat on top.
    const perMove = n > 1 ? budget / n : budget;

    eventful.forEach((move, idx) => {
      const isFinal = idx === n - 1;
      const slot = isFinal ? Math.max(perMove, P.FINAL_MOVE_SEC) : perMove;
      const t0 = t;

      // -- Repair drama first: doomed pieces glow, then vanish. --
      let formStart = t0;
      if (move.removed.length > 0) {
        const uids = move.removed.map((p) => p.uid);
        const hasPlacement = move.added.length > 0;
        // Repair-only moves get the whole slot; combined hint moves spend
        // the first 40% on the removal beat, the rest on forming.
        const removeSpan = hasPlacement ? slot * 0.4 : slot;
        beats.push({ t: t0, type: 'removeGlow', uids });
        beats.push({
          t: t0 + Math.min(removeSpan * 0.7, 0.8),
          type: 'remove',
          uids,
          scoreAfter: { ...move.scoreAfter },
        });
        formStart = t0 + removeSpan;
      }

      // -- Sphere-by-sphere forming, in recorded click order. --
      for (const piece of move.added) {
        const c = Math.max(1, piece.cells.length);
        const formSpan = t0 + slot - formStart;
        const gap = clamp(
          (formSpan * 0.6) / c,
          P.TICK_MIN_SEC,
          P.TICK_MAX_SEC
        );
        for (let i = 0; i < c; i++) {
          beats.push({
            t: Math.min(formStart + i * gap, t0 + slot),
            type: 'formingSphere',
            uid: piece.uid,
            sphereIndex: i,
            totalSpheres: c,
            placedBy: piece.placedBy,
          });
        }
        const solidifyAt = Math.min(formStart + c * gap, t0 + slot);
        beats.push({
          t: solidifyAt,
          type: 'solidify',
          uid: piece.uid,
          placedBy: piece.placedBy,
          viaHint: move.kind === 'hint',
          scoreAfter: { ...move.scoreAfter },
        });
        if (move.kind === 'hint') {
          beats.push({ t: solidifyAt, type: 'hintFlash', uid: piece.uid });
        }
      }

      t = t0 + slot;
    });
  }

  const outcomeAtSec = t + P.FINAL_HOLD_SEC;
  beats.push({ t: outcomeAtSec, type: 'outcome' });
  const durationSec = outcomeAtSec + P.OUTCOME_SEC;

  return {
    beats,
    durationSec,
    introSec: P.INTRO_SEC,
    outcomeAtSec,
    pieces: summary.pieces,
    finalScore: summary.finalScore,
  };
}
