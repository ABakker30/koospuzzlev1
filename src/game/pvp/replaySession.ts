// src/game/pvp/replaySession.ts
// PvP Phase 2a: board reconstruction by replaying moves.
//
// A PvP game must be openable at ANY point in its life by either player (or
// after a refresh) by rebuilding the local GameState from the session row +
// the game_moves history. Everything here is pure and reducer-driven:
//
//  - buildPvPBaseState   — the ONE place a PvP GameState is constructed from a
//                          session row (shared by fresh match start + replay).
//  - applyPvPMoveToState — the ONE place a persisted/remote move is turned
//                          into reducer events (shared by the live game_moves
//                          realtime handler and replay, so live application
//                          and reconstruction can never diverge).
//  - rebuildGameState    — sort the history, apply every move, cross-check
//                          against the session row. Returns null (never
//                          throws) on anything that would corrupt state.
//
// Authority split (by design): the REPLAY is authoritative for board state /
// scores / inventory; the SESSION ROW is authoritative for whose turn it is
// and the clocks.
//
// Perspective note: the local engine always seats the viewing player at
// index 0 ("You") and the opponent at index 1 ("Opponent"), regardless of who
// is player1/player2 in the session row. All mapping goes through
// `myPlayerNumber`.

import type { GameState, InventoryState } from '../contracts/GameState';
import { createInitialGameState, createVsPlayerPreset } from '../contracts/GameState';
import type { PuzzleSpec, IJK } from '../puzzle/PuzzleTypes';
import { cellToKey } from '../puzzle/PuzzleTypes';
import { dispatch } from '../engine/GameMachine';
import type { PvPGameSession, PvPGameMove } from './types';

// ============================================================================
// BASE STATE (shared with the fresh-match start path in GamePage)
// ============================================================================

/**
 * Build the initial local GameState for a PvP session exactly the way a fresh
 * match does: vs-player preset + the session's stored inventory (the
 * inventory IS the piece mode — both players must deal the same pieces).
 */
export function buildPvPBaseState(
  session: PvPGameSession,
  puzzleSpec: PuzzleSpec,
  fallbackInventory?: InventoryState
): GameState {
  const setup = createVsPlayerPreset();
  const initialInventory =
    (session.inventory_state as InventoryState | null) ?? fallbackInventory ?? {};
  return createInitialGameState(setup, puzzleSpec, initialInventory);
}

// ============================================================================
// SINGLE-MOVE APPLICATION (shared by live realtime handler and replay)
// ============================================================================

/**
 * Orientation marker for REMOVAL-ONLY hint rows (hang defense, 2026-07-23).
 * A hint that triggered a repair can fail AFTER the repair mutated the local
 * board (the hint engine can drop a promise and never settle). The sender
 * then submits a `hint` move with NO placement — just the post-repair
 * board_state_after (possibly EMPTY after a full-board repair) and this
 * marker in orientation_id, with keepTurn + no hint consumed. The marker
 * discriminates these rows from legacy pre-Phase-2a hint rows (which also
 * lack cells but whose snapshots are untrustworthy and must keep returning
 * null so replay falls back).
 */
export const HINT_REPAIR_ONLY_ORIENTATION = 'repair-only';

/** Stable identity for a placed piece across clients (local uids differ). */
function pieceSignature(pieceId: string, cells: IJK[]): string {
  return `${pieceId}|${cells.map(cellToKey).sort().join(';')}`;
}

/**
 * Reconcile the local board DOWN to a move's board_state_after snapshot:
 * remove every local piece missing from the snapshot (REPAIR_REMOVE_PIECE,
 * -1 to the piece's placer — exactly what the mover's local repair did).
 * Shared by the 'check' and 'hint' cases: both move types can carry a
 * snapshot that removed pieces (correct check, hint-triggered repair), and
 * merely adding the new placement would silently diverge the boards.
 *
 * Pieces present in the snapshot but absent locally are NOT invented here:
 * for 'hint' the one legitimate addition (the hint placement) is applied by
 * the caller through the real reducer path; anything else would mean the
 * clients were already diverged, which replay-on-reload heals.
 *
 * Provenance guard (2026-07-23): the snapshot is REPAIR semantics, not an
 * eraser for pieces its sender could not have known about. A sender whose
 * engine lagged the move backlog (realtime flap, poll window) submits an
 * honest-but-stale snapshot that simply lacks the receiver's latest piece —
 * removing it would delete a legitimate placement AND poison the replay
 * record. So a piece is only removable when its recorded provenance
 * (`provenanceMoveNumber`, the move that added it) is STRICTLY OLDER than
 * the incoming move: the sender demonstrably knew about it and still left
 * it out. Pieces with no provenance yet (local placement whose submit /
 * INSERT echo is still in flight, or legacy states) are treated as newest —
 * never removable by reconciliation.
 */
