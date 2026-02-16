// src/game/pvp/usePvPGame.ts
// React hook for managing a PvP game session
// Handles real-time sync, timers, heartbeat, and simulated opponent

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PvPGameSession, PvPPlacedPiece } from './types';
import type { IJK } from '../../types/shape';
import {
  getPvPSession,
  submitMove,
  endPvPGame,
  resignPvPGame,
  sendHeartbeat,
  isOpponentDisconnected,
  updatePlayerStats,
  subscribeToSession,
  subscribeToMoves,
} from './pvpApi';
import { generateSimulatedMove } from './simulatedOpponent';
import { cellToKey } from '../puzzle/PuzzleTypes';

// ============================================================================
// TYPES
// ============================================================================

export interface PvPGameState {
  session: PvPGameSession | null;
  myPlayerNumber: 1 | 2;
  isMyTurn: boolean;
  isLoading: boolean;
  error: string | null;
  gameOver: boolean;
  opponentDisconnected: boolean;
  disconnectCountdown: number | null; // seconds remaining before auto-win
}

export interface UsePvPGameReturn {
  state: PvPGameState;
  placepiece: (pieceId: string, orientationId: string, cells: IJK[]) => Promise<void>;
  useHint: (pieceId: string, orientationId: string, cells: IJK[]) => Promise<void>;
  resign: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePvPGame(
  sessionId: string | null,
  userId: string | null,
  containerCells?: IJK[],
  containerCellKeys?: Set<string>
): UsePvPGameReturn {
  const [session, setSession] = useState<PvPGameSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);

  const simulatedMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine my player number
  const myPlayerNumber: 1 | 2 = session?.player1_id === userId ? 1 : 2;
  const isMyTurn = session?.status === 'active' && session?.current_turn === myPlayerNumber;
  const isSimulated = session?.is_simulated ?? false;

