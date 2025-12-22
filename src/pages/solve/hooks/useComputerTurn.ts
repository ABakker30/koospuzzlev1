import { useEffect, useRef } from 'react';
import type { GameSessionState } from '../types/manualGame';

interface UseComputerTurnArgs {
  session: GameSessionState | null;
  onComputerMove: () => void;
  /** Base thinking time in ms (we can tweak later or make user-dependent) */
  baseDelayMs?: number;
  /** Gate to prevent computer move during hint animation */
  hintInProgressRef?: React.MutableRefObject<boolean>;
  /** Gate to prevent computer move while validation is in progress */
  pendingPlacementRef?: React.MutableRefObject<any>;
  /** Disable computer turns entirely in solo mode */
  isSoloMode?: boolean;
}

/**
 * Simple computer-turn loop:
 * whenever it's the computer's turn, wait a bit and then trigger onComputerMove.
 * For now, onComputerMove just simulates a dummy move (score +1, turn flip).
 */
export function useComputerTurn({
  session,
  onComputerMove,
  baseDelayMs = 1200,
  hintInProgressRef,
  isSoloMode = false,
}: UseComputerTurnArgs) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear any pending timeout when deps change or unmount
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    console.log('⏰ [useComputerTurn] Effect triggered', {
      hasSession: !!session,
      isComplete: session?.isComplete,
      currentPlayerIndex: session?.currentPlayerIndex,
      currentPlayer: session?.players[session?.currentPlayerIndex]?.name,
      isComputer: session?.players[session?.currentPlayerIndex]?.isComputer,
      hasPendingTimeout: timeoutRef.current !== null,
      isSoloMode,
    });

    // Skip entirely in solo mode
    if (isSoloMode) {
      if (timeoutRef.current !== null) {
        console.log('⏰ [useComputerTurn] Clearing timeout - solo mode');
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Cancel computer turns when game is complete
    if (!session || session.isComplete) {
      if (timeoutRef.current !== null) {
        console.log('⏰ [useComputerTurn] Clearing timeout - no session or game complete');
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const current = session.players[session.currentPlayerIndex];

    // Only act when it's computer's turn
    if (!current.isComputer) {
      // If it stopped being computer's turn, clear pending timer
      if (timeoutRef.current !== null) {
        console.log('⏰ [useComputerTurn] Clearing timeout - not computer turn');
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }
    
    // 🛑 GATE: Don't start computer turn during hint animation
    if (hintInProgressRef?.current) {
      if (timeoutRef.current !== null) {
        console.log('⏰ [useComputerTurn] Clearing timeout - hint in progress');
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // If there's already a timer, don't schedule another
    if (timeoutRef.current !== null) {
      console.log('⏰ [useComputerTurn] Timer already scheduled - skipping');
      return;
    }

    // Basic "thinking time" – later we can modulate this based on human speed
    const jitter = Math.random() * 0.4 + 0.8; // 0.8x–1.2x
    const delay = baseDelayMs * jitter;

    console.log('⏰ [useComputerTurn] Scheduling computer move in', Math.round(delay), 'ms');
    timeoutRef.current = window.setTimeout(() => {
      console.log('⏰ [useComputerTurn] Timer fired - calling onComputerMove');
      timeoutRef.current = null;
      onComputerMove();
    }, delay) as unknown as number;
  }, [session, onComputerMove, baseDelayMs, hintInProgressRef, isSoloMode]);
}
