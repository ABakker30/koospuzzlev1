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
  stampLocalPieceProvenance,
  classifyMoveArrival,
  HINT_REPAIR_ONLY_ORIENTATION,
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

  it('removal-only hint (hang defense) reconciles removals, keeps the turn, scores nothing for the hinter', () => {
    // p1 placed A, p2 placed B; p1's hint repaired B away (LIFO, -1 to p2)
    // but hint GENERATION then hung/failed — the hang-defense fallback
    // submitted a hint row with NO placement, the post-repair snapshot, the
    // HINT_REPAIR_ONLY_ORIENTATION marker and keepTurn semantics.
    const removalOnly = makeMove({
      move_number: 3,
      player_number: 1,
      player_id: 'u1',
      move_type: 'hint',
      orientation_id: HINT_REPAIR_ONLY_ORIENTATION,
      // no piece_id / cells — nothing was placed
      board_state_after: [snapshotPiece('A', CELLS_A, 1)],
    });

    // Live application (viewer = p2, whose B is repaired off).
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 2)!;
    state = applyPvPMoveToState(state, placeMove(2, 2, 'B', CELLS_B), 2)!;
    const next = applyPvPMoveToState(state, removalOnly, 2);
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(1);
    expect(occupiedKeys(next!)).toEqual(new Set(CELLS_A.map(cellToKey)));
    // Viewer p2 (seat 0): 1 for placing B, -1 from the repair.
    expect(next!.players[0].score).toBe(0);
    // Hinter p1 (seat 1): keeps their placement point; the failed hint
    // neither scores nor costs anything.
    expect(next!.players[1].score).toBe(1);
    expect(next!.placedCountByPieceId.B).toBe(0); // B back in inventory
    // keepTurn: the mover (p1 = opponent seat 1 for this viewer) stays active.
    expect(next!.activePlayerIndex).toBe(1);

    // Reload replay agrees (session row keeps the turn on the hinter).
    const session = makeSession({ current_turn: 1, player1_score: 1, player2_score: 0 });
    const rebuilt = rebuildGameState(
      session,
      [placeMove(1, 1, 'A', CELLS_A), placeMove(2, 2, 'B', CELLS_B), removalOnly],
      PUZZLE_SPEC,
      2
    );
    expect(rebuilt).not.toBeNull();
    expect(occupiedKeys(rebuilt!.state)).toEqual(occupiedKeys(next!));
    expect(rebuilt!.state.players[0].score).toBe(next!.players[0].score);
    expect(rebuilt!.state.players[1].score).toBe(next!.players[1].score);
  });

  it('removal-only hint with an EMPTY snapshot clears the whole board (full-board repair)', () => {
    // A full-board repair legitimately leaves board_state_after = [] — the
    // empty-snapshot "legacy guard" must not apply to marked rows.
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 1)!;
    state = applyPvPMoveToState(state, placeMove(2, 2, 'B', CELLS_B), 1)!;
    const next = applyPvPMoveToState(
      state,
      makeMove({
        move_number: 3,
        player_number: 1,
        player_id: 'u1',
        move_type: 'hint',
        orientation_id: HINT_REPAIR_ONLY_ORIENTATION,
        board_state_after: [],
      }),
      1
    );
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(0);
    // Both placements repaired away: each placer debited back to 0.
    expect(next!.players[0].score).toBe(0);
    expect(next!.players[1].score).toBe(0);
    expect(next!.placedCountByPieceId.A).toBe(0);
    expect(next!.placedCountByPieceId.B).toBe(0);
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

  it('check with multi-piece removals yields the same board live and via rebuild', () => {
    // The sender derives the check snapshot from the pure repair state — the
    // receiver must land on the identical board whether the move streams in
    // live (applyPvPMoveToState) or is replayed on reload (rebuildGameState).
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', CELLS_B),
      placeMove(3, 1, 'C', CELLS_C),
      makeMove({
        move_number: 4,
        player_number: 2,
        player_id: 'u2',
        move_type: 'check',
        // Repair removed C then B (LIFO) — only A survives.
        board_state_after: [snapshotPiece('A', CELLS_A, 1)],
      }),
    ];

    // Live path (viewer = p1).
    let live = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    for (const move of moves) {
      const next = applyPvPMoveToState(live, move, 1);
      expect(next).not.toBeNull();
      live = next!;
    }

    // Reload path (same viewer; session row = post-check truth).
    const session = makeSession({ current_turn: 2, player1_score: 1, player2_score: 0 });
    const rebuilt = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(rebuilt).not.toBeNull();

    expect(live.boardState.size).toBe(1);
    expect(rebuilt!.state.boardState.size).toBe(1);
    expect(occupiedKeys(rebuilt!.state)).toEqual(occupiedKeys(live));
    // p1 (seat 0): A + C placed, -1 for repaired C → 1.
    // p2 (seat 1): B placed, -1 for repaired B → 0.
    expect(live.players[0].score).toBe(1);
    expect(live.players[1].score).toBe(0);
    expect(rebuilt!.state.players[0].score).toBe(live.players[0].score);
    expect(rebuilt!.state.players[1].score).toBe(live.players[1].score);
    // Correct check keeps the checker's turn on both paths.
    expect(live.activePlayerIndex).toBe(1);
    expect(rebuilt!.state.activePlayerIndex).toBe(1);
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

describe('reconciliation provenance guard — stale-sender snapshots (2026-07-23)', () => {
  it('live: a hint whose snapshot omits a piece placed by a LATER move number must not remove it', () => {
    // The sender's engine lagged the move backlog: their hint (move 2) was
    // computed before they applied the opponent's place (move 3), so their
    // honest snapshot lacks B. B's provenance (3) >= the incoming move (2):
    // the sender can't have known it — reconciliation must keep it.
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 1)!;
    state = applyPvPMoveToState(state, placeMove(3, 2, 'B', CELLS_B), 1)!;
    const next = applyPvPMoveToState(
      state,
      makeMove({
        move_number: 2,
        player_number: 1,
        player_id: 'u1',
        move_type: 'hint',
        piece_id: 'C',
        orientation_id: 'C-o0',
        cells: CELLS_C,
        score_delta: 0,
        // Stale snapshot: A + the hint's own C, but NOT B.
        board_state_after: [
          snapshotPiece('A', CELLS_A, 1),
          snapshotPiece('C', CELLS_C, 1),
        ],
      }),
      1
    );
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(3); // A + B + hint C — B survived
    expect(occupiedKeys(next!)).toEqual(
      new Set([...CELLS_A, ...CELLS_B, ...CELLS_C].map(cellToKey))
    );
    // B's placer keeps their point — no phantom repair debit.
    expect(next!.players[1].score).toBe(1);
  });

  it('rebuild: a same-number race (place vs stale hint) does not poison the record', () => {
    // submitMove derives move_number from count+1, so a place and a stale
    // hint submitted concurrently can carry the SAME number; created_at
    // breaks the tie in replay order. The hint's snapshot omits B (its
    // sender never applied it) — provenance 2 >= 2 keeps B on every rebuild.
    const session = makeSession({ current_turn: 2, player1_score: 1, player2_score: 1 });
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      makeMove({
        move_number: 2,
        player_number: 2,
        player_id: 'u2',
        move_type: 'place',
        piece_id: 'B',
        orientation_id: 'B-o0',
        cells: CELLS_B,
        score_delta: 1,
        created_at: '2026-07-22T10:05:00.000Z',
      }),
      makeMove({
        move_number: 2,
        player_number: 1,
        player_id: 'u1',
        move_type: 'hint',
        piece_id: 'C',
        orientation_id: 'C-o0',
        cells: CELLS_C,
        score_delta: 0,
        board_state_after: [
          snapshotPiece('A', CELLS_A, 1),
          snapshotPiece('C', CELLS_C, 1), // omits B — stale sender
        ],
        created_at: '2026-07-22T10:05:01.000Z',
      }),
    ];
    const result = rebuildGameState(session, moves, PUZZLE_SPEC, 1);
    expect(result).not.toBeNull();
    const { state } = result!;
    expect(state.boardState.size).toBe(3); // B survived the stale snapshot
    expect(occupiedKeys(state)).toEqual(
      new Set([...CELLS_A, ...CELLS_B, ...CELLS_C].map(cellToKey))
    );
    expect(state.players[0].score).toBe(1); // my A; hint C scores 0
    expect(state.players[1].score).toBe(1); // B's point intact
  });

  it('check: never removes an in-flight local piece (no provenance yet), still removes known-older pieces', () => {
    // Viewer p1 placed A (move 1) and B (submit still in flight — the INSERT
    // echo hasn't assigned a move_number, so B carries no provenance). The
    // opponent's check (move 2) omits BOTH from its snapshot: B must survive
    // (the checker can't have known it), A must be removed (provenance 1 < 2
    // — the checker demonstrably knew it and repaired it away).
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 1)!;
    state = applyPvPMoveToState(state, placeMove(2, 1, 'B', CELLS_B), 1)!;
    // Simulate the in-flight local placement: strip the provenance the test
    // helper's apply path stamped (a real local dispatch never had one).
    for (const piece of state.boardState.values()) {
      if (piece.pieceId === 'B') delete piece.provenanceMoveNumber;
    }
    const check = makeMove({
      move_number: 2,
      player_number: 2,
      player_id: 'u2',
      move_type: 'check',
      board_state_after: [], // stale/repairing snapshot omitting everything
    });
    const next = applyPvPMoveToState(state, check, 1);
    expect(next).not.toBeNull();
    expect(next!.boardState.size).toBe(1);
    expect(occupiedKeys(next!)).toEqual(new Set(CELLS_B.map(cellToKey)));

    // Once the INSERT echo assigns B its recorded number, a LATER check that
    // omits it may legitimately remove it again.
    const stamped = stampLocalPieceProvenance(next!, placeMove(2, 1, 'B', CELLS_B));
    const later = applyPvPMoveToState(
      stamped,
      makeMove({
        move_number: 3,
        player_number: 2,
        player_id: 'u2',
        move_type: 'check',
        board_state_after: [],
      }),
      1
    );
    expect(later).not.toBeNull();
    expect(later!.boardState.size).toBe(0);
  });
});

