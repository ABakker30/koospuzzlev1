// src/game/pvp/__tests__/matchClipPlanner.test.ts
// Match-replay clip planner (Q4) — pure planning layer.
// Hermetic: pure functions only, no Supabase, no network, no timers.

import { describe, it, expect } from 'vitest';
import { createPuzzleSpec, cellToKey, type IJK } from '../../puzzle/PuzzleTypes';
import type { PvPGameSession, PvPGameMove, PvPPlacedPiece } from '../types';
import {
  summarizeMatch,
  planMatchClip,
  CLIP_PACING,
  CLIP_MAX_TOTAL_SEC,
  type MatchSummary,
  type MatchMoveSummary,
  type ReplayPiece,
  type ClipBeat,
} from '../matchClipPlanner';

// ---------------------------------------------------------------------------
// Fixture: same 12-cell strip container + 4-cell pieces the replaySession
// tests use (the engine validates overlap + inventory, not container
// membership).
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
    status: 'completed',
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
    ended_at: '2026-07-22T10:30:00.000Z',
    updated_at: '2026-07-22T10:30:00.000Z',
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

// ---- Hand-built summaries for planner-only tests ----

let uidSeq = 0;
function piece(pieceId: string, cells: IJK[], placedBy: 1 | 2): ReplayPiece {
  uidSeq += 1;
  return { uid: `p-${pieceId}-${uidSeq}`, pieceId, cells, placedBy };
}

function summaryOf(moves: MatchMoveSummary[]): MatchSummary {
  const pieces: Record<string, ReplayPiece> = {};
  for (const m of moves) {
    for (const p of [...m.added, ...m.removed]) pieces[p.uid] = pieces[p.uid] ?? p;
  }
  const last = moves[moves.length - 1];
  return {
    moves,
    finalScore: last ? { ...last.scoreAfter } : { p1: 0, p2: 0 },
    pieces,
  };
}

function placeSummary(
  moveNumber: number,
  mover: 1 | 2,
  p: ReplayPiece,
  scoreAfter: { p1: number; p2: number }
): MatchMoveSummary {
  return { moveNumber, mover, kind: 'place', added: [p], removed: [], scoreAfter };
}

const beatsOf = (plan: { beats: ClipBeat[] }, type: ClipBeat['type']) =>
  plan.beats.filter((b) => b.type === type);

// ---------------------------------------------------------------------------
// summarizeMatch — replay + diff through the production reducer path
// ---------------------------------------------------------------------------

describe('summarizeMatch', () => {
  it('extracts added pieces in click order and check-repair removals', () => {
    const clickOrderB = [cell(6), cell(4), cell(7), cell(5)]; // deliberately non-sorted
    const moves = [
      placeMove(1, 1, 'A', CELLS_A),
      placeMove(2, 2, 'B', clickOrderB),
      // Player 1's correct check removes B (snapshot keeps only A).
      makeMove({
        move_number: 3,
        player_number: 1,
        move_type: 'check',
        board_state_after: [snapshotPiece('A', CELLS_A, 1)],
      }),
      placeMove(4, 1, 'C', CELLS_C),
    ];
    const summary = summarizeMatch(makeSession(), moves, PUZZLE_SPEC);
    expect(summary).not.toBeNull();
    const s = summary!;

    expect(s.moves).toHaveLength(4);
    // Move 2's piece keeps the recorded tap sequence, not a sorted order.
    expect(s.moves[1].added).toHaveLength(1);
    expect(s.moves[1].added[0].cells.map(cellToKey)).toEqual(
      clickOrderB.map(cellToKey)
    );
    expect(s.moves[1].added[0].placedBy).toBe(2);

    // The check removed B, attributed to its PLACER (player 2).
    expect(s.moves[2].kind).toBe('check');
    expect(s.moves[2].removed).toHaveLength(1);
    expect(s.moves[2].removed[0].pieceId).toBe('B');
    expect(s.moves[2].removed[0].placedBy).toBe(2);

    // Scores follow the replay: +1 A, +1 B, check −1 to B's placer, +1 C.
    expect(s.moves[1].scoreAfter).toEqual({ p1: 1, p2: 1 });
    expect(s.moves[2].scoreAfter).toEqual({ p1: 1, p2: 0 });
    expect(s.finalScore).toEqual({ p1: 2, p2: 0 });

    // Registry contains every piece that ever appeared (B included).
    expect(Object.values(s.pieces).map((p) => p.pieceId).sort()).toEqual([
      'A',
      'B',
      'C',
    ]);
  });
});

