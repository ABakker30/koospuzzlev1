// src/game/pvp/hostSessionPointer.ts
// Host resume pointer — a tiny localStorage breadcrumb that lets a host who
// closed the waiting room (or whole tab) find their way back to a live PvP
// invite. Written when the host creates a session, cleared on every end path.
// Everything is best-effort: localStorage failures must never break the game.

const KEY = 'pvp.hostSession';

export interface HostSessionPointer {
  sessionId: string;
  puzzleId: string;
  code: string;
  createdAt: string;
}

export function saveHostSessionPointer(pointer: HostSessionPointer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pointer));
  } catch {
    // Storage unavailable (private mode, quota) — resume just won't be offered.
  }
}

export function readHostSessionPointer(): HostSessionPointer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.sessionId === 'string' &&
      typeof parsed.puzzleId === 'string'
    ) {
      return parsed as HostSessionPointer;
    }
    localStorage.removeItem(KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the pointer. When `sessionId` is given, only clears if the stored
 * pointer refers to that session (so an invitee ending someone else's game
 * never wipes the host pointer of a different match on this device).
 */
export function clearHostSessionPointer(sessionId?: string): void {
  try {
    if (sessionId) {
      const current = readHostSessionPointer();
      if (!current || current.sessionId !== sessionId) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    // Ignore — worst case a stale pointer lingers and is cleared on next read.
  }
}