function reconcileRemovalsToSnapshot(
  state: GameState,
  boardStateAfter: PvPGameMove['board_state_after'],
  incomingMoveNumber?: number | null
): { state: GameState; removed: number } {
  const after = new Set(
    (boardStateAfter ?? []).map(p => pieceSignature(p.pieceId, p.cells))
  );
  let s = state;
  let removed = 0;
  for (const [uid, piece] of Array.from(s.boardState.entries())) {
    if (!after.has(pieceSignature(piece.pieceId, piece.cells))) {
      if (typeof incomingMoveNumber === 'number') {
        const prov = piece.provenanceMoveNumber;
        if (prov === undefined || prov >= incomingMoveNumber) {
          // The piece was added by a move the snapshot's sender can't have
          // applied yet (same-or-later move number, or a local placement
          // still in flight) — its absence from the snapshot is staleness,
          // not repair. Keep it.
          continue;
        }
      }
      s = dispatch(s, { type: 'REPAIR_REMOVE_PIECE', pieceUid: uid });
      removed++;
    }
  }
  return { state: s, removed };
}

/**
 * Stamp provenance onto the piece(s) a move application just added: any
 * piece present in `next` but not in `prev` gets the move's move_number.
 * Mutation is safe here: `next` came fresh out of the pure reducer inside
 * applyPvPMoveToState — the added piece object is newly constructed and not
 * yet shared with any published state.
 */
function stampNewPieceProvenance(
  prev: GameState,
  next: GameState,
  moveNumber: PvPGameMove['move_number']
): GameState {
  if (typeof moveNumber !== 'number') return next;
  for (const [uid, piece] of next.boardState.entries()) {
    if (!prev.boardState.has(uid) && piece.provenanceMoveNumber === undefined) {
      piece.provenanceMoveNumber = moveNumber;
    }
  }
  return next;
}

/**
 * Live-path provenance for LOCAL placements: a piece placed through the
 * local dispatch path has no move_number until its submitted row's INSERT
 * echo (or the poll backlog) comes back. Called from the self-echo branch of
 * the live move handler: finds the still-unstamped local piece matching the
 * move's signature and returns a new state with the provenance recorded
 * (clones the map + piece — the input state is published React state and
 * must not be mutated). Returns the input state unchanged when there is
 * nothing to stamp.
 */
export function stampLocalPieceProvenance(
  state: GameState,
  move: PvPGameMove
): GameState {
  if (typeof move.move_number !== 'number') return state;
  if (!move.piece_id || !move.cells || move.cells.length === 0) return state;
  const sig = pieceSignature(move.piece_id, move.cells);
  for (const [uid, piece] of state.boardState.entries()) {
    if (
      piece.provenanceMoveNumber === undefined &&
      pieceSignature(piece.pieceId, piece.cells) === sig
    ) {
      const newBoardState = new Map(state.boardState);
      newBoardState.set(uid, { ...piece, provenanceMoveNumber: move.move_number });
      return { ...state, boardState: newBoardState };
    }
  }
  return state;
}

/**
 * Apply one persisted PvP move to the local GameState via reducer events.
 * Pure: no sounds, no toasts, no Supabase writes, no async — callers own all
 * side effects. Returns null on anything that would corrupt state (unknown
 * piece, overlapping cells, missing payload) so callers can fall back.
 *
 * Move semantics (mirrors how the move was produced live):
 *  - place  — FORCE the mover active, then TURN_PLACE_REQUESTED (+1 score,
 *             turn advances via the reducer's own TURN_ADVANCE).
 *  - hint   — FORCE, TURN_HINT_REQUESTED + synthetic TURN_HINT_RESULT with
 *             the recorded placement (0 points, turn advances). Rows without
 *             a placement but carrying the HINT_REPAIR_ONLY_ORIENTATION
 *             marker are removal-only (repair ran, generation failed):
 *             reconcile to the snapshot, mover keeps the turn. Legacy hint
 *             rows without cells and without the marker → null.
 *  - check  — remove every local piece missing from the move's
 *             board_state_after snapshot (REPAIR_REMOVE_PIECE: -1 to the
 *             placer). Pieces removed → correct check, mover keeps the turn;
 *             nothing removed → wrong check, turn passes to the opponent.
 *  - resign / timeout — terminal; the session row carries the outcome.
 *  - anything else ('pass' etc.) — board unchanged, turn passes.
 *
 * Turn switching uses FORCE_ACTIVE_PLAYER rather than TURN_PASS_REQUESTED on
 * pass-like moves: the session row is authoritative for turns, and routing
 * passes through the reducer's stall detection could start an endgame repair
 * that the live match demonstrably did not have.
 */
