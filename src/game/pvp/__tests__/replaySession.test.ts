// src/game/pvp/__tests__/replaySession.test.ts
// PvP Phase 2a — board reconstruction by replaying moves.
// Hermetic: pure functions only, no Supabase, no network, no timers.

import { describe, it, expect } from 'vitest';
import { createPuzzleSpec, cellToKey, type IJK } from '../../puzzle/PuzzleTypes';
import type { GameState } from '../../contracts/GameState';
import {
  rebuildGameState,
  applyPvPMoveToState,
  buildPvPBaseState,
} from '../replaySession';
import type { PvPGameSession, PvPGameMove, PvPPlacedPiece } from '../types';

// ---------------------------------------------------------------------------
// Fixture: a 12-cell strip container and three 4-cell "pieces" A / B / C.
// The engine validates overlap + inventory (not container membership), so a
// hand-rolled cell list is sufficient and keeps the test hermetic.
// ---------------------------------------------------------------------------

const cell = (i: number): IJK => ({ i, j: 0, k: 0 });
const CONTAINER: IJK[] = Array.from({ length: 12 }, (_, i) => cell(i));
const CELLS_A = [cell(0), cell(1), cell(2), cell(3)];
const CELLS_B = [cell(4), cell(5), cell(6), cell(7)];
const CELLS_C = [cell(8), cell(9), cell(10), cell(11)];

const PUZZLE_SPEC = createPuzzleSpec('test-puzzle', 'Test Strip', CONTAINER);
const INVENTORY = { A: 1, B: 1, C: 1 };

function makeSession(overrides: Partial<PvPGameSession> = {}): PvPGameSession {
  return {
    id: 'session-1',
    puzzle_id: 'test-puzzle',
    puzzle_name: 'Test Strip',
    player1_id: 'u1',
    player2_id: 'u2',
    player1_name: 'Alice',
    player2_name: 'Bob',
    player1_avatar_url: null,
    player2_avatar_url: null,
    status: 'active',
    current_turn: 1,
    first_player: 1,
    player1_score: 0,
    player2_score: 0,
    timer_seconds: 300,
    player1_time_remaining_ms: 300_000,
    player2_time_remaining_ms: 300_000,
    turn_started_at: '2026-07-22T10:00:00.000Z',
    board_state: [],
    inventory_state: { ...INVENTORY },
    placed_count: {},
    hint_limit: 0,
    check_limit: 0,
    player1_hints_used: 0,
    player2_hints_used: 0,
    player1_checks_used: 0,
    player2_checks_used: 0,
    is_simulated: false,
    simulated_opponent_user_id: null,
    winner: null,
    end_reason: null,
    invite_code: 'ABC123',
    invite_expires_at: null,
    player1_last_heartbeat: null,
    player2_last_heartbeat: null,
    created_at: '2026-07-22T09:00:00.000Z',
    started_at: '2026-07-22T09:01:00.000Z',
    ended_at: null,
    updated_at: '2026-07-22T10:00:00.000Z',
    ...overrides,
  };
}

let moveSeq = 0;
function makeMove(overrides: Partial<PvPGameMove> = {}): PvPGameMove {
  moveSeq += 1;
  return {
    id: `move-${moveSeq}`,
    session_id: 'session-1',
    player_number: 1,
    player_id: 'u1',
    move_number: moveSeq,
    move_type: 'place',
    piece_id: null,
    orientation_id: null,
    cells: null,
    score_delta: 0,
    board_state_after: [],
    time_spent_ms: 1000,
    player_time_remaining_ms: 290_000,
    created_at: `2026-07-22T10:0${moveSeq % 10}:00.000Z`,
    ...overrides,
  };
}

function placeMove(
  moveNumber: number,
  playerNumber: 1 | 2,
  pieceId: string,
  cells: IJK[]
): PvPGameMove {
  return makeMove({
    move_number: moveNumber,
    player_number: playerNumber,
    player_id: playerNumber === 1 ? 'u1' : 'u2',
    move_type: 'place',
    piece_id: pieceId,
    orientation_id: `${pieceId}-o0`,
    cells,
    score_delta: 1,
  });
}

