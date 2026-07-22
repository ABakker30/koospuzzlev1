// src/game/pvp/mySessionsStore.ts
// Multi-game session store (async-first PvP Phase 2b) — the generalization of
// hostSessionPointer.ts from ONE breadcrumb to a small per-device list of
// every PvP session this player is part of, in either role. localStorage key
// 'pvp.mySessions' holds an array of {sessionId, puzzleId, role, createdAt},
// newest first, capped at MAX_ENTRIES. The Home games inbox unions this list
// with a server query; guests (anonymous auth, nothing queryable by "my
// account" from other devices) rely on it entirely.
//
// Back-compat: the legacy single host pointer ('pvp.hostSession', written by
// pre-2b builds) is folded into the list on first read.
//
// Everything is best-effort: localStorage failures must never break the game.

import { readHostSessionPointer } from './hostSessionPointer';

const KEY = 'pvp.mySessions';
const MAX_ENTRIES = 20;

export interface MySessionEntry {
  sessionId: string;
  puzzleId: string;
  role: 'host' | 'guest';
  createdAt: string;
}

function isValidEntry(e: any): e is MySessionEntry {
  return (
    !!e &&
    typeof e.sessionId === 'string' &&
    typeof e.puzzleId === 'string' &&
    (e.role === 'host' || e.role === 'guest')
  );
}

function writeEntries(entries: MySessionEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage unavailable (private mode, quota) — the inbox just won't
    // remember this session locally; the signed-in server query still works.
  }
}

/** All locally-known sessions, newest first. Folds in the legacy single host
 *  pointer (pre-2b builds) so nothing is lost across the upgrade. */
export function readMySessions(): MySessionEntry[] {
  let entries: MySessionEntry[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed.filter(isValidEntry);
    }
  } catch {
    entries = [];
  }
  // Legacy migration: the old single host pointer becomes a host entry.
  try {
    const legacy = readHostSessionPointer();
    if (legacy && !entries.some((e) => e.sessionId === legacy.sessionId)) {
      entries.push({
        sessionId: legacy.sessionId,
        puzzleId: legacy.puzzleId,
        role: 'host',
        createdAt: legacy.createdAt ?? new Date().toISOString(),
      });
      writeEntries(entries);
    }
  } catch {
    // Legacy pointer unreadable — ignore.
  }
  return entries;
}

/** Record (or refresh) a session this device is playing. Idempotent — an
 *  existing entry for the same session is moved to the front. */
export function recordMySession(entry: MySessionEntry): void {
  try {
    const rest = readMySessions().filter((e) => e.sessionId !== entry.sessionId);
    writeEntries([entry, ...rest]);
  } catch {
    // Best-effort.
  }
}

/** Drop a session from the local list (terminal status, pruning). */
export function removeMySession(sessionId: string): void {
  try {
    const entries = readMySessions().filter((e) => e.sessionId !== sessionId);
    writeEntries(entries);
  } catch {
    // Best-effort.
  }
}