export function applyPvPMoveToState(
  state: GameState,
  move: PvPGameMove,
  myPlayerNumber: 1 | 2
): GameState | null {
  try {
    const moverIdx = move.player_number === myPlayerNumber ? 0 : 1;
    const otherIdx = 1 - moverIdx;
    const mover = state.players[moverIdx];
    if (!mover || !state.players[otherIdx]) return null;

    switch (move.move_type as string) {
      case 'place': {
        if (!move.piece_id || !move.orientation_id || !move.cells || move.cells.length === 0) {
          console.warn('🎮 [PvP replay] place move without payload:', move.move_number);
          return null;
        }
        let s = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: moverIdx });
        s = dispatch(s, {
          type: 'TURN_PLACE_REQUESTED',
          playerId: mover.id,
          payload: {
            pieceId: move.piece_id,
            orientationId: move.orientation_id,
            cells: move.cells,
          },
        });
        if (s.boardState.size !== state.boardState.size + 1) {
          // The reducer refused (overlap / unknown piece / inventory) — the
          // history is inconsistent with the engine's rules.
          console.warn(
            '🎮 [PvP replay] place move rejected by engine:',
            move.move_number, move.piece_id
          );
          return null;
        }
        return stampNewPieceProvenance(state, s, move.move_number);
      }

      case 'hint': {
        if (!move.piece_id || !move.cells || move.cells.length === 0) {
          // Removal-only hint row (hang defense): the mover's hint flow
          // repaired the board but hint generation failed or timed out, so
          // nothing was placed and no hint was consumed. The snapshot is
          // authoritative — an EMPTY array is legitimate here (full-board
          // repair) — and the mover KEEPS the turn (submitted with keepTurn).
          if (
            move.orientation_id === HINT_REPAIR_ONLY_ORIENTATION &&
            Array.isArray(move.board_state_after)
          ) {
            const s = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: moverIdx });
            return reconcileRemovalsToSnapshot(s, move.board_state_after, move.move_number).state;
          }
          // Legacy hint rows (pre-Phase-2a) never recorded the placed piece —
          // the board cannot be reconstructed from them.
          console.warn('🎮 [PvP replay] hint move without recorded placement:', move.move_number);
          return null;
        }
        let s = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: moverIdx });
        // A PvP hint on an unsolvable board repairs first (LIFO removals,
        // -1 each to the placer) and only then places — the move's
        // board_state_after carries the POST-repair + post-placement board.
        // Apply the removals before the placement so both clients walk the
        // same board. (No-op for hints that needed no repair.)
        // Guard: a hint row's snapshot always contains at least the hint
        // piece itself; an EMPTY/missing snapshot is a legacy or failed
        // capture — reconciling against it would wipe the whole board, so
        // skip reconciliation and just place (pre-repair-sync behavior).
        if (move.board_state_after && move.board_state_after.length > 0) {
          s = reconcileRemovalsToSnapshot(s, move.board_state_after, move.move_number).state;
        }
        const sizeBeforePlacement = s.boardState.size;
        s = dispatch(s, {
          type: 'TURN_HINT_REQUESTED',
          playerId: mover.id,
          anchor: move.cells[0],
        });
        s = dispatch(s, {
          type: 'TURN_HINT_RESULT',
          playerId: mover.id,
          result: {
            status: 'suggestion',
            suggestion: {
              pieceId: move.piece_id,
              placement: {
                pieceId: move.piece_id,
                orientationId: move.orientation_id ?? '',
                cells: move.cells,
              },
            },
          },
        });
        if (s.boardState.size !== sizeBeforePlacement + 1) {
          console.warn('🎮 [PvP replay] hint placement rejected by engine:', move.move_number);
          return null;
        }
        return stampNewPieceProvenance(state, s, move.move_number);
      }

      case 'check': {
        let s = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: moverIdx });
        const rec = reconcileRemovalsToSnapshot(s, move.board_state_after, move.move_number);
        s = rec.state;
        // Correct check (pieces came off) keeps the mover's turn; wrong check
        // forfeits it — mirrors handleCheck's live behavior.
        if (rec.removed === 0) {
          s = dispatch(s, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: otherIdx });
        }
        return s;
      }

      case 'resign':
      case 'timeout':
        // Terminal moves never mutate the board; the session status carries
        // the outcome and callers render the ended state from it.
        return state;

      default:
        // 'pass' (submitted as such by the pass handler) or any future
        // turn-consuming move type: board unchanged, turn to the opponent.
        return dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: otherIdx });
    }
  } catch (err) {
    console.warn('🎮 [PvP replay] move application threw:', err);
    return null;
  }
}

