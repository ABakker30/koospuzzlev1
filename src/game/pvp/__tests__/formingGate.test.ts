// src/game/pvp/__tests__/formingGate.test.ts
// Content-based forming-ghost gate rules (2026-07-23 round 3) — pure layer.
// Hermetic: pure functions only, no Supabase, no network, no timers.
//
// Field context: the poll's forming fallback used to gate only on clocks
// (sender-client forming_at vs DB move.created_at) — a skewed sender device
// let the stale PRE-commit selection re-feed OVER the freshly placed piece
// (ghost wireframe wrapping solid spheres). These rules gate on content and
// sequence instead, so no clock is load-bearing.

import { describe, it, expect } from 'vitest';
import type { IJK } from '../../../types/shape';
import type { PvPGameSession } from '../types';
import {
  formingCellsKey,
  filterFormingCells,
  collectOccupiedCellKeys,
  isBlockedByLastCommit,
  isFormingOnlySessionEcho,
} from '../formingGate';

const c = (i: number, j = 0, k = 0): IJK => ({ i, j, k });

// ---------------------------------------------------------------------------
// formingCellsKey
// ---------------------------------------------------------------------------

describe('formingCellsKey', () => {
  it('is empty for null/undefined/empty input', () => {
    expect(formingCellsKey(null)).toBe('');
    expect(formingCellsKey(undefined)).toBe('');
    expect(formingCellsKey([])).toBe('');
  });

  it('is order-independent (the pre-commit selection and the recorded move cells may be ordered differently)', () => {
    const a = [c(0), c(1), c(2), c(3)];
    const b = [c(3), c(1), c(0), c(2)];
    expect(formingCellsKey(a)).toBe(formingCellsKey(b));
    expect(formingCellsKey(a)).not.toBe('');
  });

  it('differs for different cell sets', () => {
    expect(formingCellsKey([c(0), c(1)])).not.toBe(formingCellsKey([c(0), c(2)]));
  });
});

// ---------------------------------------------------------------------------
// isBlockedByLastCommit — rule (i): the committed cell set never re-feeds
// ---------------------------------------------------------------------------

