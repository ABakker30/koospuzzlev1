// src/game/pvp/formingGate.ts
// Pure content-based rules protecting the forming-ghost pipeline from stale
// session-row snapshots and self-echo churn (2026-07-23 regression hunt).
//
// Why content-based: the poll's forming fallback used to gate ONLY on clocks —
// `forming_at` is stamped with the SENDER'S CLIENT clock (updatePvPFormingState)
// while the move floor it is compared against comes from `game_moves.created_at`
// (DB server clock). A sender device a few seconds ahead makes PRE-commit
// forming pass the "predates commit" gate, and the receiver re-feeds a stale
// ghost OVER the freshly placed piece (the wireframe-wrapped-sphere field
// report). These helpers gate on CONTENT and SEQUENCE instead, so no client or
// server clock is ever load-bearing.

import type { IJK } from '../../types/shape';
import type { PvPGameSession } from './types';

/**
 * Canonical order-independent key for a set of forming cells. Empty input →
 * empty string (callers treat '' as "no selection").
 */
export function formingCellsKey(cells: readonly IJK[] | null | undefined): string {
  if (!cells || cells.length === 0) return '';
  return cells
    .map((c) => `${c.i},${c.j},${c.k}`)
    .sort()
    .join(';');
}

/**
 * Drop every forming cell that is already occupied on the local board.
 * A ghost over a placed solid sphere is NEVER correct — the sender can only
 * select unoccupied cells, so any overlap means the ghost data is stale
 * relative to the local board (or the local board is momentarily ahead).
 * Render-level belt-and-braces for BOTH transports (broadcast + poll).
 */
export function filterFormingCells(
  cells: readonly IJK[],
  occupiedCellKeys: ReadonlySet<string>
): IJK[] {
  if (occupiedCellKeys.size === 0) return [...cells];
  return cells.filter((c) => !occupiedCellKeys.has(`${c.i},${c.j},${c.k}`));
}

/**
 * Collect the occupied-cell key set from any iterable of pieces with cells
 * (the local engine's boardState values). Keys match filterFormingCells.
 */
export function collectOccupiedCellKeys(
  pieces: Iterable<{ cells: IJK[] }> | null | undefined
): Set<string> {
  const keys = new Set<string>();
  if (!pieces) return keys;
  for (const piece of pieces) {
    for (const c of piece.cells) keys.add(`${c.i},${c.j},${c.k}`);
  }
  return keys;
}

/**
 * Sequence rule (i): a poll-fed forming payload whose cell set EQUALS the
 * opponent's last sighted committed placement is by definition the stale
 * pre-commit selection of that very piece — never feed it again, whatever
 * the clocks say. `blockedKey` is maintained synchronously from move rows
 * (before any React flush), so it also covers the same-poll-tick window
 * where the local board hasn't applied the commit yet and the occupancy
 * filter can't catch the overlap.
 */
export function isBlockedByLastCommit(
  cellsKey: string,
  blockedKey: string
): boolean {
  return cellsKey !== '' && cellsKey === blockedKey;
}

/**
 * Detect a session-row UPDATE echo that carries NO game-meaningful change —
 * in practice the sender's own ~1.5s forming-persist writes (they touch only
 * forming_cells/forming_player/forming_at and deliberately never bump
 * updated_at). Applying such rows would churn pvpSession identity on the
 * SENDER's device every 1.5s while forming (re-render storms, optimistic-
 * state overwrites) for zero information. Skip them.
 *
 * Every real change (move commit, heartbeat, completion, clock/score/counter
 * update) bumps updated_at or one of the compared fields, so it always
 * applies. `board_state` is compared only when the payload carries it: an
 * UNCHANGED TOASTed column is omitted from realtime UPDATE payloads entirely,
 * and treating "missing" as "unchanged" is exactly right (it also prevents a
 * forming echo from wiping the locally-known board_state to undefined).
 */
export function isFormingOnlySessionEcho(
  prev: PvPGameSession | null | undefined,
  next: PvPGameSession
): boolean {
  if (!prev || prev.id !== next.id) return false;

  const scalarFields: (keyof PvPGameSession)[] = [
    'status',
    'current_turn',
    'winner',
    'end_reason',
    'turn_started_at',
    'updated_at',
    'started_at',
    'ended_at',
    'player1_id',
    'player2_id',
    'player1_score',
    'player2_score',
    'player1_time_remaining_ms',
    'player2_time_remaining_ms',
    'player1_hints_used',
    'player2_hints_used',
    'player1_checks_used',
    'player2_checks_used',
    'player1_last_heartbeat',
    'player2_last_heartbeat',
  ];
  for (const field of scalarFields) {
    if (next[field] !== prev[field]) return false;
  }

  const nextBoard = next.board_state;
  const prevBoard = prev.board_state;
  if (Array.isArray(nextBoard) && Array.isArray(prevBoard) && nextBoard.length !== prevBoard.length) {
    return false;
  }

  return true;
}