// ============================================================================
// FULL REBUILD
// ============================================================================

export interface PvPRebuildResult {
  state: GameState;
  /** Highest move_number replayed — realtime dedupe floor for the caller. */
  lastMoveNumber: number;
}

/**
 * Rebuild the local GameState for an in-progress PvP session by replaying its
 * move history. Returns null (never throws) when the history cannot be
 * reconstructed — callers fall back to their previous behavior.
 */
export function rebuildGameState(
  session: PvPGameSession,
  moves: PvPGameMove[],
  puzzleSpec: PuzzleSpec,
  myPlayerNumber: 1 | 2,
  fallbackInventory?: InventoryState
): PvPRebuildResult | null {
  try {
    let state = buildPvPBaseState(session, puzzleSpec, fallbackInventory);

    // Deterministic start: honour the recorded coin flip (the preset seeds a
    // random starting index; the session row knows who actually went first).
    const firstIdx = session.first_player === myPlayerNumber ? 0 : 1;
    state = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: firstIdx });

    // Chronological order: move_number asc, created_at then id as tiebreaks.
    const ordered = [...moves].sort(
      (a, b) =>
        (a.move_number ?? 0) - (b.move_number ?? 0) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
        String(a.id).localeCompare(String(b.id))
    );

    let lastMoveNumber = 0;
    for (const move of ordered) {
      const next = applyPvPMoveToState(state, move, myPlayerNumber);
      if (!next) {
        console.warn(
          '🎮 [PvP replay] history not reconstructable — falling back',
          { moveNumber: move.move_number, moveType: move.move_type }
        );
        return null;
      }
      state = next;
      lastMoveNumber = Math.max(lastMoveNumber, move.move_number ?? 0);
    }

    // ---- Cross-checks against the session row (warn-only diagnostics) ----
    const sessionPieces = Array.isArray(session.board_state)
      ? session.board_state.length
      : null;
    if (sessionPieces !== null && sessionPieces !== state.boardState.size) {
      console.warn(
        `🎮 [PvP replay] piece count differs from session row ` +
        `(replay ${state.boardState.size}, session ${sessionPieces}) — trusting replay`
      );
    }
    const myScore = state.players[0]?.score ?? 0;
    const oppScore = state.players[1]?.score ?? 0;
    const sessionMyScore = myPlayerNumber === 1 ? session.player1_score : session.player2_score;
    const sessionOppScore = myPlayerNumber === 1 ? session.player2_score : session.player1_score;
    if (myScore !== sessionMyScore || oppScore !== sessionOppScore) {
      console.warn(
        `🎮 [PvP replay] scores differ from session row ` +
        `(replay ${myScore}/${oppScore}, session ${sessionMyScore}/${sessionOppScore}) — trusting replay`
      );
    }

    // Whose turn: the session row wins.
    const expectedIdx = session.current_turn === myPlayerNumber ? 0 : 1;
    if (state.activePlayerIndex !== expectedIdx) {
      console.warn('🎮 [PvP replay] turn differs from session row — trusting session');
      state = dispatch(state, { type: 'FORCE_ACTIVE_PLAYER', playerIndex: expectedIdx });
    }

    // A replay of an active session must land in a normal playable state.
    if (state.phase !== 'in_turn' || state.subphase !== 'normal') {
      console.warn(
        `🎮 [PvP replay] replay ended in non-playable state ` +
        `(phase ${state.phase}, subphase ${state.subphase}) — falling back`
      );
      return null;
    }

    return { state, lastMoveNumber };
  } catch (err) {
    console.warn('🎮 [PvP replay] rebuild threw:', err);
    return null;
  }
}
