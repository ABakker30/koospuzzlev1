import { useState, useEffect, useCallback } from 'react';
import type {
  GameSessionState,
  Player,
  PlayerStats,
  GameEvent,
  TurnActionType,
  GameEndReason,
  PlayerId,
} from '../types/manualGame';

export const GOLD_COLOR = '#d4af37';   // gold
export const SILVER_COLOR = '#c0c0c0'; // silver

function createInitialPlayers(): Player[] {
  return [
    {
      id: 'gold',
      name: 'You',
      color: GOLD_COLOR,
      isComputer: false,
    },
    {
      id: 'silver',
      name: 'Computer',
      color: SILVER_COLOR,
      isComputer: true,
    },
  ];
}

function createInitialSession(): GameSessionState {
  const players = createInitialPlayers();

  const scores: Record<string, number> = {};
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) {
    scores[p.id] = 0;
    stats[p.id] = { hintsUsed: 0, solvabilityChecksUsed: 0 };
  }

  return {
    players,
    currentPlayerIndex: 0, // gold (you) starts, like white in chess
    scores,
    stats,
    events: [],
    isComplete: false,
    winnerId: undefined,
    endReason: undefined,
  };
}

export function useManualGameSession(puzzleId?: string) {
  const [session, setSession] = useState<GameSessionState | null>(null);

  // initialize/reset when puzzle changes
  useEffect(() => {
    if (!puzzleId) return;
    setSession(createInitialSession());
  }, [puzzleId]);

  // Add a game event (for future playback)
  const logEvent = useCallback(
    (playerId: string, type: TurnActionType, payload?: Record<string, any>) => {
      setSession(prev => {
        if (!prev) return prev;
        const turnIndex = prev.events.length;

        const event: GameEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          turnIndex,
          playerId,
          type,
          timestamp: Date.now(),
          payload,
        };

        return {
          ...prev,
          events: [...prev.events, event],
        };
      });
    },
    []
  );

  // Adjust score for a given player
  const applyScoreDelta = useCallback((playerId: string, delta: number) => {
    setSession(prev => {
      if (!prev) return prev;

      const nextScores = { ...prev.scores };
      nextScores[playerId] = (nextScores[playerId] ?? 0) + delta;

      return {
        ...prev,
        scores: nextScores,
      };
    });
  }, []);

  // Advance to next player's turn (wraps around players array)
  const advanceTurn = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev;
      const nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      return {
        ...prev,
        currentPlayerIndex: nextIndex,
      };
    });
  }, []);

  // Increment hints used for a player
  const incrementHintsUsed = useCallback((playerId: string) => {
    setSession(prev => {
      if (!prev) return prev;
      const stats = { ...prev.stats };
      const current = stats[playerId] ?? { hintsUsed: 0, solvabilityChecksUsed: 0 };
      stats[playerId] = {
        ...current,
        hintsUsed: current.hintsUsed + 1,
      };
      return { ...prev, stats };
    });
  }, []);

  // Increment solvability checks for a player
  const incrementSolvabilityChecks = useCallback((playerId: string) => {
    setSession(prev => {
      if (!prev) return prev;
      const stats = { ...prev.stats };
      const current = stats[playerId] ?? { hintsUsed: 0, solvabilityChecksUsed: 0 };
      stats[playerId] = {
        ...current,
        solvabilityChecksUsed: current.solvabilityChecksUsed + 1,
      };
      return { ...prev, stats };
    });
  }, []);

  // End the game with a reason
  const endGame = useCallback((reason: GameEndReason, explicitWinnerId?: PlayerId | null) => {
    setSession(prev => {
      if (!prev || prev.isComplete) return prev;

      // If explicit winnerId provided, use it (null means draw)
      let winnerId: PlayerId | undefined = undefined;
      if (explicitWinnerId !== undefined) {
        winnerId = explicitWinnerId === null ? undefined : explicitWinnerId;
      } else {
        // Fallback: highest score
        const entries = Object.entries(prev.scores) as [PlayerId, number][];
        if (entries.length) {
          entries.sort((a, b) => b[1] - a[1]);
          if (entries[0][1] > (entries[1]?.[1] ?? -Infinity)) {
            winnerId = entries[0][0];
          } else {
            winnerId = undefined; // tie
          }
        }
      }

      return {
        ...prev,
        isComplete: true,
        winnerId,
        endReason: reason,
      };
    });
  }, []);

  // optional: full reset if needed later
  const resetSession = useCallback(() => {
    setSession(createInitialSession());
  }, []);

  return {
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
    resetSession,
    incrementHintsUsed,
    incrementSolvabilityChecks,
    endGame,                         // 👈 NEW
  };
}
