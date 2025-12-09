import { useCallback } from 'react';
import type { GameSessionState, TurnActionType } from '../types/manualGame';

interface UseGameTurnControllerArgs {
  session: GameSessionState | null;
  logEvent: (playerId: string, type: TurnActionType, payload?: Record<string, any>) => void;
  applyScoreDelta: (playerId: string, delta: number) => void;
  advanceTurn: () => void;
}

/**
 * Central place for turn + scoring rules.
 * UI (drawing, hints, solvability) should call these handlers instead of
 * touching session / scores directly.
 */
export function useGameTurnController({
  session,
  logEvent,
  applyScoreDelta,
  advanceTurn,
}: UseGameTurnControllerArgs) {
  const getCurrentPlayerId = useCallback(() => {
    if (!session) return null;
    return session.players[session.currentPlayerIndex].id;
  }, [session]);

  /**
   * Called when the current player successfully places a piece.
   * For now: +1 point, log event, advance turn.
   * Later: we can pass in metadata about move quality, solvability impact, etc.
   */
  const handlePlacePiece = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      // scoring rule: +1 for each valid placed piece
      applyScoreDelta(playerId, 1);

      logEvent(playerId, 'place_piece', extraPayload);
      advanceTurn();
    },
    [getCurrentPlayerId, applyScoreDelta, logEvent, advanceTurn]
  );

  /**
   * Called when the current player removes a piece.
   * For now: no score change, log event, NO automatic turn change.
   * Turn behavior can be tuned later (e.g. removing costs a turn).
   */
  const handleRemovePiece = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      logEvent(playerId, 'remove_piece', extraPayload);
      // Turn policy: for now, do not auto-advance.
      // We can add a flag later (advanceOnRemove?: boolean) if we want.
    },
    [getCurrentPlayerId, logEvent]
  );

  /**
   * Called when the current player uses a hint.
   * For now: no score change, log event, advance turn.
   */
  const handleHint = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      logEvent(playerId, 'hint', extraPayload);
      advanceTurn();
    },
    [getCurrentPlayerId, logEvent, advanceTurn]
  );

  /**
   * Called when the current player checks solvability.
   * For now: no score change, log event, NO turn change
   * (we treat it as an informational check).
   */
  const handleSolvabilityCheck = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      logEvent(playerId, 'check_solvability', extraPayload);
      // No turn change for now.
    },
    [getCurrentPlayerId, logEvent]
  );

  return {
    handlePlacePiece,
    handleRemovePiece,
    handleHint,
    handleSolvabilityCheck,
  };
}