function snapshotPiece(pieceId: string, cells: IJK[], placedBy: 1 | 2): PvPPlacedPiece {
  return {
    uid: `snap-${pieceId}`,
    pieceId,
    orientationId: `${pieceId}-o0`,
    cells,
    placedAt: 1,
    placedBy,
    source: 'manual',
  };
}

function occupiedKeys(state: GameState): Set<string> {
  const keys = new Set<string>();
  for (const piece of state.boardState.values()) {
    for (const c of piece.cells) keys.add(cellToKey(c));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rebuildGameState — place moves', () => {
  const moves = [
    placeMove(1, 1, 'A', CELLS_A),
    placeMove(2, 2, 'B', CELLS_B),
    placeMove(3, 1, 'C', CELLS_C),
  ];

  it('rebuilds pieces, occupied cells, inventory and scores (player 1 view)', () => {
    const session = makeSession({ current_turn: 2, player1_score: 2, player2_score: 1 });
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state, lastMoveNumber } = result!;

    expect(state.boardState.size).toBe(3);
    expect(lastMoveNumber).toBe(3);

    const expected = new Set([...CELLS_A, ...CELLS_B, ...CELLS_C].map(cellToKey));
    expect(occupiedKeys(state)).toEqual(expected);

    // Inventory decrements
    expect(state.placedCountByPieceId).toEqual({ A: 1, B: 1, C: 1 });

    // Viewer (player 1) is engine seat 0: 2 points; opponent seat 1: 1 point.
    expect(state.players[0].score).toBe(2);
    expect(state.players[1].score).toBe(1);

    // Whose turn: session says player 2 → opponent seat (index 1).
    expect(state.activePlayerIndex).toBe(1);
    expect(state.phase).toBe('in_turn');
  });

  it('replays identically from the other player\'s perspective (no self-echo assumptions)', () => {
    const session = makeSession({ current_turn: 2, player1_score: 2, player2_score: 1 });
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 2);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(3);
    // Viewer is player 2 → seat 0 holds player 2's single point.
    expect(state.players[0].score).toBe(1);
    expect(state.players[1].score).toBe(2);
    // current_turn 2 IS the viewer → seat 0 active.
    expect(state.activePlayerIndex).toBe(0);
  });

  it('sorts an out-of-order move list by move_number before applying', () => {
    const session = makeSession({ current_turn: 2, player1_score: 2, player2_score: 1 });
    const shuffled = [moves[2], moves[0], moves[1]];
    const result = rebuildGameState(session, shuffled, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    expect(result!.state.boardState.size).toBe(3);
    expect(result!.lastMoveNumber).toBe(3);
  });
});

