import { useCallback } from 'react';
import type { GameSessionState, TurnActionType } from '../types/manualGame';

interface UseGameTurnControllerArgs {
  session: GameSessionState | null;
  logEvent: (playerId: string, type: TurnActionType, payload?: Record<string, any>) => void;
  applyScoreDelta: (playerId: string, delta: number) => void;
  advanceTurn: () => void;
  incrementHintsUsed: (playerId: string) => void;
  incrementSolvabilityChecks: (playerId: string) => void;
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
  incrementHintsUsed,
  incrementSolvabilityChecks,
}: UseGameTurnControllerArgs) {
  const getCurrentPlayerId = useCallback(() => {
    if (!session) return null;
    return session.players[session.currentPlayerIndex].id;
  }, [session]);

  /**
   * Called when the current player successfully places a piece.
   * Normal placement: +1 point, log event, advance turn.
   * Hint placement (source === 'human_hint'): placement only, no score/turn (handled by handleHint).
   */
  const handlePlacePiece = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      const isHintPlacement = extraPayload?.source === 'human_hint';

      logEvent(playerId, 'place_piece', extraPayload);

      if (!isHintPlacement) {
        // Normal move: score + advance
        applyScoreDelta(playerId, 1);
        advanceTurn();
      }
      // For hints: placement only, no score / no turn change
    },
    [getCurrentPlayerId, applyScoreDelta, logEvent, advanceTurn]
  );

  /**
   * Called when the current player removes a piece.
   * No score change, but deleting a piece == your action for the turn.
   */
  const handleRemovePiece = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      logEvent(playerId, 'remove_piece', extraPayload);
      // No score change, but deleting a piece completes your turn
      advanceTurn();
    },
    [getCurrentPlayerId, logEvent, advanceTurn]
  );

  /**
   * Called when the current player uses a hint.
   * - Logs "hint" event
   * - Increments hints used stat
   * - ADVANCES turn
   *
   * The actual placement that follows (source === 'human_hint') uses `handlePlacePiece` 
   * but does NOT affect score or turn again. Together this models:
   * "Using a hint that places a piece costs you your turn and gives 0 points."
   */
  const handleHint = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      logEvent(playerId, 'hint', extraPayload);
      incrementHintsUsed(playerId);
      advanceTurn(); // use hint = you lose your turn
    },
    [getCurrentPlayerId, logEvent, incrementHintsUsed, advanceTurn]
  );

  /**
   * Called when the current player checks solvability.
   * - If extraPayload.isSolvable === true  → log, stat++, ADVANCE turn (player loses turn)
   * - If extraPayload.isSolvable === false → log, stat++, KEEP turn (player keeps turn)
   * Turn / scoring changes only, board changes are handled by caller.
   */
  const handleSolvabilityCheck = useCallback(
    (extraPayload?: Record<string, any>) => {
      const playerId = getCurrentPlayerId();
      if (!playerId) return;

      const isSolvable = extraPayload?.isSolvable;

      logEvent(playerId, 'check_solvability', {
        ...extraPayload,
        isSolvable,
      });

      incrementSolvabilityChecks(playerId);

      if (isSolvable === true) {
        // Correct call → you lose your turn
        advanceTurn();
      }
      // isSolvable === false or undefined → no turn change
    },
    [getCurrentPlayerId, logEvent, incrementSolvabilityChecks, advanceTurn]
  );

  return {
    handlePlacePiece,
    handleRemovePiece,
    handleHint,
    handleSolvabilityCheck,
  };
}