describe('classifyMoveArrival — live delivery-order sequencing (2026-07-23)', () => {
  it('applies in-sequence and unsequenceable arrivals immediately', () => {
    expect(classifyMoveArrival(0, 1)).toBe('apply'); // first move of the match
    expect(classifyMoveArrival(4, 5)).toBe('apply'); // next in sequence
    expect(classifyMoveArrival(4, 4)).toBe('apply'); // at the floor — dedupe upstream
    expect(classifyMoveArrival(4, 3)).toBe('apply'); // below the floor — dedupe upstream
    expect(classifyMoveArrival(4, null)).toBe('apply'); // unsequenceable rows
    expect(classifyMoveArrival(4, undefined)).toBe('apply');
    expect(classifyMoveArrival(4, 0)).toBe('apply');
  });

  it('buffers a gapped arrival (a successor delivered before its predecessor)', () => {
    // The field race: our place (N) is still echoing when the opponent's
    // check (N+1) arrives via a flapping channel that replays out of order.
    expect(classifyMoveArrival(0, 2)).toBe('buffer');
    expect(classifyMoveArrival(4, 6)).toBe('buffer');
    expect(classifyMoveArrival(4, 40)).toBe('buffer'); // long realtime outage
  });
});

describe('delivery-order race — check outruns the place echo (2026-07-23)', () => {
  it('out-of-order check spares the unstamped piece; after the echo stamp, the SAME check applied in order removes it', () => {
    // Field report: "a check removed a piece from one board, not both".
    // Viewer p1 placed B locally (its recorded number will be 2, but the
    // INSERT echo is in flight → no provenance yet). The opponent's check
    // (move 3) — whose snapshot legitimately omits B (the repair removed
    // it) — outruns the echo.
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 2, 'A', CELLS_A), 1)!;
    state = applyPvPMoveToState(state, placeMove(2, 1, 'B', CELLS_B), 1)!;
    // Simulate the in-flight local placement: strip the provenance the test
    // helper's apply path stamped (a real local dispatch never had one).
    for (const piece of state.boardState.values()) {
      if (piece.pieceId === 'B') delete piece.provenanceMoveNumber;
    }
    const check = makeMove({
      move_number: 3,
      player_number: 2,
      player_id: 'u2',
      move_type: 'check',
      // Correct check: the checker's repair removed B — only A survives.
      board_state_after: [snapshotPiece('A', CELLS_A, 2)],
    });

    // OUT-OF-ORDER application (the old live behavior): the provenance
    // guard rightly refuses to remove the unstamped piece — the guard
    // works; the DELIVERY ORDER is what desynced the boards.
    const outOfOrder = applyPvPMoveToState(state, check, 1);
    expect(outOfOrder).not.toBeNull();
    expect(outOfOrder!.boardState.size).toBe(2); // B survived → one-board desync

    // IN-ORDER application (what the gap buffer + stamp-before-discard now
    // guarantee live): the echo of move 2 stamps B FIRST, then the same
    // check applies — provenance 2 < 3, so the removal goes through and
    // both boards agree (and match the reload replay).
    const stamped = stampLocalPieceProvenance(state, placeMove(2, 1, 'B', CELLS_B));
    const inOrder = applyPvPMoveToState(stamped, check, 1);
    expect(inOrder).not.toBeNull();
    expect(inOrder!.boardState.size).toBe(1);
    expect(occupiedKeys(inOrder!)).toEqual(new Set(CELLS_A.map(cellToKey)));
  });

  it('stampLocalPieceProvenance is idempotent — late/duplicate echo sightings return the same state reference', () => {
    // The live handler now stamps on EVERY sighting of a self place/hint
    // echo, BEFORE the dedupe returns — so re-sightings (poll backlog,
    // duplicate realtime delivery) must be free: same reference back means
    // React bails out of the queued update.
    let state = buildPvPBaseState(makeSession(), PUZZLE_SPEC);
    state = applyPvPMoveToState(state, placeMove(1, 1, 'A', CELLS_A), 1)!; // stamped 1 on apply
    // Piece already stamped → no-op, identical reference.
    expect(stampLocalPieceProvenance(state, placeMove(1, 1, 'A', CELLS_A))).toBe(state);
    // Echo for a piece that is not on the board at all → no-op too.
    expect(stampLocalPieceProvenance(state, placeMove(2, 1, 'B', CELLS_B))).toBe(state);
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