describe('isBlockedByLastCommit', () => {
  const placed = [c(0), c(1), c(2), c(3)];

  it('blocks the exact committed selection regardless of clocks', () => {
    const blocked = formingCellsKey(placed);
    expect(isBlockedByLastCommit(formingCellsKey([c(2), c(0), c(3), c(1)]), blocked)).toBe(true);
  });

  it('does not block a different (fresh) selection', () => {
    const blocked = formingCellsKey(placed);
    expect(isBlockedByLastCommit(formingCellsKey([c(4), c(5), c(6), c(7)]), blocked)).toBe(false);
  });

  it('never blocks empty payloads or when no commit has been sighted', () => {
    expect(isBlockedByLastCommit('', formingCellsKey(placed))).toBe(false);
    expect(isBlockedByLastCommit(formingCellsKey(placed), '')).toBe(false);
    expect(isBlockedByLastCommit('', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterFormingCells / collectOccupiedCellKeys — ghosts never render on
// occupied cells (a ghost over a placed solid sphere is never correct)
// ---------------------------------------------------------------------------

describe('occupancy filter', () => {
  it('collects occupied keys from board pieces', () => {
    const keys = collectOccupiedCellKeys([
      { cells: [c(0), c(1)] },
      { cells: [c(5)] },
    ]);
    expect(keys.has('0,0,0')).toBe(true);
    expect(keys.has('1,0,0')).toBe(true);
    expect(keys.has('5,0,0')).toBe(true);
    expect(keys.size).toBe(3);
  });

  it('handles null/undefined board sources', () => {
    expect(collectOccupiedCellKeys(null).size).toBe(0);
    expect(collectOccupiedCellKeys(undefined).size).toBe(0);
  });

  it('drops exactly the ghost cells that sit on occupied cells', () => {
    const occupied = collectOccupiedCellKeys([{ cells: [c(0), c(1), c(2), c(3)] }]);
    const ghost = [c(2), c(3), c(4), c(5)];
    expect(filterFormingCells(ghost, occupied)).toEqual([c(4), c(5)]);
  });

  it('drops a fully-stale ghost (the pre-commit selection of an applied piece) entirely', () => {
    const occupied = collectOccupiedCellKeys([{ cells: [c(0), c(1), c(2), c(3)] }]);
    expect(filterFormingCells([c(3), c(1), c(0), c(2)], occupied)).toEqual([]);
  });

  it('passes ghosts through untouched on an empty board', () => {
    const ghost = [c(0), c(1)];
    expect(filterFormingCells(ghost, new Set())).toEqual(ghost);
  });
});

// ---------------------------------------------------------------------------
// isFormingOnlySessionEcho — the sender's own forming-persist writes echo
// back as UPDATE events with no game-meaningful change; they must be skipped
// (no setPvpSession churn), while every real update still applies.
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<PvPGameSession> = {}): PvPGameSession {
  return {
    id: 'sess-1',
    puzzle_id: 'pz',
    puzzle_name: 'Puzzle',
    player1_id: 'u1',
    player2_id: 'u2',
    player1_name: 'A',
    player2_name: 'B',
    player1_avatar_url: null,
    player2_avatar_url: null,
    status: 'active',
    current_turn: 1,
    first_player: 1,
    player1_score: 2,
    player2_score: 1,
    timer_seconds: 300,
    player1_time_remaining_ms: 200_000,
    player2_time_remaining_ms: 210_000,
    turn_started_at: '2026-07-23T10:00:00.000Z',
    board_state: [],
    inventory_state: {},
    placed_count: {},
    hint_limit: 3,
    check_limit: 3,
    player1_hints_used: 0,
    player2_hints_used: 0,
    player1_checks_used: 0,
    player2_checks_used: 0,
    is_simulated: false,
    simulated_opponent_user_id: null,
    winner: null,
    end_reason: null,
    invite_code: null,
    invite_expires_at: null,
    player1_last_heartbeat: '2026-07-23T10:00:05.000Z',
    player2_last_heartbeat: '2026-07-23T10:00:04.000Z',
    forming_cells: null,
    forming_player: null,
    forming_at: null,
    created_at: '2026-07-23T09:00:00.000Z',
    started_at: '2026-07-23T09:00:10.000Z',
    ended_at: null,
    updated_at: '2026-07-23T10:00:05.000Z',
    ...overrides,
  } as PvPGameSession;
}

describe('isFormingOnlySessionEcho', () => {
  it('skips a forming-only write echo (only forming_* changed, updated_at untouched)', () => {
    const prev = makeSession();
    const next = makeSession({
      forming_cells: [c(0), c(1)],
      forming_player: 1,
      forming_at: '2026-07-23T10:00:06.000Z',
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(true);
  });

  it('skips the forming CLEARING write echo too', () => {
    const prev = makeSession({
      forming_cells: [c(0), c(1)],
      forming_player: 1,
      forming_at: '2026-07-23T10:00:06.000Z',
    });
    const next = makeSession({ forming_cells: null, forming_player: null, forming_at: null });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(true);
  });

  it('applies a move commit (turn flip + updated_at bump)', () => {
    const prev = makeSession();
    const next = makeSession({
      current_turn: 2,
      player1_score: 3,
      turn_started_at: '2026-07-23T10:00:20.000Z',
      updated_at: '2026-07-23T10:00:20.000Z',
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(false);
  });

  it('applies a heartbeat (updated_at bumped)', () => {
    const prev = makeSession();
    const next = makeSession({
      player2_last_heartbeat: '2026-07-23T10:00:09.000Z',
      updated_at: '2026-07-23T10:00:09.000Z',
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(false);
  });

  it('applies a game end (status/winner change)', () => {
    const prev = makeSession();
    const next = makeSession({
      status: 'completed',
      winner: 1,
      end_reason: 'resign',
      ended_at: '2026-07-23T10:05:00.000Z',
      updated_at: '2026-07-23T10:05:00.000Z',
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(false);
  });

  it('treats a payload MISSING board_state (unchanged TOASTed column) as unchanged', () => {
    const prev = makeSession({
      board_state: [
        { uid: 'p1', pieceId: 'A', orientationId: 'o', cells: [c(0)], placedAt: 1, placedBy: 1, source: 'manual' },
      ],
    });
    const next = makeSession({
      board_state: undefined as unknown as PvPGameSession['board_state'],
      forming_cells: [c(4)],
      forming_player: 1,
      forming_at: '2026-07-23T10:00:06.000Z',
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(true);
  });

  it('applies when board_state length actually changed', () => {
    const prev = makeSession({ board_state: [] });
    const next = makeSession({
      board_state: [
        { uid: 'p1', pieceId: 'A', orientationId: 'o', cells: [c(0)], placedAt: 1, placedBy: 1, source: 'manual' },
      ],
    });
    expect(isFormingOnlySessionEcho(prev, next)).toBe(false);
  });

  it('never skips without a previous session or across different sessions', () => {
    const next = makeSession();
    expect(isFormingOnlySessionEcho(null, next)).toBe(false);
    expect(isFormingOnlySessionEcho(makeSession({ id: 'other' }), next)).toBe(false);
  });
});
