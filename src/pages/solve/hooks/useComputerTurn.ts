import { useEffect, useRef } from 'react';
import type { GameSessionState } from '../types/manualGame';

interface UseComputerTurnArgs {
  session: GameSessionState | null;
  onComputerMove: () => void;
  /** Base thinking time in ms (we can tweak later or make user-dependent) */
  baseDelayMs?: number;
  /** Gate to prevent computer move during hint animation */
  hintInProgressRef?: React.MutableRefObject<boolean>;
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
    // Cancel computer turns when game is complete
    if (!session || session.isComplete) {
      if (timeoutRef.current !== null) {
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
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }
    
    // 🛑 GATE: Don't start computer turn during hint animation
    if (hintInProgressRef?.current) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // If there's already a timer, don't schedule another
    if (timeoutRef.current !== null) {
      return;
    }

    // Basic "thinking time" – later we can modulate this based on human speed
    const jitter = Math.random() * 0.4 + 0.8; // 0.8x–1.2x
    const delay = baseDelayMs * jitter;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onComputerMove();
    }, delay) as unknown as number;
  }, [session, onComputerMove, baseDelayMs]);
}
