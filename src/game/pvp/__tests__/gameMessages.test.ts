// src/game/pvp/__tests__/gameMessages.test.ts
// Chat poll cursor helper (laterCreatedAt) — the pure piece of the chat
// polling backstop. Hermetic: the supabase singleton is stubbed out at the
// module boundary so importing gameMessages needs no env vars and no network;
// the network functions themselves are NOT exercised here (the live e2e
// harness covers those).

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { laterCreatedAt } from '../gameMessages';

describe('laterCreatedAt (chat poll cursor)', () => {
  it('adopts the candidate when there is no cursor yet', () => {
    expect(laterCreatedAt(null, '2026-07-23T10:00:00.000Z')).toBe(
      '2026-07-23T10:00:00.000Z'
    );
  });

  it('keeps whichever timestamp is later, comparing by instant not by string', () => {
    const earlier = '2026-07-23T10:00:00.000Z';
    const later = '2026-07-23T10:00:01.500Z';
    expect(laterCreatedAt(earlier, later)).toBe(later);
    expect(laterCreatedAt(later, earlier)).toBe(later);
    // Same instant in a different rendering (Postgres offset form vs Z) must
    // not regress the cursor — ties keep the current value.
    const offsetForm = '2026-07-23T12:00:01.5+02:00'; // == later
    expect(laterCreatedAt(later, offsetForm)).toBe(later);
  });

  it('never lets a garbage timestamp regress a valid cursor, and vice versa', () => {
    const valid = '2026-07-23T10:00:00.000Z';
    expect(laterCreatedAt(valid, 'not-a-date')).toBe(valid);
    expect(laterCreatedAt('not-a-date', valid)).toBe(valid);
  });
});
