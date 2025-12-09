import { useState, useEffect, useCallback } from 'react';
import type {
  GameSessionState,
  Player,
  GameEvent,
  TurnActionType,
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
  for (const p of players) {
    scores[p.id] = 0;
  }

  return {
    players,
    currentPlayerIndex: 0, // gold (you) starts, like white in chess
    scores,
    events: [],
    isComplete: false,
    winnerId: undefined,
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
  };
}