// ---------------------------------------------------------------------------
// planMatchClip — pacing + beat semantics
// ---------------------------------------------------------------------------

describe('planMatchClip — pacing budget', () => {
  it('gives short games ~1s per move and always ends within the hard cap', () => {
    const short = summaryOf([
      placeSummary(1, 1, piece('A', CELLS_A, 1), { p1: 1, p2: 0 }),
      placeSummary(2, 2, piece('B', CELLS_B, 2), { p1: 1, p2: 1 }),
      placeSummary(3, 1, piece('C', CELLS_C, 1), { p1: 2, p2: 1 }),
    ]);
    const plan = planMatchClip(short);
    // Two non-final moves at the ideal pace, final move gets the slow beat.
    const solidifies = beatsOf(plan, 'solidify');
    expect(solidifies).toHaveLength(3);
    const moveSpan = plan.beats
      .filter((b): b is Extract<ClipBeat, { type: 'formingSphere' }> => b.type === 'formingSphere')
      .filter((b) => b.sphereIndex === 0)
      .map((b) => b.t);
    expect(moveSpan[1] - moveSpan[0]).toBeCloseTo(CLIP_PACING.PER_MOVE_IDEAL_SEC, 5);
    // Final move slot is the slower FINAL_MOVE_SEC beat.
    expect(plan.outcomeAtSec - moveSpan[2]).toBeCloseTo(
      CLIP_PACING.FINAL_MOVE_SEC + CLIP_PACING.FINAL_HOLD_SEC,
      5
    );
    expect(plan.durationSec).toBeLessThanOrEqual(CLIP_MAX_TOTAL_SEC);
  });

  it('accelerates long games: 40 eventful moves still fit the clip budget', () => {
    const moves: MatchMoveSummary[] = [];
    for (let i = 0; i < 40; i++) {
      const mover = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      moves.push(
        placeSummary(i + 1, mover, piece('A', CELLS_A, mover), {
          p1: Math.ceil((i + 1) / 2),
          p2: Math.floor((i + 1) / 2),
        })
      );
    }
    const plan = planMatchClip(summaryOf(moves));
    expect(plan.durationSec).toBeLessThanOrEqual(CLIP_MAX_TOTAL_SEC);
    // The moves section really accelerated (well under 1s/move).
    const movesSpan =
      plan.outcomeAtSec - CLIP_PACING.FINAL_HOLD_SEC - plan.introSec;
    expect(movesSpan / 40).toBeLessThan(0.7);
    // Beats are non-decreasing in time.
    for (let i = 1; i < plan.beats.length; i++) {
      expect(plan.beats[i].t).toBeGreaterThanOrEqual(plan.beats[i - 1].t - 1e-9);
    }
  });
});

