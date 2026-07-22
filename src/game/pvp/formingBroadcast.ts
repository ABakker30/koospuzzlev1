// src/game/pvp/formingBroadcast.ts
// Opponent forming preview — ephemeral broadcast of the active player's
// in-progress sphere selection so the waiting opponent watches the piece
// take shape live.
//
// Transport: Supabase realtime BROADCAST (same pattern as the legacy chat
// channel in usePvPHumanChat) — no DB writes, no migration, low latency.
// Every message carries the FULL current selection array, never deltas:
// full-state messages self-heal any missed events (a late joiner or a
// dropped packet is corrected by the very next update).
//
// Channel topic: `game-forming-<sessionId>`. Both players join the same
// channel; each ignores messages where `player` equals their own number.

import { supabase } from '../../lib/supabase';

/** FCC lattice cell coordinate (structurally identical to IJK / Anchor). */
export interface FormingCell {
  i: number;
  j: number;
  k: number;
}

export interface FormingUpdate {
  player: 1 | 2;
  cells: FormingCell[];
}

export type FormingChannel = ReturnType<typeof supabase.channel>;

const EVENT = 'forming';

/**
 * Join the forming channel for a session and listen for updates.
 *
 * Returns the joined channel (so the caller can send its own forming state
 * on the same socket via `sendFormingCells`) plus an unsubscribe that tears
 * the channel down.
 */
export function subscribeForming(
  sessionId: string,
  onUpdate: (update: FormingUpdate) => void
): { channel: FormingChannel; unsubscribe: () => void } {
  const channel = supabase.channel(`game-forming-${sessionId}`);
  channel
    .on('broadcast', { event: EVENT }, ({ payload }) => {
      if (!payload) return;
      const player = payload.player;
      if (player !== 1 && player !== 2) return;
      const rawCells = Array.isArray(payload.cells) ? payload.cells : [];
      const cells: FormingCell[] = [];
      for (const c of rawCells) {
        if (
          c &&
          typeof c.i === 'number' &&
          typeof c.j === 'number' &&
          typeof c.k === 'number'
        ) {
          cells.push({ i: c.i, j: c.j, k: c.k });
        }
      }
      onUpdate({ player, cells });
    })
    .subscribe();

  return {
    channel,
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

/**
 * Broadcast the sender's FULL current selection (empty array = selection
 * cleared). Best-effort and fire-and-forget: forming previews are cosmetic,
 * so a dropped send is simply corrected by the next full-state message.
 */
export async function sendFormingCells(
  channel: FormingChannel,
  playerNumber: 1 | 2,
  cells: FormingCell[]
): Promise<void> {
  try {
    await channel.send({
      type: 'broadcast',
      event: EVENT,
      payload: {
        player: playerNumber,
        cells: cells.map((c) => ({ i: c.i, j: c.j, k: c.k })),
      },
    });
  } catch {
    // Transient network failure — the next selection change resends full state.
  }
}