describe('rebuildGameState — hint moves', () => {
  it('places a recorded hint with zero points and advances the turn', () => {
    const session = makeSession({ current_turn: 1, player1_score: 1 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      makeMove({
        move_number: 2,
        player_number: 2,
        player_id: 'u2',
        move_type: 'hint',
        piece_id: 'B',
        orientation_id: 'B-o0',
        cells: CELLS_B,
        score_delta: 0,
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(2);
    expect(state.players[0].score).toBe(1); // my place
    expect(state.players[1].score).toBe(0); // hint = no points
    expect(state.placedCountByPieceId.B).toBe(1); // hint consumed inventory
    expect(state.activePlayerIndex).toBe(0); // back to me per session row
  });

  it('hint with repair: reconciles removals from board_state_after before placing', () => {
    // p1 placed A, p2 placed B; then p1's hint found the board unsolvable —
    // the repair loop removed B (LIFO, -1 to p2) and the hint placed C.
    // The hint row's snapshot is the POST-repair + post-placement board.
    const session = makeSession({ current_turn: 2, player1_score: 1, player2_score: 0 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', CELLS_B),
      makeMove({
        move_number: 3,
        player_number: 1,
        player_id: 'u1',
        move_type: 'hint',
        piece_id: 'C',
        orientation_id: 'C-o0',
        cells: CELLS_C,
        score_delta: 0,
        board_state_after: [
          snapshotPiece('A', CELLS_A, 1),
          snapshotPiece('C', CELLS_C, 1),
        ],
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(2); // A + hint C; B repaired away
    expect(occupiedKeys(state)).toEqual(new Set([...CELLS_A, ...CELLS_C].map(cellToKey)));
    expect(state.players[0].score).toBe(1); // my place; hint = 0
    expect(state.players[1].score).toBe(0); // 1 for B's place, -1 from repair
    expect(state.placedCountByPieceId.B).toBe(0); // B back in inventory
    expect(state.placedCountByPieceId.C).toBe(1); // hint consumed inventory
    expect(state.activePlayerIndex).toBe(1); // hint passed the turn to p2 (opponent seat)
  });

  it('hint-with-repair applies identically live (applyPvPMoveToState) for the other viewer', () => {
    // Same story viewed by player 2: their B is repaired off by p1's hint.
    const session = makeSession();
    let state = buildPvPBaseState(session, PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 2)!;
    state = applyPvPMoveToState(state, placeMove(2, 2, 'B', CELLS_B), 2)!;
    const next = applyPvPMoveToState(
      state,
      makeMove({
        move_number: 3,
        player_number: 1,
        player_id: 'u1',
        move_type: 'hint',
        piece_id: 'C',
        orientation_id: 'C-o0',
        cells: CELLS_C,
        score_delta: 0,
        board_state_after: [
          snapshotPiece('A', CELLS_A, 1),
          snapshotPiece('C', CELLS_C, 1),
        ],
      }),
      2
    );
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(2);
    expect(occupiedKeys(next!)).toEqual(new Set([...CELLS_A, ...CELLS_C].map(cellToKey)));
    // Viewer is player 2 (seat 0): 1 for placing B, -1 from the repair.
    expect(next!.players[0].score).toBe(0);
    // Opponent (player 1, seat 1): 1 for A; the hint itself scores 0.
    expect(next!.players[1].score).toBe(1);
  });

  it('returns null for legacy hint rows without recorded cells', () => {
    const session = makeSession();
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      makeMove({
        move_number: 2,
        player_number: 2,
        player_id: 'u2',
        move_type: 'hint',
        // legacy row: no piece_id / cells
      }),
    ];
    expect(rebuildGameState(session, moves, PUZZLE_SPEC, 1)).toBeNull();
  });
});

describe('rebuildGameState — check moves', () => {
  it('correct check removes pieces missing from the snapshot (-1 to the placer) and keeps the turn', () => {
    const session = makeSession({ current_turn: 1, player1_score: 1, player2_score: 0 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', CELLS_B),
      makeMove({
        move_number: 3,
        player_number: 1,
        player_id: 'u1',
        move_type: 'check',
        // Post-repair snapshot: B was removed by the repair loop.
        board_state_after: [snapshotPiece('A', CELLS_A, 1)],
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(1);
    expect(occupiedKeys(state)).toEqual(new Set(CELLS_A.map(cellToKey)));
    expect(state.players[0].score).toBe(1);
    expect(state.players[1].score).toBe(0); // 1 for the place, -1 from repair
    expect(state.placedCountByPieceId.B).toBe(0); // B back in inventory
    expect(state.activePlayerIndex).toBe(0); // checker keeps the turn
  });

  it('correct check reconciles multi-piece removals with per-placer score debits', () => {
    // p1 placed A and C, p2 placed B; p2's check found the board broken and
    // the repair loop removed C then B (LIFO) — snapshot keeps only A.
    // Session row carries the post-check ABSOLUTE scores (2-1 → 1-0).
    const session = makeSession({ current_turn: 2, player1_score: 1, player2_score: 0 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', CELLS_B),
      placeMove(3, 1, 'C', CELLS_C),
      makeMove({
        move_number: 4,
        player_number: 2,
        player_id: 'u2',
        move_type: 'check',
        board_state_after: [snapshotPiece('A', CELLS_A, 1)],
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(1);
    expect(occupiedKeys(state)).toEqual(new Set(CELLS_A.map(cellToKey)));
    // p1 (seat 0): 2 places, -1 for repaired C. p2 (seat 1): 1 place, -1 for B.
    expect(state.players[0].score).toBe(1);
    expect(state.players[1].score).toBe(0);
    expect(state.placedCountByPieceId.B).toBe(0);
    expect(state.placedCountByPieceId.C).toBe(0);
    expect(state.activePlayerIndex).toBe(1); // correct check: p2 keeps the turn
  });

  it('wrong check leaves the board intact and forfeits the turn', () => {
    const session = makeSession({ current_turn: 1, player1_score: 1, player2_score: 1 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', CELLS_B),
      makeMove({
        move_number: 3,
        player_number: 2,
        player_id: 'u2',
        move_type: 'check',
        // Snapshot identical to the board — nothing was removed.
        board_state_after: [snapshotPiece('A', CELLS_A, 1), snapshotPiece('B', CELLS_B, 2)],
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;

    expect(state.boardState.size).toBe(2);
    expect(state.players[0].score).toBe(1);
    expect(state.players[1].score).toBe(1);
    expect(state.activePlayerIndex).toBe(0); // turn passed to me per session row
  });
});

describe('rebuildGameState — pass and terminal moves', () => {
  it('a pass switches the turn without touching the board', () => {
    const session = makeSession({ current_turn: 1, player1_score: 1 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      makeMove({
        move_number: 2,
        player_number: 2,
        player_id: 'u2',
        move_type: 'pass' as any,
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    expect(result!.state.boardState.size).toBe(1);
    expect(result!.state.activePlayerIndex).toBe(0);
  });

  it('resign moves never mutate the board', () => {
    const session = makeSession();
    const base = buildPvPBaseState(session, PUZZLE_SPEC);
    const afterPlace = applyPvPMoveToState(base, placeMove(1, 1, 'A', CELLS_A), 1)!;
    const afterResign = applyPvPMoveToState(
      afterPlace,
      makeMove({ move_number: 2, player_number: 2, player_id: 'u2', move_type: 'resign' }),
      1
    );
    expect(afterResign).not.toBeNull();
    expect(afterResign!.boardState.size).toBe(1);
  });
});

describe('rebuildGameState — divergence returns null (never throws)', () => {
  it('overlapping placement returns null', () => {
    const session = makeSession();
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      // B claims two cells already covered by A.
      placeMove(2, 2, 'B', [cell(2), cell(3), cell(4), cell(5)]),
    ];
    expect(rebuildGameState(session, moves, PUZZLE_SPEC, 1)).toBeNull();
  });

  it('unknown piece id returns null', () => {
    const session = makeSession();
    const moves = [placeMove(1, 1, 'Z', CELLS_A)]; // Z is not in the inventory
    expect(rebuildGameState(session, moves, PUZZLE_SPEC, 1)).toBeNull();
  });

  it('place move without payload returns null', () => {
    const session = makeSession();
    const moves = [
      makeMove({ move_number: 1, player_number: 1, move_type: 'place' }), // no cells
    ];
    expect(rebuildGameState(session, moves, PUZZLE_SPEC, 1)).toBeNull();
  });

  it('duplicate piece beyond inventory returns null', () => {
    const session = makeSession();
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'A', CELLS_B), // only one A in the set
    ];
    expect(rebuildGameState(session, moves, PUZZLE_SPEC, 1)).toBeNull();
  });
});

describe('applyPvPMoveToState — shared live/replay application', () => {
  it('does not mutate the input state (pure)', () => {
    const session = makeSession();
    const base = buildPvPBaseState(session, PUZZLE_SPEC);
    const baseSize = base.boardState.size;
    const baseInventory = { ...base.placedCountByPieceId };

    const next = applyPvPMoveToState(base, placeMove(1, 1, 'A', CELLS_A), 1);
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(baseSize + 1);
    // Input untouched
    expect(base.boardState.size).toBe(baseSize);
    expect(base.placedCountByPieceId).toEqual(baseInventory);
  });

  it('maps the mover to the correct engine seat for both viewers', () => {
    const session = makeSession();
    const move = placeMove(1, 2, 'B', CELLS_B); // player 2 moves

    // Viewed by player 1: mover is the opponent (seat 1).
    const p1View = applyPvPMoveToState(buildPvPBaseState(session, PUZZLE_SPEC), move, 1)!;
    expect(p1View.players[1].score).toBe(1);
    expect(p1View.players[0].score).toBe(0);

    // Viewed by player 2: mover is themselves (seat 0).
    const p2View = applyPvPMoveToState(buildPvPBaseState(session, PUZZLE_SPEC), move, 2)!;
    expect(p2View.players[0].score).toBe(1);
    expect(p2View.players[1].score).toBe(0);
  });
});