describe('planMatchClip — click order', () => {
  it('emits formingSphere beats in the recorded tap sequence, then solidify', () => {
    const clickOrder = [cell(6), cell(4), cell(7), cell(5)];
    const p = piece('B', clickOrder, 2);
    const plan = planMatchClip(
      summaryOf([placeSummary(1, 2, p, { p1: 0, p2: 1 })])
    );
    const forming = plan.beats.filter(
      (b): b is Extract<ClipBeat, { type: 'formingSphere' }> =>
        b.type === 'formingSphere' && b.uid === p.uid
    );
    expect(forming.map((b) => b.sphereIndex)).toEqual([0, 1, 2, 3]);
    for (let i = 1; i < forming.length; i++) {
      expect(forming[i].t).toBeGreaterThan(forming[i - 1].t);
      const gap = forming[i].t - forming[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(CLIP_PACING.TICK_MIN_SEC - 1e-9);
      expect(gap).toBeLessThanOrEqual(CLIP_PACING.TICK_MAX_SEC + 1e-9);
    }
    const solidify = beatsOf(plan, 'solidify')[0];
    expect(solidify.t).toBeGreaterThanOrEqual(forming[3].t);
  });
});

describe('planMatchClip — repair beats', () => {
  it('check repairs glow then remove, before any later forming', () => {
    const doomed = piece('B', CELLS_B, 2);
    const later = piece('C', CELLS_C, 1);
    const plan = planMatchClip(
      summaryOf([
        placeSummary(1, 2, doomed, { p1: 0, p2: 1 }),
        {
          moveNumber: 2,
          mover: 1,
          kind: 'check',
          added: [],
          removed: [doomed],
          scoreAfter: { p1: 0, p2: 0 },
        },
        placeSummary(3, 1, later, { p1: 1, p2: 0 }),
      ])
    );
    const glow = beatsOf(plan, 'removeGlow')[0] as Extract<ClipBeat, { type: 'removeGlow' }>;
    const remove = beatsOf(plan, 'remove')[0] as Extract<ClipBeat, { type: 'remove' }>;
    expect(glow).toBeDefined();
    expect(remove).toBeDefined();
    expect(glow.uids).toEqual([doomed.uid]);
    expect(remove.uids).toEqual([doomed.uid]);
    expect(glow.t).toBeLessThan(remove.t);
    // The removal's score ticks the −1 down.
    expect(remove.scoreAfter).toEqual({ p1: 0, p2: 0 });
    // Later piece only starts forming after the removal beat.
    const laterForming = plan.beats.find(
      (b) => b.type === 'formingSphere' && b.uid === later.uid
    )!;
    expect(laterForming.t).toBeGreaterThanOrEqual(remove.t - 1e-9);
  });

  it('hint moves emit a hintFlash at their solidify beat', () => {
    const hinted = piece('A', CELLS_A, 1);
    const plan = planMatchClip(
      summaryOf([
        {
          moveNumber: 1,
          mover: 1,
          kind: 'hint',
          added: [hinted],
          removed: [],
          scoreAfter: { p1: 0, p2: 0 },
        },
      ])
    );
    const flash = beatsOf(plan, 'hintFlash')[0];
    const solidify = beatsOf(plan, 'solidify')[0] as Extract<ClipBeat, { type: 'solidify' }>;
    expect(flash).toBeDefined();
    expect(flash.t).toBeCloseTo(solidify.t, 9);
    expect(solidify.viaHint).toBe(true);
  });
});

describe('planMatchClip — resign outcome', () => {
  it('resign moves earn no screen time but the outcome card still lands', () => {
    const p = piece('A', CELLS_A, 1);
    const plan = planMatchClip(
      summaryOf([
        placeSummary(1, 1, p, { p1: 1, p2: 0 }),
        {
          moveNumber: 2,
          mover: 2,
          kind: 'resign',
          added: [],
          removed: [],
          scoreAfter: { p1: 1, p2: 0 },
        },
      ])
    );
    // Exactly one move earns a slot (the resign contributes nothing).
    expect(beatsOf(plan, 'solidify')).toHaveLength(1);
    const outcome = beatsOf(plan, 'outcome');
    expect(outcome).toHaveLength(1);
    expect(outcome[0].t).toBe(plan.outcomeAtSec);
    expect(plan.durationSec).toBeCloseTo(
      plan.outcomeAtSec + CLIP_PACING.OUTCOME_SEC,
      9
    );
    expect(plan.finalScore).toEqual({ p1: 1, p2: 0 });
    // The single move is final → gets the slow beat before the hold.
    expect(plan.outcomeAtSec).toBeCloseTo(
      plan.introSec + Math.max(CLIP_PACING.MOVES_BUDGET_MIN_SEC, CLIP_PACING.FINAL_MOVE_SEC) + CLIP_PACING.FINAL_HOLD_SEC,
      9
    );
  });
});
