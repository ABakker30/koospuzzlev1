// tutorialService — the "Show me how" tutorial ladder config, read from the
// tutorial_steps table (managed by Anton in /admin). Each of the three steps
// carries a PUZZLE and PIECE RULES; the i18n copy (title / instruction /
// praise) stays in code (constants/tutorial.ts). Short cache so HomePage /
// GamePage don't refetch on every mount. Mirrors contestService's shape:
// single-source table, 60s cached getter, admin-gated writer.
//
// Fallback contract: if the table is absent/empty or the fetch errors, every
// getter returns the hardcoded TUTORIAL_STEPS unchanged — the tutorial works
// pre-migration exactly as before. DB rows MERGE over the constants by step
// number (the DB wins for puzzleId / pieceMode / singlePieceId; the i18n keys
// ALWAYS come from the constant).

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TUTORIAL_STEPS, type TutorialStep } from '../constants/tutorial';
import type { PieceMode } from '../game/contracts/GameState';

/** Resolved step keeps the TutorialStep shape — same i18n keys, DB-supplied
 *  puzzle/piece fields. */
export type ResolvedTutorialStep = TutorialStep;

/** The editable slice an admin saves (i18n keys are code-owned, never sent).
 *  puzzleId is nullable here — the admin editor can hold "— none —" mid-edit;
 *  validateTutorialSteps rejects saving a null. A ResolvedTutorialStep (puzzleId
 *  always a string) is assignable to this. */
export interface TutorialStepConfig {
  step: number;
  puzzleId: string | null;
  pieceMode: PieceMode;
  singlePieceId: string | null;
}

const VALID_MODES: PieceMode[] = ['unique', 'duplicates', 'single'];

let cache: ResolvedTutorialStep[] | null = null;
let fetchedAt = 0;
const CACHE_MS = 60_000;

// Subscribers (the useTutorialSteps hook) re-render when a fetch/write updates
// the cache — so a cold deep-link that resolved the config AFTER first paint
// still reconciles.
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

/** Merge one raw DB row over its constant step. DB wins for the puzzle/piece
 *  fields (with tolerant fallbacks so a half-filled or corrupt row can never
 *  produce a broken step); the i18n keys are always the constant's. */
function mergeRow(base: TutorialStep, row: Record<string, unknown>): ResolvedTutorialStep {
  const rawMode = row.piece_mode;
  const pieceMode: PieceMode = VALID_MODES.includes(rawMode as PieceMode)
    ? (rawMode as PieceMode)
    : base.pieceMode;
  const rawPuzzle = row.puzzle_id;
  const puzzleId =
    typeof rawPuzzle === 'string' && rawPuzzle ? rawPuzzle : base.puzzleId;
  const rawSingle = row.single_piece_id;
  return {
    ...base, // i18n keys (titleKey/instructionKey/praiseKey) always from the constant
    puzzleId,
    pieceMode,
    // singlePieceId is only meaningful for 'single'; force null otherwise.
    singlePieceId:
      pieceMode === 'single'
        ? (typeof rawSingle === 'string' && rawSingle ? rawSingle : base.singlePieceId)
        : null,
  };
}

function mergeAll(rows: Array<Record<string, unknown>>): ResolvedTutorialStep[] {
  const byStep = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    if (typeof row.step === 'number') byStep.set(row.step, row);
  }
  return TUTORIAL_STEPS.map((base) => {
    const row = byStep.get(base.step);
    return row ? mergeRow(base, row) : { ...base };
  });
}

/** Fetch + merge the ladder (60s cache like getContest). Any error / missing
 *  table → the hardcoded TUTORIAL_STEPS. */
export async function getTutorialSteps(force = false): Promise<ResolvedTutorialStep[]> {
  if (!force && cache && Date.now() - fetchedAt < CACHE_MS) return cache;
  try {
    const { data, error } = await supabase.from('tutorial_steps').select('*');
    if (error || !data) return cache ?? TUTORIAL_STEPS;
    cache = mergeAll(data as Array<Record<string, unknown>>);
    fetchedAt = Date.now();
    notify();
    return cache;
  } catch {
    // Table absent pre-migration, offline, etc. — fall back, never throw.
    return cache ?? TUTORIAL_STEPS;
  }
}

/** Synchronous accessor — the cache if warm, otherwise the hardcoded ladder.
 *  Never blocks first render; callers (tutorialUrl, the hook) read this. */
export function getCachedTutorialSteps(): ResolvedTutorialStep[] {
  return cache ?? TUTORIAL_STEPS;
}

/** Deep-link into a tutorial lesson. Same format as before; now cache-backed
 *  so an admin's repointed puzzle takes effect without a deploy. Unknown steps
 *  fall back to the gallery (matches the previous behavior). */
export function tutorialUrl(step: number): string {
  const s = getCachedTutorialSteps().find((t) => t.step === step);
  return s ? `/game/${s.puzzleId}?mode=solo&tutorial=${s.step}` : '/gallery';
}

/** Client-side mirror of the write rules. Returns null when valid. */
export function validateTutorialSteps(steps: TutorialStepConfig[]): string | null {
  for (const s of steps) {
    if (!s.puzzleId) return `Step ${s.step}: pick a puzzle.`;
    if (s.pieceMode === 'single' && !s.singlePieceId)
      return `Step ${s.step}: Choose Pieces needs at least one piece selected.`;
  }
  return null;
}

/** Admin-only (RLS-enforced). Upserts the three step rows. Returns an error
 *  message or null on success. Tolerates the table being absent pre-migration
 *  by surfacing a run-the-migration hint instead of throwing. */
export async function updateTutorialSteps(steps: TutorialStepConfig[]): Promise<string | null> {
  const invalid = validateTutorialSteps(steps);
  if (invalid) return invalid;
  const rows = steps.map((s) => ({
    step: s.step,
    puzzle_id: s.puzzleId,
    piece_mode: s.pieceMode,
    single_piece_id: s.pieceMode === 'single' ? s.singlePieceId : null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('tutorial_steps').upsert(rows, { onConflict: 'step' });
  if (error) {
    // Migration not run yet → the relation is missing. Same tolerance stance
    // as contestService: name the fix, don't crash.
    if (/tutorial_steps/.test(error.message) && /exist|relation|schema cache/i.test(error.message)) {
      return 'The tutorial_steps table is missing — run supabase/migrations/20260813_tutorial_settings.sql.';
    }
    return error.message;
  }
  // Refresh the cache from what we just wrote so callers see it immediately.
  cache = mergeAll(
    steps.map((s) => ({
      step: s.step,
      puzzle_id: s.puzzleId,
      piece_mode: s.pieceMode,
      single_piece_id: s.singlePieceId,
    }))
  );
  fetchedAt = Date.now();
  notify();
  return null;
}

/** Triggers getTutorialSteps() once on mount and returns the cached ladder,
 *  re-rendering when the fetch (or an admin write) resolves. Used by HomePage
 *  and GamePage so a cold deep-link still adopts the configured rules. */
export function useTutorialSteps(): ResolvedTutorialStep[] {
  const [, force] = useState(0);
  useEffect(() => {
    let mounted = true;
    const rerender = () => {
      if (mounted) force((n) => n + 1);
    };
    listeners.add(rerender);
    // Warm the cache; notify() re-renders subscribers when it lands.
    getTutorialSteps().catch(() => {});
    return () => {
      mounted = false;
      listeners.delete(rerender);
    };
  }, []);
  return getCachedTutorialSteps();
}
