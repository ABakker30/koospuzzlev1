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
  /** Gate to prevent scheduling new moves while animation is in progress */
  computerAnimatingRef?: React.MutableRefObject<boolean>;
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
  computerAnimatingRef,
}: UseComputerTurnArgs) {
  const timeoutRef = useRef<number | null>(null);
  
  // Extract stable values to avoid effect re-triggering on every render
  const isComplete = session?.isComplete ?? false;
  const currentPlayerIndex = session?.currentPlayerIndex ?? 0;
  const isComputerTurn = session?.players[currentPlayerIndex]?.isComputer ?? false;

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
    // Skip entirely in solo mode
    if (isSoloMode) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Cancel computer turns when game is complete
    if (!session || isComplete) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Only act when it's computer's turn
    if (!isComputerTurn) {
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
        console.log('⏰ [useComputerTurn] Clearing timeout - hint in progress');
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // 🛑 GATE: Don't schedule new move while animation is in progress
    if (computerAnimatingRef?.current) {
      if (timeoutRef.current !== null) {
        console.log('⏰ [useComputerTurn] Clearing timeout - animation in progress');
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

    console.log('⏰ [useComputerTurn] Scheduling computer move in', Math.round(delay), 'ms');
    timeoutRef.current = window.setTimeout(() => {
      // Double-check gates before executing (state may have changed during delay)
      if (computerAnimatingRef?.current || hintInProgressRef?.current) {
        console.log('⏰ [useComputerTurn] Move cancelled - gate active after delay');
        return;
      }
      timeoutRef.current = null;
      onComputerMove();
    }, delay) as unknown as number;
  }, [isComplete, isComputerTurn, currentPlayerIndex, onComputerMove, baseDelayMs, isSoloMode]);
}