  // ---- Load session ----
  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const s = await getPvPSession(sessionId);
      if (s) {
        setSession(s);
        if (s.status === 'completed' || s.status === 'abandoned') {
          setGameOver(true);
        }
      } else {
        setError('Game session not found');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ---- Realtime subscriptions ----
  useEffect(() => {
    if (!sessionId || !session) return;

    const unsubSession = subscribeToSession(sessionId, (updated) => {
      setSession(updated);
      if (updated.status === 'completed' || updated.status === 'abandoned') {
        setGameOver(true);
      }
    });

    const unsubMoves = subscribeToMoves(sessionId, (_move) => {
      // Move received - session update will handle state sync
    });

    return () => {
      unsubSession();
      unsubMoves();
    };
  }, [sessionId, !!session]);

  // ---- Heartbeat (every 5 seconds) ----
  useEffect(() => {
    if (!sessionId || !session || session.status !== 'active') return;

    const sendBeat = () => sendHeartbeat(sessionId, myPlayerNumber);
    sendBeat(); // Send immediately

    heartbeatIntervalRef.current = setInterval(sendBeat, 5000);

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [sessionId, session?.status, myPlayerNumber]);

  // ---- Disconnect detection (check every 5 seconds, non-simulated only) ----
  useEffect(() => {
    if (!session || session.status !== 'active' || isSimulated) return;

    disconnectCheckRef.current = setInterval(() => {
      if (session && isOpponentDisconnected(session, myPlayerNumber)) {
        setOpponentDisconnected(true);
      } else {
        setOpponentDisconnected(false);
        setDisconnectCountdown(null);
      }
    }, 5000);

    return () => {
      if (disconnectCheckRef.current) clearInterval(disconnectCheckRef.current);
    };
  }, [session?.status, isSimulated, myPlayerNumber]);

  // ---- Disconnect countdown (30 seconds) ----
  useEffect(() => {
    if (!opponentDisconnected || !session || gameOver) {
      setDisconnectCountdown(null);
      return;
    }

    let remaining = 30;
    setDisconnectCountdown(remaining);

    const countdownInterval = setInterval(async () => {
      remaining--;
      setDisconnectCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        // Auto-win due to disconnect
        await endPvPGame(session.id, myPlayerNumber, 'disconnect', {
          player1: session.player1_score,
          player2: session.player2_score,
        });
        await updatePlayerStats(userId!, 'win', myPlayerNumber === 1 ? session.player1_score : session.player2_score);
      }
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [opponentDisconnected, gameOver]);

  // ---- Simulated opponent moves ----
  useEffect(() => {
    if (!session || !isSimulated || session.status !== 'active' || gameOver) return;
    if (!containerCells || !containerCellKeys) return;

    const opponentNumber = myPlayerNumber === 1 ? 2 : 1;
    const isOpponentTurn = session.current_turn === opponentNumber;

    if (!isOpponentTurn) return;

    // Generate and execute simulated move after delay
    const executeSimulatedMove = async () => {
      try {
        const result = await generateSimulatedMove(
          containerCellKeys,
          containerCells,
          session.board_state || [],
          session.inventory_state || {},
          session.placed_count || {}
        );

        // Wait for "thinking" delay
        simulatedMoveTimeoutRef.current = setTimeout(async () => {
          if (!session || session.status !== 'active') return;

          const turnStarted = session.turn_started_at
            ? new Date(session.turn_started_at).getTime()
            : Date.now();
          const timeSpent = Date.now() - turnStarted;
          const currentTimeRemaining = opponentNumber === 1
            ? session.player1_time_remaining_ms
            : session.player2_time_remaining_ms;
          const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

          if (result.type === 'place' && result.pieceId && result.cells) {
            // Build new board state
            const newPiece: PvPPlacedPiece = {
              uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              pieceId: result.pieceId,
              orientationId: result.orientationId!,
              cells: result.cells,
              placedAt: Date.now(),
              placedBy: opponentNumber,
              source: 'manual',
            };

            const newBoardState = [...(session.board_state || []), newPiece];

            await submitMove({
              sessionId: session.id,
              playerNumber: opponentNumber,
              moveType: 'place',
              pieceId: result.pieceId,
              orientationId: result.orientationId,
              cells: result.cells,
              scoreDelta: 1,
              boardStateAfter: newBoardState,
              timeSpentMs: timeSpent,
              playerTimeRemainingMs: newTimeRemaining,
            });

            // Check if puzzle is complete
            checkPuzzleCompletion(newBoardState);
          } else if (result.type === 'hint') {
            // For simulated hint, just pass the turn (simplified)
            // In a real implementation, we'd run the hint engine
            await submitMove({
              sessionId: session.id,
              playerNumber: opponentNumber,
              moveType: 'hint',
              scoreDelta: 0,
              boardStateAfter: session.board_state || [],
              timeSpentMs: timeSpent,
              playerTimeRemainingMs: newTimeRemaining,
            });
          } else {
            // Pass - no valid move found
            await submitMove({
              sessionId: session.id,
              playerNumber: opponentNumber,
              moveType: 'place',
              scoreDelta: 0,
              boardStateAfter: session.board_state || [],
              timeSpentMs: timeSpent,
              playerTimeRemainingMs: newTimeRemaining,
            });
          }
        }, result.thinkingDelayMs);
      } catch (err) {
        console.error('Simulated move error:', err);
      }
    };

    executeSimulatedMove();

    return () => {
      if (simulatedMoveTimeoutRef.current) {
        clearTimeout(simulatedMoveTimeoutRef.current);
      }
    };
  }, [session?.current_turn, session?.status, isSimulated, gameOver]);

  // ---- Check puzzle completion ----
  const checkPuzzleCompletion = useCallback((boardState: PvPPlacedPiece[]) => {
    if (!containerCellKeys || !session) return;

    const occupiedCells = new Set<string>();
    for (const piece of boardState) {
      for (const cell of piece.cells) {
        occupiedCells.add(cellToKey(cell));
      }
    }

    let allCovered = true;
    for (const key of containerCellKeys) {
      if (!occupiedCells.has(key)) {
        allCovered = false;
        break;
      }
    }

    if (allCovered) {
      // Puzzle complete - determine winner
      const winner = session.player1_score > session.player2_score ? 1
        : session.player2_score > session.player1_score ? 2
        : null; // Draw

      endPvPGame(session.id, winner as 1 | 2 | null, 'completed', {
        player1: session.player1_score,
        player2: session.player2_score,
      });
    }
  }, [containerCellKeys, session]);

  // ---- Player actions ----
  const placePiece = useCallback(async (
    pieceId: string,
    orientationId: string,
    cells: IJK[]
  ) => {
    if (!session || !isMyTurn) return;

    const turnStarted = session.turn_started_at
      ? new Date(session.turn_started_at).getTime()
      : Date.now();
    const timeSpent = Date.now() - turnStarted;
    const currentTimeRemaining = myPlayerNumber === 1
      ? session.player1_time_remaining_ms
      : session.player2_time_remaining_ms;
    const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

    const newPiece: PvPPlacedPiece = {
      uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pieceId,
      orientationId,
      cells,
      placedAt: Date.now(),
      placedBy: myPlayerNumber,
      source: 'manual',
    };

    const newBoardState = [...(session.board_state || []), newPiece];

    await submitMove({
      sessionId: session.id,
      playerNumber: myPlayerNumber,
      moveType: 'place',
      pieceId,
      orientationId,
      cells,
      scoreDelta: 1,
      boardStateAfter: newBoardState,
      timeSpentMs: timeSpent,
      playerTimeRemainingMs: newTimeRemaining,
    });

    checkPuzzleCompletion(newBoardState);
  }, [session, isMyTurn, myPlayerNumber, checkPuzzleCompletion]);

  const useHintAction = useCallback(async (
    pieceId: string,
    orientationId: string,
    cells: IJK[]
  ) => {
    if (!session || !isMyTurn) return;

    const turnStarted = session.turn_started_at
      ? new Date(session.turn_started_at).getTime()
      : Date.now();
    const timeSpent = Date.now() - turnStarted;
    const currentTimeRemaining = myPlayerNumber === 1
      ? session.player1_time_remaining_ms
      : session.player2_time_remaining_ms;
    const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

    const newPiece: PvPPlacedPiece = {
      uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pieceId,
      orientationId,
      cells,
      placedAt: Date.now(),
      placedBy: myPlayerNumber,
      source: 'hint',
    };

    const newBoardState = [...(session.board_state || []), newPiece];

    await submitMove({
      sessionId: session.id,
      playerNumber: myPlayerNumber,
      moveType: 'hint',
      pieceId,
      orientationId,
      cells,
      scoreDelta: 0, // Hints give 0 points
      boardStateAfter: newBoardState,
      timeSpentMs: timeSpent,
      playerTimeRemainingMs: newTimeRemaining,
    });

    checkPuzzleCompletion(newBoardState);
  }, [session, isMyTurn, myPlayerNumber, checkPuzzleCompletion]);

  const resign = useCallback(async () => {
    if (!session || gameOver) return;
    await resignPvPGame(session.id, myPlayerNumber);
    if (userId) {
      const myScore = myPlayerNumber === 1 ? session.player1_score : session.player2_score;
      await updatePlayerStats(userId, 'loss', myScore);
    }
  }, [session, myPlayerNumber, gameOver, userId]);

  // ---- Cleanup ----
  useEffect(() => {
    return () => {
      if (simulatedMoveTimeoutRef.current) clearTimeout(simulatedMoveTimeoutRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (disconnectCheckRef.current) clearInterval(disconnectCheckRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  return {
    state: {
      session,
      myPlayerNumber,
      isMyTurn,
      isLoading,
      error,
      gameOver,
      opponentDisconnected,
      disconnectCountdown,
    },
    placepiece: placePiece,
    useHint: useHintAction,
    resign,
    refresh: loadSession,
  };
}
