// useGhostReplay — drives a "ghost race": the challenger's recorded solve
// (per-piece placedAt timestamps stored on their saved solution) replayed as
// a live opponent while the player solves the same puzzle. Display-only
// pressure: it never touches the game engine or the verdict — judgeChallenge
// still compares final X/N + the honest stored duration_ms.
//
// Rules (docs/pvp-ghost-race-design.md §2):
//   - Only the challenger's self-placements (reason === 'user') replay.
//   - placedAt is absolute epoch ms; only deltas from their first placement
//     are meaningful.
//   - Long think-gaps are compressed for DISPLAY ONLY (capped per gap) so the
//     ghost never leaves dead air; verdict time is untouched.
//   - The ghost clock anchors to the PLAYER's first placement (both racers
//     measured "first move → now"), and holds its finished state once done.
//   - Degrades gracefully: solutions without usable placed_pieces yield
//     ready=false and the caller keeps the plain stat banner.

import { useEffect, useMemo, useState } from 'react';
import { getSolutionById } from '../../api/solutions';
import { track } from '../../lib/observability';

const MAX_DISPLAY_GAP_MS = 20_000;
const TICK_MS = 250;

export interface GhostState {
  /** Ghost data loaded and usable. */
  ready: boolean;
  /** Clock running (player has made their first move). */
  running: boolean;
  /** Ghost self-placements revealed so far. */
  count: number;
  /** Ghost's final self-placement count (== challenger's X). */
  total: number;
  finished: boolean;
}

const IDLE: GhostState = { ready: false, running: false, count: 0, total: 0, finished: false };

export function useGhostReplay(
  challengeId: string | null,
  anchorAtMs: number | null,
  active: boolean
): GhostState {
  // Display schedule: sorted ms offsets (gap-compressed) per ghost placement.
  const [schedule, setSchedule] = useState<number[] | null>(null);
  const [nowMs, setNowMs] = useState(0);

  // Fetch the challenger's recorded placements once per challenge.
  useEffect(() => {
    if (!challengeId) {
      setSchedule(null);
      return;
    }
    let cancelled = false;
    getSolutionById(challengeId)
      .then((sol) => {
        if (cancelled) return;
        const pieces = ((sol?.placed_pieces as any[]) || []).filter(
          (p) => p && typeof p.placedAt === 'number' && p.reason === 'user'
        );
        if (pieces.length === 0) {
          setSchedule(null);
          return;
        }
        const times = pieces.map((p) => p.placedAt as number).sort((a, b) => a - b);
        const offsets: number[] = [];
        let display = 0;
        for (let i = 0; i < times.length; i++) {
          const gap = i === 0 ? 0 : times[i] - times[i - 1];
          display += Math.min(Math.max(gap, 0), MAX_DISPLAY_GAP_MS);
          offsets.push(display);
        }
        setSchedule(offsets);
        track('ghost_race_ready', { placements: offsets.length });
      })
      .catch(() => {
        if (!cancelled) setSchedule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  const total = schedule?.length ?? 0;
  const lastOffset = total > 0 ? schedule![total - 1] : 0;

  // Tick only while there's something to animate: data loaded, player has
  // started, game still active, ghost not yet done.
  const shouldTick =
    !!schedule && anchorAtMs != null && active && nowMs - (anchorAtMs ?? 0) <= lastOffset;

  useEffect(() => {
    if (!shouldTick) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [shouldTick]);

  return useMemo<GhostState>(() => {
    if (!schedule || total === 0) return IDLE;
    if (anchorAtMs == null) return { ready: true, running: false, count: 0, total, finished: false };
    const elapsed = Math.max(0, nowMs - anchorAtMs);
    let count = 0;
    for (const t of schedule) {
      if (t <= elapsed) count++;
      else break;
    }
    return { ready: true, running: true, count, total, finished: count >= total };
  }, [schedule, total, anchorAtMs, nowMs]);
}
