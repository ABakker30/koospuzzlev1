// src/game/ui/GamePage.tsx
// Unified Game Page - Replaces Solve and VsComputer pages
// Phase 3A-2: Real puzzle loading and completion check

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { GameSetupModal, type PvPMatchType } from './GameSetupModal';
import { GameHUD } from './GameHUD';
import { GameEndModal } from './GameEndModal';
import { DevTools } from './DevTools';
import { GameBoard3D, type InteractionMode } from '../three/GameBoard3D';
import type { PlacementInfo } from '../engine/GameDependencies';
import { loadPuzzleById, loadDefaultPuzzle, PuzzleNotFoundError } from '../puzzle/PuzzleRepo';
import type { PuzzleData } from '../puzzle/PuzzleTypes';
import { cellToKey } from '../puzzle/PuzzleTypes';
import type { GameState, GameSetupInput, InventoryState, PlayerId } from '../contracts/GameState';
import { createInitialGameState, createVsPlayerPreset } from '../contracts/GameState';
import { dispatch, getActivePlayer, checkInventory } from '../engine/GameMachine';
import { createDefaultDependencies, type Anchor } from '../engine/GameDependencies';
import { saveGameSolution } from '../persistence/GameRepo';
import { captureCanvasScreenshot } from '../../services/thumbnailService';
import { supabase } from '../../lib/supabase';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import { PieceBrowserModal } from '../../pages/solve/components/PieceBrowserModal';
import { useAuth } from '../../context/AuthContext';
import {
  createPvPSession,
  getRandomOpponent,
  setupSimulatedOpponent,
  submitMove,
  subscribeToSession,
  sendHeartbeat,
  updatePlayerStats,
  joinPvPSession,
  endPvPGame,
  isOpponentDisconnected,
} from '../pvp/pvpApi';
import type { PvPGameSession, PvPPlacedPiece } from '../pvp/types';
import { PvPHUD } from '../pvp/PvPHUD';

// Default inventory: one of each piece A-Y
const DEFAULT_PIECES = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

function createDefaultInventory(setsNeeded: number = 1): InventoryState {
  const inventory: InventoryState = {};
  for (const piece of DEFAULT_PIECES) {
    inventory[piece] = setsNeeded; // setsNeeded copies of each piece
  }
  if (setsNeeded > 1) {
    console.log(`📦 Multi-set puzzle: ${setsNeeded} sets, ${DEFAULT_PIECES.length * setsNeeded} total pieces`);
  }
  return inventory;
}


export function GamePage() {
  const { puzzleId } = useParams<{ puzzleId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Get preset from URL query param
  const presetMode = searchParams.get('mode') as 'solo' | 'vs' | 'multiplayer' | 'pvp' | null;
  const joinCode = searchParams.get('join');
  
  // Puzzle loading state (Phase 3A-2)
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [puzzleLoading, setPuzzleLoading] = useState(true);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  gameStateRef.current = gameState;
  const [showSetupModal, setShowSetupModal] = useState(true);
  
  // Interaction mode for board - defaults to 'placing' for human turns
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('placing');
  
  // Drawing cells from GameBoard3D (for hint with 1 cell drawn)
  const [drawingCells, setDrawingCells] = useState<Anchor[]>([]);
  
  // Pending anchor for hint (Phase 3A-4) - set when user clicks a cell in pickingAnchor mode
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  
  // Placement rejection message
  const [placementError, setPlacementError] = useState<string | null>(null);

  // Environment settings and presets
  const [envSettings, setEnvSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string>('metallic-light');
  
  // Hide placed pieces toggle
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);
  
  // Selected piece for removal (Quick Play mode)
  const [selectedPieceUid, setSelectedPieceUid] = useState<string | null>(null);
  
  // Info modal
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'solo' | 'vs' | 'quickplay' | 'vsplayer'>('solo');
  const [timerInfo, setTimerInfo] = useState<{ timed: boolean; minutes: number }>({ timed: false, minutes: 5 });
  
  // Inventory modal
  const [showInventory, setShowInventory] = useState(false);
  
  // End modal dismissed (allows viewing the completed board after closing modal)
  const [endModalDismissed, setEndModalDismissed] = useState(false);

  // PvP state
  const [pvpSession, setPvpSession] = useState<PvPGameSession | null>(null);
  const [pvpWaiting, setPvpWaiting] = useState(false);
  const [pvpInviteCode, setPvpInviteCode] = useState<string | null>(null);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [pvpCoinFlipResult, setPvpCoinFlipResult] = useState<{ first: 1 | 2; myNumber: 1 | 2 } | null>(null);
  const [showCoinFlip, setShowCoinFlip] = useState(false);
  
  // Auth context for PvP
  const { user } = useAuth();

  // Calculate piece sets needed based on puzzle size (1 set = 25 pieces × 4 spheres = 100 cells)
  const setsNeeded = useMemo(() => {
    // PuzzleSpec uses targetCells (or sphereCount) not cells
    const cellCount = puzzle?.spec?.sphereCount ?? puzzle?.spec?.targetCells?.length ?? 0;
    if (cellCount === 0) return 1;
    return Math.ceil(cellCount / 100);
  }, [puzzle?.spec?.sphereCount, puzzle?.spec?.targetCells?.length]);

  // PvP Check state
  const [checkInProgress, setCheckInProgress] = useState(false);

  // UI-only effects state (Phase 2D-2)
  const [highlightPieceId, setHighlightPieceId] = useState<string | null>(null);
  const [scorePulse, setScorePulse] = useState<Record<PlayerId, number>>({});
  const lastNarrationIdRef = useRef<string | null>(null);

  // Game dependencies (solvability check, repair plan, hint generation)
  const depsRef = useRef(createDefaultDependencies());

  // Load puzzle on mount or when puzzleId changes (Phase 3A-2)
  useEffect(() => {
    let cancelled = false;
    
    async function loadPuzzle() {
      setPuzzleLoading(true);
      setPuzzleError(null);
      
      try {
        let loadedPuzzle: PuzzleData;
        
        if (puzzleId) {
          console.log('🧩 [GamePage] Loading puzzle by ID:', puzzleId);
          loadedPuzzle = await loadPuzzleById(puzzleId);
        } else {
          console.log('🧩 [GamePage] Loading default puzzle for mode:', presetMode);
          loadedPuzzle = await loadDefaultPuzzle(presetMode === 'solo' ? 'solo' : 'vs');
        }
        
        if (!cancelled) {
          setPuzzle(loadedPuzzle);
          console.log('✅ [GamePage] Puzzle loaded:', loadedPuzzle.spec.title);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof PuzzleNotFoundError) {
            setPuzzleError(`Puzzle not found: ${puzzleId}`);
          } else {
            setPuzzleError(err instanceof Error ? err.message : 'Failed to load puzzle');
          }
          console.error('❌ [GamePage] Failed to load puzzle:', err);
        }
      } finally {
        if (!cancelled) {
          setPuzzleLoading(false);
        }
      }
    }
    
    loadPuzzle();
    
    return () => { cancelled = true; };
  }, [puzzleId, presetMode]);
  
  // Reset game when puzzle changes
  useEffect(() => {
    if (puzzle) {
      setGameState(null);
      setShowSetupModal(true);
    }
  }, [puzzle?.spec.id]);

  // ---- Auto-join PvP session via ?join=CODE ----
  useEffect(() => {
    if (!joinCode || !puzzle || !user || pvpSession) return;

    const doJoin = async () => {
      console.log('🎮 [PvP] Auto-joining via invite code:', joinCode);
      setPvpWaiting(true);
      setPvpError(null);

      const session = await joinPvPSession(joinCode, user.id, user.username, null);
      if (!session) {
        setPvpError(t('pvp.errors.sessionNotFound'));
        setPvpWaiting(false);
        return;
      }

      setPvpSession(session);
      setPvpWaiting(false);

      // Determine my player number and show coin flip
      const myNum = (session.player1_id === user.id ? 1 : 2) as 1 | 2;
      setPvpCoinFlipResult({ first: session.first_player, myNumber: myNum });
      setShowCoinFlip(true);
      setTimeout(() => setShowCoinFlip(false), 3000);

      // Start the game with vs Player preset
      const setup = createVsPlayerPreset();
      const initialInventory = createDefaultInventory(setsNeeded);
      const state = createInitialGameState(setup, puzzle.spec, initialInventory);
      setGameState(state);
      setShowSetupModal(false);
    };

    doJoin().catch(err => {
      console.error('🎮 [PvP] Join failed:', err);
      setPvpError(err.message || 'Failed to join game');
      setPvpWaiting(false);
    });
  }, [joinCode, puzzle, user, pvpSession, setsNeeded]);

  // Handle setup confirmation
  const handleSetupConfirm = useCallback((setup: GameSetupInput) => {
    if (!puzzle) return;
    
    const initialInventory = createDefaultInventory(setsNeeded);
    const state = createInitialGameState(setup, puzzle.spec, initialInventory);
    setGameState(state);
    setShowSetupModal(false);
    console.log('🎮 Game started:', state);
  }, [puzzle, setsNeeded]);

  // Handle PvP start
  const handleStartPvP = useCallback(async (setup: GameSetupInput, matchType: PvPMatchType) => {
    console.log('🎮 [PvP] handleStartPvP called, matchType:', matchType, 'user:', user?.id, 'puzzle:', puzzle?.spec.id);
    if (!puzzle || !user) {
      const msg = !user ? 'You must be logged in to play vs Player' : 'Puzzle not loaded';
      setPvpError(msg);
      alert(msg); // Visible feedback while modal is open
      return;
    }

    setPvpError(null);
    const initialInventory = createDefaultInventory(setsNeeded);
    const timerSeconds = setup.players[0]?.timerSeconds || 300;

    try {
      const isSimulated = matchType === 'random';
      console.log('🎮 [PvP] Creating session, isSimulated:', isSimulated);
      
      // Create session
      const session = await createPvPSession(
        {
          puzzleId: puzzle.spec.id,
          puzzleName: puzzle.spec.title,
          timerSeconds,
          inventoryState: initialInventory,
          isSimulated,
        },
        user.id,
        user.username,
        null // avatar URL
      );

      setPvpSession(session);

      if (isSimulated) {
        // Random match: find a simulated opponent
        setPvpWaiting(true);
        
        // Simulate "searching for opponent" delay (2-4 seconds)
        setTimeout(async () => {
          try {
            const opponent = await getRandomOpponent(user.id);
            if (!opponent) {
              setPvpError('No opponents available. Try again later.');
              setPvpWaiting(false);
              return;
            }

            const updatedSession = await setupSimulatedOpponent(session.id, opponent);
            if (!updatedSession) {
              setPvpError('Failed to set up opponent.');
              setPvpWaiting(false);
              return;
            }

            setPvpSession(updatedSession);
            setPvpWaiting(false);

            // Show coin flip
            const myNumber: 1 | 2 = 1; // Creator is always player 1
            setPvpCoinFlipResult({ first: updatedSession.first_player, myNumber });
            setShowCoinFlip(true);

            // After coin flip animation, start the game
            setTimeout(() => {
              setShowCoinFlip(false);
              setShowSetupModal(false);
              
              // Create local game state for the game engine
              const state = createInitialGameState(setup, puzzle.spec, initialInventory);
              setGameState(state);
            }, 3000);
          } catch (err: any) {
            setPvpError(err.message || 'Failed to find opponent');
            setPvpWaiting(false);
          }
        }, 2000 + Math.random() * 2000);
      } else {
        // Invite link mode: show waiting room
        setPvpInviteCode(session.invite_code);
        setPvpWaiting(true);
      }
    } catch (err: any) {
      console.error('🎮 [PvP] handleStartPvP error:', err);
      const msg = err.message || 'Failed to create game session';
      setPvpError(msg);
      alert(msg); // Visible feedback
    }
  }, [puzzle, user, setsNeeded]);

  // Handle setup cancel
  const handleSetupCancel = useCallback(() => {
    navigate('/gallery');
  }, [navigate]);

  // ---- PvP Realtime subscription: sync session state from DB ----
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active') return;

    const unsub = subscribeToSession(pvpSession.id, (updated) => {
      setPvpSession(updated);
      if (updated.status === 'completed' || updated.status === 'abandoned') {
        console.log('🎮 [PvP] Game ended via realtime:', updated.end_reason);
        // Update player stats
        if (user) {
          const myNum = updated.player1_id === user.id ? 1 : 2;
          const myScore = myNum === 1 ? updated.player1_score : updated.player2_score;
          const result = updated.winner === myNum ? 'win'
            : updated.winner === null ? 'draw'
            : updated.status === 'abandoned' ? 'abandoned'
            : 'loss';
          updatePlayerStats(user.id, result, myScore).catch(err =>
            console.error('🎮 [PvP] Failed to update stats:', err)
          );
        }
      }
    });

    return unsub;
  }, [pvpSession?.id, pvpSession?.status]);

  // ---- PvP Heartbeat: send every 5s while game is active ----
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active' || !user) return;
    const myNum = pvpSession.player1_id === user.id ? 1 : 2;

    const beat = () => sendHeartbeat(pvpSession.id, myNum as 1 | 2);
    beat();
    const interval = setInterval(beat, 5000);
    return () => clearInterval(interval);
  }, [pvpSession?.id, pvpSession?.status, user?.id]);

  // ---- PvP Timer timeout: check every second if a player's clock hit zero ----
  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active' || !user) return;

    const interval = setInterval(() => {
      if (!pvpSession || pvpSession.status !== 'active') return;

      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const elapsed = Date.now() - turnStarted;
      const activePlayerTime = pvpSession.current_turn === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const remaining = activePlayerTime - elapsed;

      if (remaining <= 0) {
        clearInterval(interval);
        const timedOutPlayer = pvpSession.current_turn;
        const winner = (timedOutPlayer === 1 ? 2 : 1) as 1 | 2;
        console.log('🎮 [PvP] Timer expired for player', timedOutPlayer);

        // Use local engine scores (source of truth)
        const currentGS = gameStateRef.current;
        const p1Score = currentGS?.players[0]?.score ?? 0;
        const p2Score = currentGS?.players[1]?.score ?? 0;

        // Update local PvP session immediately so timers stop and overlay shows
        setPvpSession(prev => prev ? {
          ...prev,
          status: 'completed' as const,
          winner,
          end_reason: 'timeout' as const,
          player1_score: p1Score,
          player2_score: p2Score,
          ended_at: new Date().toISOString(),
        } : prev);

        // End local game engine
        dispatchEvent({ type: 'GAME_END', reason: 'timeout' });

        // Update backend (best-effort)
        endPvPGame(pvpSession.id, winner, 'timeout', {
          player1: p1Score,
          player2: p2Score,
        }).catch(err => console.error('🎮 [PvP] Failed to end game on timeout:', err));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pvpSession?.id, pvpSession?.status, pvpSession?.current_turn, pvpSession?.turn_started_at]);

  // ---- PvP Disconnect detection: check opponent heartbeat every 5s ----
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!pvpSession || pvpSession.status !== 'active' || pvpSession.is_simulated || !user) {
      setOpponentDisconnected(false);
      setDisconnectCountdown(null);
      return;
    }

    const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
    const interval = setInterval(() => {
      const disconnected = isOpponentDisconnected(pvpSession, myNum);
      setOpponentDisconnected(disconnected);
    }, 5000);

    return () => clearInterval(interval);
  }, [pvpSession?.id, pvpSession?.status, pvpSession?.is_simulated, user?.id]);

  // Disconnect countdown: 30s → auto-win
  useEffect(() => {
    if (!opponentDisconnected || !pvpSession || pvpSession.status !== 'active') {
      setDisconnectCountdown(null);
      return;
    }

    let remaining = 30;
    setDisconnectCountdown(remaining);

    const countdownInterval = setInterval(() => {
      remaining--;
      setDisconnectCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        const myNum = (pvpSession.player1_id === user?.id ? 1 : 2) as 1 | 2;
        endPvPGame(pvpSession.id, myNum, 'disconnect', {
          player1: pvpSession.player1_score,
          player2: pvpSession.player2_score,
        }).catch(err => console.error('🎮 [PvP] Failed to end game on disconnect:', err));
      }
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [opponentDisconnected, pvpSession?.status]);

  // ---- PvP Simulated opponent: trigger AI move when it's opponent's turn ----
  const simulatedMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pvpSession || !pvpSession.is_simulated || pvpSession.status !== 'active') return;
    if (!gameState || !puzzle || !user) return;

    const myNum = pvpSession.player1_id === user.id ? 1 : 2;
    const opponentNum = myNum === 1 ? 2 : 1;
    const isOpponentTurn = pvpSession.current_turn === opponentNum;

    if (!isOpponentTurn) return;

    // Dynamically import and run simulated move
    const runSimulatedMove = async () => {
      const { generateSimulatedMove } = await import('../pvp/simulatedOpponent');
      const containerCellKeys = puzzle.spec.targetCellKeys
        ? new Set(puzzle.spec.targetCellKeys)
        : new Set(puzzle.spec.targetCells?.map((c: any) => `${c.i},${c.j},${c.k}`) ?? []);
      const containerCells = puzzle.spec.targetCells ?? [];

      // Use local engine's board state (source of truth) instead of pvpSession
      const currentGS = gameStateRef.current;
      const localBoardPieces: PvPPlacedPiece[] = currentGS
        ? Array.from(currentGS.boardState.values()).map(p => ({
            uid: p.uid,
            pieceId: p.pieceId,
            orientationId: p.orientationId,
            cells: p.cells,
            placedAt: p.placedAt,
            placedBy: 1 as 1 | 2,
            source: 'manual' as const,
          }))
        : pvpSession.board_state || [];
      const localPlacedCount = currentGS?.placedCountByPieceId ?? pvpSession.placed_count ?? {};

      const result = await generateSimulatedMove(
        containerCellKeys,
        containerCells,
        localBoardPieces,
        pvpSession.inventory_state || {},
        localPlacedCount
      );

      simulatedMoveTimeoutRef.current = setTimeout(async () => {
        if (!pvpSession || pvpSession.status !== 'active') return;

        const turnStarted = pvpSession.turn_started_at
          ? new Date(pvpSession.turn_started_at).getTime()
          : Date.now();
        const timeSpent = Date.now() - turnStarted;
        const oppTimeRemaining = opponentNum === 1
          ? pvpSession.player1_time_remaining_ms
          : pvpSession.player2_time_remaining_ms;
        const newTimeRemaining = Math.max(0, oppTimeRemaining - timeSpent);

        if (result.type === 'place' && result.pieceId && result.cells) {
          const newPiece: PvPPlacedPiece = {
            uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            pieceId: result.pieceId,
            orientationId: result.orientationId!,
            cells: result.cells,
            placedAt: Date.now(),
            placedBy: opponentNum as 1 | 2,
            source: 'manual',
          };
          const newBoardState = [...(pvpSession.board_state || []), newPiece];

          await submitMove({
            sessionId: pvpSession.id,
            playerNumber: opponentNum as 1 | 2,
            moveType: 'place',
            pieceId: result.pieceId,
            orientationId: result.orientationId,
            cells: result.cells,
            scoreDelta: 1,
            boardStateAfter: newBoardState,
            timeSpentMs: timeSpent,
            playerTimeRemainingMs: newTimeRemaining,
          });

          // Optimistically switch turn back to player
          const oppScoreUpdate = opponentNum === 1
            ? { player1_score: pvpSession.player1_score + 1 }
            : { player2_score: pvpSession.player2_score + 1 };
          const oppTimeUpdate = opponentNum === 1
            ? { player1_time_remaining_ms: newTimeRemaining }
            : { player2_time_remaining_ms: newTimeRemaining };

          setPvpSession(prev => prev ? {
            ...prev,
            current_turn: myNum as 1 | 2,
            ...oppScoreUpdate,
            ...oppTimeUpdate,
            board_state: newBoardState,
            turn_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : prev);

          // Also dispatch to local game engine so the board updates
          // Force-sync local engine to opponent's turn before dispatching
          const currentGameState = gameStateRef.current;
          if (currentGameState && currentGameState.players[1]) {
            dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
            const opponentPlayerId = currentGameState.players[1].id;
            console.log('🎮 [PvP] Simulated opponent dispatching as player[1]:', currentGameState.players[1].name);
            dispatchEvent({
              type: 'TURN_PLACE_REQUESTED',
              playerId: opponentPlayerId,
              payload: {
                pieceId: result.pieceId,
                orientationId: result.orientationId!,
                cells: result.cells,
              },
            });
          }
        } else if (result.type === 'check') {
          // Opponent uses Check — run solvability check + full repair loop
          console.log('🔍 [PvP] Simulated opponent using Check...');
          dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
          const currentGameState = gameStateRef.current;
          if (currentGameState) {
            const solvResult = await depsRef.current.solvabilityCheck(currentGameState);
            console.log('🔍 [PvP] Simulated opponent Check result:', solvResult.status);

            const oppTimeUpdate = opponentNum === 1
              ? { player1_time_remaining_ms: newTimeRemaining }
              : { player2_time_remaining_ms: newTimeRemaining };

            if (solvResult.status === 'unsolvable') {
              // Correct! Full repair loop until solvable, opponent keeps turn
              console.log('🔍 [PvP] Simulated opponent Check correct — repairing until solvable...');
              const removedCount = await runRepairLoop(currentGameState);
              console.log(`🔍 [PvP] Simulated opponent repair complete — removed ${removedCount} piece(s)`);

              const freshState = gameStateRef.current;
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: opponentNum as 1 | 2,
                moveType: 'check',
                scoreDelta: 0,
                boardStateAfter: freshState ? boardStateToPvPArray(freshState.boardState) : [],
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
              });

              // Keep turn on opponent — don't switch
              setPvpSession(prev => prev ? {
                ...prev,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
              } : prev);
            } else {
              // Wrong — opponent loses turn
              console.log('🔍 [PvP] Simulated opponent Check wrong — losing turn');
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: opponentNum as 1 | 2,
                moveType: 'check',
                scoreDelta: 0,
                boardStateAfter: pvpSession.board_state || [],
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
              });

              const opponentPlayerId = currentGameState.players[1]?.id;
              if (opponentPlayerId) dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: opponentPlayerId });
              setPvpSession(prev => prev ? {
                ...prev,
                current_turn: myNum as 1 | 2,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } : prev);
            }
          }
        } else if (result.type === 'hint') {
          // Opponent uses hint — trigger actual hint placement via game engine
          console.log('💡 [PvP] Simulated opponent using hint...');
          dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 1 });
          const currentGameState = gameStateRef.current;
          if (currentGameState) {
            // Pick a random empty cell as anchor for the hint
            const occupiedKeys = new Set<string>();
            for (const p of currentGameState.boardState.values()) {
              for (const c of p.cells) occupiedKeys.add(cellToKey(c));
            }
            const emptyAnchors = Array.from(currentGameState.puzzleSpec.targetCellKeys)
              .filter(k => !occupiedKeys.has(k));

            if (emptyAnchors.length > 0) {
              const anchorKey = emptyAnchors[Math.floor(Math.random() * emptyAnchors.length)];
              const [ai, aj, ak] = anchorKey.split(',').map(Number);
              const anchor = { i: ai, j: aj, k: ak };

              const opponentPlayerId = currentGameState.players[1]?.id;
              if (opponentPlayerId) {
                dispatchEvent({
                  type: 'TURN_HINT_REQUESTED',
                  playerId: opponentPlayerId,
                  anchor,
                });
              }

              // The hint orchestration effect will handle the rest:
              // - solvability check + repair if needed
              // - hint placement
              // - PvP turn switch (via the hint result handler)
            } else {
              // No empty cells — just pass turn
              const oppTimeUpdate = opponentNum === 1
                ? { player1_time_remaining_ms: newTimeRemaining }
                : { player2_time_remaining_ms: newTimeRemaining };
              setPvpSession(prev => prev ? {
                ...prev,
                current_turn: myNum as 1 | 2,
                ...oppTimeUpdate,
                turn_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } : prev);
            }
          }
        } else {
          // Pass — just advance turn
          const oppTimeUpdate = opponentNum === 1
            ? { player1_time_remaining_ms: newTimeRemaining }
            : { player2_time_remaining_ms: newTimeRemaining };
          setPvpSession(prev => prev ? {
            ...prev,
            current_turn: myNum as 1 | 2,
            ...oppTimeUpdate,
            turn_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : prev);
        }
      }, result.thinkingDelayMs);
    };

    runSimulatedMove().catch(err => console.error('🎮 [PvP] Simulated move error:', err));

    return () => {
      if (simulatedMoveTimeoutRef.current) clearTimeout(simulatedMoveTimeoutRef.current);
    };
  }, [pvpSession?.current_turn, pvpSession?.status, pvpSession?.is_simulated, gameState?.activePlayerIndex]);

  // Helper: convert local boardState Map to PvP board state array
  const boardStateToPvPArray = useCallback((boardState: Map<string, any>): PvPPlacedPiece[] => {
    return Array.from(boardState.values()).map(p => ({
      uid: p.uid,
      pieceId: p.pieceId,
      orientationId: p.orientationId,
      cells: p.cells,
      placedAt: p.placedAt,
      placedBy: (pvpSession?.player1_id === user?.id ? 1 : 2) as 1 | 2,
      source: p.source === 'ai' ? 'hint' as const : 'manual' as const,
    }));
  }, [pvpSession?.player1_id, user?.id]);

  // Dispatch helper that updates state
  const dispatchEvent = useCallback((event: Parameters<typeof dispatch>[1]) => {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = dispatch(prev, event);
      // Skip noisy timer tick logs
      if (event.type !== 'TIMER_TICK') {
        console.log('🎮 Dispatch:', event.type);
      }
      return newState;
    });
  }, []);

  // Action handlers
  
  // Enter anchor-picking mode for hint, or use drawn cell if exactly 1 cell drawn
  const handleEnterHintMode = useCallback(() => {
    if (!gameState) return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;
    
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'human') return;
    
    // If exactly 1 cell is drawn, use it as anchor and trigger hint immediately
    if (drawingCells.length === 1) {
      const anchor = drawingCells[0];
      dispatchEvent({ 
        type: 'TURN_HINT_REQUESTED', 
        playerId: activePlayer.id,
        anchor,
      });
      return;
    }
    
    // Otherwise, enter anchor-picking mode
    setInteractionMode('pickingAnchor');
    setPendingAnchor(null);
    setSelectedPieceUid(null); // Clear piece selection when entering hint mode
  }, [gameState, drawingCells, dispatchEvent]);
  
  // Handle anchor selected from 3D board (Phase 3A-4)
  const handleAnchorSelected = useCallback((anchor: Anchor) => {
    if (interactionMode !== 'pickingAnchor') return;
    setPendingAnchor(anchor);
    setSelectedPieceUid(null); // Clear piece selection when anchor is picked
    console.log('🧭 [GamePage] Anchor selected:', anchor);
  }, [interactionMode]);
  
  // Confirm hint with selected anchor (Phase 3A-4)
  const handleConfirmHint = useCallback(() => {
    if (!gameState || !pendingAnchor) return;
    if (interactionMode !== 'pickingAnchor') return;
    
    const activePlayer = getActivePlayer(gameState);
    console.log('🧭 [GamePage] Confirming hint at anchor:', pendingAnchor);
    
    dispatchEvent({ 
      type: 'TURN_HINT_REQUESTED', 
      playerId: activePlayer.id,
      anchor: pendingAnchor,
    });
    
    setInteractionMode('none');
    setPendingAnchor(null);
  }, [gameState, pendingAnchor, interactionMode, dispatchEvent]);
  
  // Cancel anchor picking mode
  const handleCancelHintMode = useCallback(() => {
    setInteractionMode('none');
    setPendingAnchor(null);
  }, []);
  
  // Handle placement commit from GameBoard3D (Phase 3A-3)
  const handlePlacementCommitted = useCallback((placement: PlacementInfo) => {
    if (!gameState) return;
    
    // Guards: only allow placement when it's the player's turn and not busy
    const activePlayer = getActivePlayer(gameState);
    
    // PvP mode: use PvP turn state instead of local engine's active player
    if (pvpSession && pvpSession.status === 'active' && user) {
      const myNum = pvpSession.player1_id === user.id ? 1 : 2;
      if (pvpSession.current_turn !== myNum) {
        console.log('🎮 [GamePage] Ignoring placement - not my PvP turn');
        return;
      }
    } else if (activePlayer.type !== 'human') {
      console.log('🎮 [GamePage] Ignoring placement - not human turn');
      return;
    }
    
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') {
      console.log('🎮 [GamePage] Ignoring placement - busy/ended');
      return;
    }
    
    console.log('🎮 [GamePage] Placement committed:', placement.pieceId);
    
    // PvP: force-sync local engine to player[0] (human) before dispatching
    if (pvpSession) {
      dispatchEvent({ type: 'FORCE_ACTIVE_PLAYER', playerIndex: 0 });
    }

    // Check inventory BEFORE dispatching — if piece is unavailable, don't lose turn
    const inventoryCheck = checkInventory(gameState, placement.pieceId);
    if (!inventoryCheck.ok) {
      console.log('🎮 [GamePage] Inventory check failed:', inventoryCheck.reason);
      setPlacementError(inventoryCheck.reason || 'Piece not available');
      setTimeout(() => setPlacementError(null), 3000);
      return; // Don't dispatch, don't submit to PvP — let player try another piece
    }

    // Dispatch TURN_PLACE_REQUESTED to local game engine
    // In PvP, always dispatch as the current active player in the local engine
    dispatchEvent({
      type: 'TURN_PLACE_REQUESTED',
      playerId: activePlayer.id,
      payload: placement,
    });
    
    // PvP: also submit move to backend
    if (pvpSession && pvpSession.status === 'active' && user) {
      const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const timeSpent = Date.now() - turnStarted;
      const currentTimeRemaining = myNum === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

      // Build updated board state after this placement
      const newBoardState = boardStateToPvPArray(gameState.boardState);
      // Add the new piece
      newBoardState.push({
        uid: `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pieceId: placement.pieceId,
        orientationId: placement.orientationId,
        cells: placement.cells,
        placedAt: Date.now(),
        placedBy: myNum,
        source: 'manual',
      });

      // Optimistically update local PvP session state (don't wait for realtime)
      const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;
      const scoreUpdate = myNum === 1
        ? { player1_score: pvpSession.player1_score + 1 }
        : { player2_score: pvpSession.player2_score + 1 };
      const timeUpdate = myNum === 1
        ? { player1_time_remaining_ms: newTimeRemaining }
        : { player2_time_remaining_ms: newTimeRemaining };

      setPvpSession(prev => prev ? {
        ...prev,
        current_turn: nextTurn,
        ...scoreUpdate,
        ...timeUpdate,
        board_state: newBoardState,
        turn_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } : prev);

      submitMove({
        sessionId: pvpSession.id,
        playerNumber: myNum,
        moveType: 'place',
        pieceId: placement.pieceId,
        orientationId: placement.orientationId,
        cells: placement.cells,
        scoreDelta: 1,
        boardStateAfter: newBoardState,
        timeSpentMs: timeSpent,
        playerTimeRemainingMs: newTimeRemaining,
      }).catch(err => console.error('🎮 [PvP] Failed to submit move:', err));
    }
    
    // Exit placing mode
    setInteractionMode('none');
    setPlacementError(null);
  }, [gameState, dispatchEvent, pvpSession, user, boardStateToPvPArray]);
  
  // Handle placement rejection from GameBoard3D
  const handlePlacementRejected = useCallback((reason: string) => {
    setPlacementError(reason);
    // Clear error after 3 seconds
    setTimeout(() => setPlacementError(null), 3000);
  }, []);
  
  // Toggle placing mode
  const handleTogglePlacing = useCallback(() => {
    if (!gameState) return;
    
    // Guards
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'human') return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;
    
    setInteractionMode(prev => prev === 'placing' ? 'none' : 'placing');
    setPlacementError(null);
  }, [gameState]);
  
  // Cancel interaction (from board background click)
  const handleCancelInteraction = useCallback(() => {
    setInteractionMode('none');
    setPlacementError(null);
    setPendingAnchor(null);
    setSelectedPieceUid(null); // Clear piece selection on cancel
  }, []);

  const handlePassClick = useCallback(() => {
    if (!gameState) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
  }, [gameState, dispatchEvent]);

  // Handle drawing cells change - also clear piece selection
  const handleDrawingCellsChange = useCallback((cells: Anchor[]) => {
    setDrawingCells(cells);
    if (cells.length > 0) {
      setSelectedPieceUid(null); // Clear piece selection when user clicks a cell
    }
  }, []);

  // Handle piece removal (Quick Play mode)
  const handleRemovePiece = useCallback(() => {
    if (!gameState || !selectedPieceUid) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_REMOVE_REQUESTED', playerId: activePlayer.id, pieceUid: selectedPieceUid });
    setSelectedPieceUid(null); // Clear selection after removal
  }, [gameState, selectedPieceUid, dispatchEvent]);

  // PvP Check: run solvability check, if unsolvable remove pieces until solvable.
  // Accounts for remaining piece inventory. Checker keeps turn if correct, loses turn if wrong.
  const runRepairLoop = useCallback(async (currentState: GameState): Promise<number> => {
    // Remove pieces newest-first, re-check solvability after each, stop when solvable.
    // Uses REPAIR_REMOVE_PIECE which bypasses allowRemoval guard and scores -1 to the placer.
    // Returns number of pieces removed.
    let state = currentState;
    let removed = 0;
    const MAX_REMOVALS = 15; // Safety limit

    while (removed < MAX_REMOVALS && state.boardState.size > 0) {
      // Get newest piece
      const pieces = Array.from(state.boardState.entries())
        .sort((a, b) => b[1].placedAt - a[1].placedAt);
      const [uid, piece] = pieces[0];

      // Force-remove via REPAIR_REMOVE_PIECE (bypasses allowRemoval)
      console.log(`🔧 [Repair] Removing piece ${piece.pieceId} (${removed + 1})...`);
      dispatchEvent({
        type: 'REPAIR_REMOVE_PIECE',
        pieceUid: uid,
      });
      removed++;

      // Wait a tick for state to update, then get fresh state from ref
      await new Promise(r => setTimeout(r, 150));
      const freshState = gameStateRef.current;
      if (!freshState || freshState.boardState.size === 0) break;
      state = freshState;

      // Check solvability with updated state (accounts for remaining inventory)
      const result = await depsRef.current.solvabilityCheck(state);
      console.log(`🔧 [Repair] After removing ${removed} piece(s): ${result.status}`);
      if (result.status !== 'unsolvable') {
        break; // Solvable again
      }
    }
    return removed;
  }, [dispatchEvent]);

  // PvP Check: run solvability check on current board
  // If solvable → lose turn (false accusation). If unsolvable → repair loop + keep turn.
  const handleCheck = useCallback(async () => {
    if (!gameState || !pvpSession || !user) return;
    if (gameState.phase !== 'in_turn') return;
    if (checkInProgress) return;
    if (gameState.boardState.size === 0) return; // Nothing to check

    const myNum = pvpSession.player1_id === user.id ? 1 : 2;
    if (pvpSession.current_turn !== myNum) return; // Not my turn

    setCheckInProgress(true);
    console.log('🔍 [PvP Check] Running solvability check...');

    try {
      const solvResult = await depsRef.current.solvabilityCheck(gameState);
      console.log('🔍 [PvP Check] Result:', solvResult.status);

      const turnStarted = pvpSession.turn_started_at
        ? new Date(pvpSession.turn_started_at).getTime()
        : Date.now();
      const timeSpent = Date.now() - turnStarted;
      const currentTimeRemaining = myNum === 1
        ? pvpSession.player1_time_remaining_ms
        : pvpSession.player2_time_remaining_ms;
      const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);

      if (solvResult.status === 'unsolvable') {
        // Correct! Puzzle is broken → repair loop until solvable, keep turn
        console.log('🔍 [PvP Check] Puzzle IS unsolvable — repairing until solvable...');
        const removedCount = await runRepairLoop(gameState);
        console.log(`🔍 [PvP Check] Repair complete — removed ${removedCount} piece(s)`);

        // Submit check move to backend
        const freshBoardState = gameStateRef.current;
        submitMove({
          sessionId: pvpSession.id,
          playerNumber: myNum as 1 | 2,
          moveType: 'check',
          scoreDelta: 0,
          boardStateAfter: freshBoardState ? boardStateToPvPArray(freshBoardState.boardState) : [],
          timeSpentMs: timeSpent,
          playerTimeRemainingMs: newTimeRemaining,
        }).catch(err => console.error('🔍 [PvP Check] Failed to submit:', err));

        // Update time remaining optimistically (but keep turn)
        const timeUpdate = myNum === 1
          ? { player1_time_remaining_ms: newTimeRemaining }
          : { player2_time_remaining_ms: newTimeRemaining };
        setPvpSession(prev => prev ? {
          ...prev,
          ...timeUpdate,
          turn_started_at: new Date().toISOString(),
        } : prev);
      } else {
        // Wrong! Puzzle is solvable → lose turn as penalty
        console.log('🔍 [PvP Check] Puzzle IS solvable — losing turn as penalty');
        const activePlayer = getActivePlayer(gameState);
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });

        // Advance PvP turn
        const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;

        submitMove({
          sessionId: pvpSession.id,
          playerNumber: myNum as 1 | 2,
          moveType: 'check',
          scoreDelta: 0,
          boardStateAfter: pvpSession.board_state || [],
          timeSpentMs: timeSpent,
          playerTimeRemainingMs: newTimeRemaining,
        }).catch(err => console.error('🔍 [PvP Check] Failed to submit:', err));

        const timeUpdate = myNum === 1
          ? { player1_time_remaining_ms: newTimeRemaining }
          : { player2_time_remaining_ms: newTimeRemaining };
        setPvpSession(prev => prev ? {
          ...prev,
          current_turn: nextTurn,
          ...timeUpdate,
          turn_started_at: new Date().toISOString(),
        } : prev);
      }
    } catch (err) {
      console.error('🔍 [PvP Check] Error:', err);
    } finally {
      setCheckInProgress(false);
    }
  }, [gameState, pvpSession, user, checkInProgress, dispatchEvent, runRepairLoop, boardStateToPvPArray]);

  // Hint orchestration effect - handle async solvability check + hint generation
  // This runs when phase === 'resolving' and pendingHint is set
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'resolving') return;
    if (!gameState.pendingHint) return;
    if (gameState.subphase === 'repairing') return; // Wait for repair to complete
    
    const { playerId, anchor } = gameState.pendingHint;
    
    // Run async hint flow
    const runHintFlow = async () => {
      console.log('💡 [GamePage] Running hint flow for anchor:', anchor);
      
      try {
        // Step 1: Solvability check
        const solvResult = await depsRef.current.solvabilityCheck(gameState);
        console.log('💡 [GamePage] Solvability result:', solvResult);
        
        // Step 2: If unsolvable, start repair (will re-enter this effect after repair)
        if (solvResult.status === 'unsolvable') {
          console.log('� [REPAIR TRIGGERED] Puzzle declared unsolvable!', {
            definiteFailure: solvResult.definiteFailure,
            solutionCount: solvResult.solutionCount,
            reason: solvResult.reason,
            computeTimeMs: solvResult.computeTimeMs,
            boardStatePieces: gameState.boardState.size,
            emptyCount: gameState.puzzleSpec.targetCellKeys.size - 
              Array.from(gameState.boardState.values()).reduce((sum, p) => sum + p.cells.length, 0),
          });
          console.log('🔧 [REPAIR] Placed pieces:', Array.from(gameState.boardState.values()).map(p => p.pieceId));
          dispatchEvent({ 
            type: 'START_REPAIR', 
            reason: 'hint', 
            triggeredBy: playerId 
          });
          return; // Repair will run, then this effect re-triggers
        }
        
        // Step 3: Generate hint (puzzle is solvable or unknown)
        console.log('💡 [GamePage] Generating hint...');
        const hintSuggestion = await depsRef.current.generateHint(gameState, anchor);
        
        if (hintSuggestion) {
          dispatchEvent({
            type: 'TURN_HINT_RESULT',
            playerId,
            result: { status: 'suggestion', suggestion: hintSuggestion },
          });

          // PvP: switch turn after hint placement (hint = 0 points, counts as turn)
          if (pvpSession && pvpSession.status === 'active' && user) {
            const myNum = (pvpSession.player1_id === user.id ? 1 : 2) as 1 | 2;
            const nextTurn = (myNum === 1 ? 2 : 1) as 1 | 2;
            const turnStarted = pvpSession.turn_started_at
              ? new Date(pvpSession.turn_started_at).getTime()
              : Date.now();
            const timeSpent = Date.now() - turnStarted;
            const currentTimeRemaining = myNum === 1
              ? pvpSession.player1_time_remaining_ms
              : pvpSession.player2_time_remaining_ms;
            const newTimeRemaining = Math.max(0, currentTimeRemaining - timeSpent);
            const timeUpdate = myNum === 1
              ? { player1_time_remaining_ms: newTimeRemaining }
              : { player2_time_remaining_ms: newTimeRemaining };

            setPvpSession(prev => prev ? {
              ...prev,
              current_turn: nextTurn,
              ...timeUpdate,
              turn_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } : prev);

            // Submit hint move to backend (best-effort)
            try {
              const { submitMove } = await import('../pvp/pvpApi');
              await submitMove({
                sessionId: pvpSession.id,
                playerNumber: myNum,
                moveType: 'hint',
                scoreDelta: 0,
                boardStateAfter: boardStateToPvPArray(gameState.boardState),
                timeSpentMs: timeSpent,
                playerTimeRemainingMs: newTimeRemaining,
              });
            } catch (err) {
              console.warn('💡 [Hint] Backend move submit failed:', err);
            }
          }
        } else {
          dispatchEvent({
            type: 'TURN_HINT_RESULT',
            playerId,
            result: { status: 'no_suggestion' },
          });
        }
      } catch (err) {
        console.error('❌ [GamePage] Hint flow failed:', err);
        dispatchEvent({
          type: 'TURN_HINT_RESULT',
          playerId,
          result: { status: 'error', message: String(err) },
        });
      }
    };
    
    runHintFlow();
  }, [gameState?.phase, gameState?.pendingHint, gameState?.subphase, dispatchEvent]);

  // Repair playback effect - auto-step through repair steps (Phase 3A-5: glow before remove)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.subphase !== 'repairing') return;
    if (!gameState.repair) return;
    
    const { repair } = gameState;
    const currentStep = repair.steps[repair.index];
    
    console.log('🔧 [REPAIR STEP]', {
      index: repair.index,
      totalSteps: repair.steps.length,
      currentStep: currentStep,
      reason: repair.reason,
    });
    
    // Phase 3A-5: For REMOVE_PIECE steps, highlight the piece BEFORE removal
    if (currentStep?.type === 'REMOVE_PIECE' && currentStep.pieceInstanceId) {
      // Set highlight immediately
      setHighlightPieceId(currentStep.pieceInstanceId);
      
      // Wait for glow animation (400ms), then dispatch removal
      const timeout = setTimeout(() => {
        dispatchEvent({ type: 'REPAIR_STEP' });
      }, 500); // 500ms to see glow before removal
      
      return () => clearTimeout(timeout);
    }
    
    // For other steps (ADD_PIECE), proceed normally
    const timeout = setTimeout(() => {
      dispatchEvent({ type: 'REPAIR_STEP' });
    }, 600); // 600ms between steps for visibility
    
    return () => clearTimeout(timeout);
  }, [gameState?.subphase, gameState?.repair?.index, dispatchEvent]);

  // AI turn simulation - finds and places a piece
  useEffect(() => {
    if (!gameState || gameState.phase !== 'in_turn') return;
    if (gameState.subphase === 'repairing') return; // Don't act during repair
    
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'ai') return;
    
    console.log('🤖 [GamePage] AI turn started, thinking...');
    
    let cancelled = false;
    
    const runAiTurn = async () => {
      // Simulate thinking delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelled) return;
      
      // Find an empty cell to use as anchor
      const occupiedKeys = new Set<string>();
      for (const piece of gameState.boardState.values()) {
        for (const cell of piece.cells) {
          occupiedKeys.add(`${cell.i},${cell.j},${cell.k}`);
        }
      }
      
      // Find first empty cell in puzzle
      let anchor: { i: number; j: number; k: number } | null = null;
      for (const key of gameState.puzzleSpec.targetCellKeys) {
        if (!occupiedKeys.has(key)) {
          const [i, j, k] = key.split(',').map(Number);
          anchor = { i, j, k };
          break;
        }
      }
      
      if (!anchor) {
        console.log('🤖 [GamePage] AI: No empty cells, passing');
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
        return;
      }
      
      // Use generateHint to find a valid placement at this anchor
      console.log('🤖 [GamePage] AI: Finding piece for anchor', anchor);
      const hint = await depsRef.current.generateHint(gameState, anchor);
      
      if (cancelled) return;
      
      if (hint) {
        console.log('🤖 [GamePage] AI: Placing piece', hint.pieceId);
        dispatchEvent({
          type: 'TURN_PLACE_REQUESTED',
          playerId: activePlayer.id,
          payload: {
            pieceId: hint.placement.pieceId,
            orientationId: hint.placement.orientationId,
            cells: hint.placement.cells,
          },
        });
      } else {
        console.log('🤖 [GamePage] AI: No valid placement found, passing');
        dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
      }
    };
    
    runAiTurn();
    
    return () => { cancelled = true; };
  }, [
    gameState?.phase,
    gameState?.subphase,
    gameState?.activePlayerIndex,
    dispatchEvent,
  ]);

  // Puzzle completion check effect (Phase 2C)
  // Check after every turn advance if puzzle is complete
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'ended') return; // Already ended
    if (gameState.phase !== 'in_turn') return; // Only check during normal play
    if (gameState.subphase === 'repairing') return; // Don't check during repair
    
    // Check if puzzle is complete
    const isComplete = depsRef.current.isPuzzleComplete(gameState);
    if (isComplete) {
      console.log('🏁 [GamePage] Puzzle complete! Ending game...');
      dispatchEvent({ type: 'GAME_END', reason: 'completed' });
    }
  }, [gameState?.phase, gameState?.subphase, gameState?.boardState.size, dispatchEvent]);

  // Auto-save solution when game ends with 'completed' reason
  const hasSavedSolutionRef = useRef(false);
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'ended') {
      hasSavedSolutionRef.current = false; // Reset for new games
      return;
    }
    if (gameState.endState?.reason !== 'completed') return; // Only save completed puzzles
    if (hasSavedSolutionRef.current) return; // Already saved
    
    hasSavedSolutionRef.current = true;
    console.log('💾 [GamePage] Game completed, saving solution...');

    // PvP: end the game session when puzzle is completed
    if (pvpSession && pvpSession.status === 'active' && user) {
      // Use local engine scores (authoritative after fix)
      const p1Score = gameState.players[0]?.score ?? 0;
      const p2Score = gameState.players[1]?.score ?? 0;
      const winner = p1Score > p2Score ? 1 : p2Score > p1Score ? 2 : null;

      // Update local PvP session immediately so timers stop and overlay shows
      setPvpSession(prev => prev ? {
        ...prev,
        status: 'completed' as const,
        winner: winner as 1 | 2 | null,
        end_reason: 'completed' as const,
        player1_score: p1Score,
        player2_score: p2Score,
        ended_at: new Date().toISOString(),
      } : prev);

      // Update backend (best-effort)
      endPvPGame(pvpSession.id, winner as 1 | 2 | null, 'completed', {
        player1: p1Score,
        player2: p2Score,
      }).catch(err => console.error('🎮 [PvP] Failed to end game:', err));
    }
    
    // Async function to capture thumbnail and save solution
    const saveSolutionWithThumbnail = async () => {
      let thumbnailUrl: string | null = null;
      
      // Wait for piece animations to complete before capturing screenshot
      const pieceCount = gameState.boardState.size;
      const animationDelay = (pieceCount * 200) + 500;
      console.log(`⏱️ [GamePage] Waiting ${animationDelay}ms for ${pieceCount} pieces to settle...`);
      await new Promise(resolve => setTimeout(resolve, animationDelay));
      
      // Capture screenshot from canvas
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (canvas) {
          console.log('📸 [GamePage] Capturing solution screenshot...');
          const screenshotBlob = await captureCanvasScreenshot(canvas);
          console.log('✅ [GamePage] Screenshot captured:', (screenshotBlob.size / 1024).toFixed(2), 'KB');
          
          // Get user session for upload path (use 'anon' for anonymous users)
          const { data: { session } } = await supabase.auth.getSession();
          const userIdPart = session?.user?.id || 'anon';
          
          // Upload thumbnail to solution-thumbnails bucket
          const fileName = `${gameState.puzzleRef.id}-${userIdPart}-${Date.now()}.png`;
          const filePath = `thumbnails/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('solution-thumbnails')
            .upload(filePath, screenshotBlob, {
              contentType: 'image/png',
              upsert: false
            });
          
          if (uploadError) {
            console.error('❌ [GamePage] Failed to upload thumbnail:', uploadError);
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('solution-thumbnails')
              .getPublicUrl(filePath);
            thumbnailUrl = publicUrlData.publicUrl;
            console.log('✅ [GamePage] Thumbnail uploaded:', thumbnailUrl);
          }
        }
      } catch (err) {
        console.error('⚠️ [GamePage] Screenshot capture failed:', err);
        // Continue saving solution even if screenshot fails
      }
      
      // Save solution with thumbnail URL
      const result = await saveGameSolution(gameState, { thumbnailUrl });
      if (result.success) {
        console.log('✅ [GamePage] Solution saved:', result.solutionId);
      } else {
        console.error('❌ [GamePage] Failed to save solution:', result.error);
      }
    };
    
    saveSolutionWithThumbnail();
  }, [gameState?.phase, gameState?.endState?.reason]);

  // UI effects: watch narration for piece highlight and score pulse (Phase 2D-2)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.narration.length === 0) return;
    
    // Get the latest narration entry
    const latestEntry = gameState.narration[0];
    if (!latestEntry) return;
    
    // Skip if we've already processed this entry
    if (latestEntry.id === lastNarrationIdRef.current) return;
    lastNarrationIdRef.current = latestEntry.id;
    
    // Process meta for effects
    const meta = latestEntry.meta;
    if (!meta) return;
    
    // Piece highlight effect
    if (meta.pieceInstanceId) {
      setHighlightPieceId(meta.pieceInstanceId);
      // Clear after 400ms
      setTimeout(() => {
        setHighlightPieceId(prev => prev === meta.pieceInstanceId ? null : prev);
      }, 400);
    }
    
    // Score pulse effect
    if (meta.playerId && meta.scoreDelta !== undefined) {
      setScorePulse(prev => ({
        ...prev,
        [meta.playerId!]: (prev[meta.playerId!] ?? 0) + 1,
      }));
    }
  }, [gameState?.narration]);

  // Timer tick effect (Phase 2D-3)
  // Clock ticks only during active player's turn, pauses during resolving/repairing
  // Timer only starts after first piece is placed
  useEffect(() => {
    if (!gameState) return;
    if (gameState.settings.timerMode !== 'timed') return;
    if (gameState.phase === 'ended') return;
    if (gameState.phase === 'resolving' || gameState.subphase === 'repairing') return;
    // Don't start timer until first piece is placed
    if (gameState.boardState.size === 0) return;
    // In PvP mode, PvP chess clocks handle timing — skip local engine timer
    if (pvpSession) return;
    
    const activePlayer = getActivePlayer(gameState);
    
    const interval = setInterval(() => {
      dispatchEvent({ 
        type: 'TIMER_TICK', 
        playerId: activePlayer.id, 
        deltaSeconds: 1 
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [
    gameState?.settings.timerMode,
    gameState?.phase,
    gameState?.subphase,
    gameState?.activePlayerIndex,
    gameState?.boardState.size,
    dispatchEvent,
  ]);

  // Manage interaction mode based on game state
  // PvP: also lock board when it's opponent's turn
  const isPvPOpponentTurn = pvpSession?.status === 'active' && user
    ? pvpSession.current_turn !== (pvpSession.player1_id === user.id ? 1 : 2)
    : false;

  useEffect(() => {
    if (!gameState) return;
    
    const activePlayer = getActivePlayer(gameState);
    const isBusyOrEnded = gameState.phase === 'ended' || 
                          gameState.phase === 'resolving' || 
                          gameState.subphase === 'repairing';
    
    if (isBusyOrEnded || isPvPOpponentTurn) {
      setInteractionMode('none');
      setPendingAnchor(null);
    } else if (activePlayer.type === 'human' && gameState.phase === 'in_turn' && interactionMode === 'none') {
      // Auto-enable placing mode for human turns
      setInteractionMode('placing');
    } else if (activePlayer.type === 'ai') {
      setInteractionMode('none');
    }
  }, [gameState?.phase, gameState?.subphase, gameState?.activePlayerIndex, interactionMode, isPvPOpponentTurn]);

  // Handle new game from end modal (must be before early return to maintain hook order)
  const handleNewGame = useCallback(() => {
    setGameState(null);
    setShowSetupModal(true);
    setInteractionMode('none');
    setPendingAnchor(null);
    setEndModalDismissed(false);
    // Reset PvP state
    setPvpSession(null);
    setPvpWaiting(false);
    setPvpInviteCode(null);
    setPvpError(null);
    setPvpCoinFlipResult(null);
    setShowCoinFlip(false);
  }, []);

  // Show loading state while puzzle loads
  if (puzzleLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingPanel}>
          <div style={styles.spinner}>⏳</div>
          <span>Loading puzzle...</span>
        </div>
      </div>
    );
  }
  
  // Show error state if puzzle failed to load
  if (puzzleError || !puzzle) {
    return (
      <div style={styles.container}>
        <div style={styles.errorPanel}>
          <div style={styles.errorIcon}>❌</div>
          <div style={styles.errorTitle}>Failed to load puzzle</div>
          <div style={styles.errorMessage}>{puzzleError ?? 'Unknown error'}</div>
          <button style={styles.errorButton} onClick={() => navigate('/gallery')}>
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }
  
  // Show setup modal if no game state
  if (!gameState) {
    return (
      <div style={styles.container}>
        <GameSetupModal
          isOpen={showSetupModal && !pvpWaiting && !showCoinFlip}
          onConfirm={handleSetupConfirm}
          onCancel={handleSetupCancel}
          onStartPvP={handleStartPvP}
          onShowHowToPlay={(mode, timer) => {
            setSelectedMode(mode);
            setTimerInfo(timer);
            setShowInfoModal(true);
          }}
          preset={presetMode ?? undefined}
        />
        
        {/* PvP Waiting Room */}
        {pvpWaiting && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10200,
          }}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}>
              {pvpInviteCode ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔗</div>
                  <h2 style={{ color: '#fff', margin: '0 0 12px 0' }}>{t('pvp.invite.title')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 20px 0', fontSize: '0.9rem' }}>
                    {t('pvp.invite.shareCode')}
                  </p>
                  <div style={{
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '2rem',
                    fontWeight: 900,
                    letterSpacing: '0.3em',
                    color: '#60a5fa',
                    fontFamily: 'monospace',
                    marginBottom: '16px',
                  }}>
                    {pvpInviteCode}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/game/${puzzle?.spec.id}?join=${pvpInviteCode}`
                      );
                    }}
                    style={{
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 24px',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      marginBottom: '12px',
                    }}
                  >
                    {t('pvp.invite.copyLink')}
                  </button>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '8px 0 16px 0' }}>
                    {t('pvp.invite.waitingForOpponent')}
                  </p>
                  <div style={{ animation: 'pulse 2s ease-in-out infinite', fontSize: '1.5rem' }}>⏳</div>
                  <button
                    onClick={() => { setPvpWaiting(false); setPvpInviteCode(null); }}
                    style={{
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      padding: '8px 20px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      marginTop: '16px',
                    }}
                  >
                    {t('pvp.invite.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '16px', animation: 'pulse 1.5s ease-in-out infinite' }}>🔍</div>
                  <h2 style={{ color: '#fff', margin: '0 0 12px 0' }}>{t('pvp.matchmaking.findingOpponent')}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0', fontSize: '0.9rem' }}>
                    {t('pvp.matchmaking.searchingChallenger')}
                  </p>
                  {pvpError && (
                    <p style={{ color: '#f87171', margin: '12px 0 0 0', fontSize: '0.85rem' }}>
                      {pvpError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Coin Flip Animation */}
        {showCoinFlip && pvpCoinFlipResult && pvpSession && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10300,
          }}>
            <div style={{
              textAlign: 'center',
              animation: 'fadeIn 0.5s ease-out',
            }}>
              <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🪙</div>
              <h2 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '1.5rem' }}>
                vs {pvpSession.player2_name}
              </h2>
              <div style={{
                fontSize: '1.2rem',
                color: pvpCoinFlipResult.first === pvpCoinFlipResult.myNumber ? '#4ade80' : '#f87171',
                fontWeight: 700,
                marginTop: '16px',
              }}>
                {pvpCoinFlipResult.first === pvpCoinFlipResult.myNumber
                  ? `🟢 ${t('pvp.coinFlip.youGoFirst')}`
                  : `🔴 ${t('pvp.coinFlip.opponentGoesFirst', { name: pvpSession.player2_name })}`}
              </div>
            </div>
          </div>
        )}
        
        {/* How to Play Info Modal */}
        {showInfoModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10100,
          }} onClick={() => setShowInfoModal(false)}>
            <div style={{
              background: 'linear-gradient(145deg, #2d3748, #1a202c)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }} onClick={e => e.stopPropagation()}>
              <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '1.5rem' }}>
                🎮 {selectedMode === 'quickplay' 
                  ? 'Quick Play' 
                  : selectedMode === 'vsplayer'
                    ? 'vs Player'
                    : selectedMode === 'vs' 
                      ? 'vs Computer' 
                      : 'Solo Mode'}
              </h2>
              
              <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🧩 Puzzle Info
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>{puzzle?.spec?.sphereCount ?? 0} cells</strong> • Using <strong>{setsNeeded} set{setsNeeded > 1 ? 's' : ''}</strong> ({setsNeeded * 25} pieces available)
                  {timerInfo.timed && <><br/>⏱️ <strong>Chess Clock:</strong> {timerInfo.minutes} minutes per player</>}
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🎯 Goal
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  {selectedMode === 'vsplayer'
                    ? 'Take turns placing Koos pieces on a shared board. Each piece covers 4 cells. Highest score wins!'
                    : <>Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells.
                      {selectedMode !== 'quickplay' && ' Highest score wins!'}</>}
                </p>

                {selectedMode === 'vsplayer' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      🔄 Turns
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      Players alternate turns. Your clock only ticks during your turn.<br/>
                      A coin flip decides who goes first. The board is locked during your opponent's turn.
                    </p>
                  </>
                )}

                {selectedMode !== 'quickplay' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      📊 Scoring
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      <strong>+1 point</strong> for each piece you place manually<br/>
                      <strong>0 points</strong> for pieces placed via hint (counts as your turn)<br/>
                      <strong>-1 point</strong> for each piece removed during repair (to whoever placed it)
                    </p>
                  </>
                )}

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  ✏️ Placing Pieces
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y).
                  {selectedMode !== 'quickplay' && <><br/><strong>Shared inventory</strong> — each piece can only be placed once by either player.</>}
                </p>

                {selectedMode === 'quickplay' && (
                  <>
                    <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                      🗑️ Remove Pieces
                    </h3>
                    <p style={{ margin: '0 0 10px 0' }}>
                      Tap a placed piece to select it, then tap Remove to take it off the board. Experiment freely!
                    </p>
                  </>
                )}

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  💡 Hint {selectedMode !== 'quickplay' && '& Repair'}
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click one cell, then tap Hint to place a valid piece.
                  {selectedMode !== 'quickplay' && <><br/>If the puzzle is unsolvable, the hint will first remove pieces until it's solvable again (-1 point to whoever placed each removed piece), then place the piece.</>}
                  {selectedMode !== 'quickplay' ? ' Hint pieces give 0 points.' : ' Use hints freely!'}
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🎛️ Bottom Action Buttons
                </h3>
                <div style={{ margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>📦 <strong>Inventory</strong> — Browse available pieces</span>
                  <span>💡 <strong>Hint</strong> — Select a cell, then tap to auto-place a valid piece</span>
                  <span>🙈 <strong>Hide/Show</strong> — Toggle placed pieces visibility</span>
                  {(selectedMode === 'vs' || selectedMode === 'vsplayer') && (
                    <span>🔍 <strong>Check</strong> — Verify if the puzzle is still solvable; if not, repairs it</span>
                  )}
                  {selectedMode === 'vsplayer' && (
                    <span>🏳️ <strong>Resign</strong> — Forfeit the game (opponent wins)</span>
                  )}
                  {selectedMode === 'quickplay' && (
                    <span>🗑️ <strong>Remove</strong> — Remove a selected piece from the board</span>
                  )}
                </div>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🔲 Top-Right Buttons
                </h3>
                <div style={{ margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span>ℹ️ <strong>Info</strong> — This help screen</span>
                  <span>⚙️ <strong>Settings</strong> — Visual settings (colors, rendering)</span>
                  <span>✕ <strong>Close</strong> — Exit the game</span>
                </div>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🏁 Game End
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  {selectedMode === 'vsplayer'
                    ? 'Game ends when: puzzle completed, a player resigns, a player\'s clock runs out, or both players stall. Highest score wins!'
                    : selectedMode === 'vs' 
                      ? 'Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!'
                      : timerInfo.timed
                        ? 'Complete the puzzle by filling all cells, or when time runs out!'
                        : 'Complete the puzzle by filling all cells!'}
                </p>
              </div>

              <button
                onClick={() => setShowInfoModal(false)}
                style={{
                  marginTop: '20px',
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Got it!
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // UI-derived status model (Phase 2D-3)
  const isEnded = gameState.phase === 'ended';
  const isBusy = gameState.phase === 'resolving' || gameState.subphase === 'repairing';
  const activePlayer = getActivePlayer(gameState);
  const isAITurn = activePlayer.type === 'ai' && !isBusy && !isEnded;
  
  // Banner text precedence
  // In single player mode, don't show "Your turn" - it's always your turn
  const isSinglePlayer = gameState.players.length === 1;
  const bannerText = isEnded
    ? 'Game Over'
    : gameState.subphase === 'repairing'
    ? 'Repairing…'
    : gameState.phase === 'resolving'
    ? 'Resolving…'
    : activePlayer.type === 'ai'
    ? `${activePlayer.name} is thinking…`
    : isSinglePlayer
    ? '' // No turn indicator needed in single player
    : activePlayer.name === 'You' ? 'Your turn' : `${activePlayer.name}'s turn`;

  return (
    <div style={styles.container}>
      {/* Game HUD */}
      <GameHUD
        gameState={gameState}
        onHintClick={handleEnterHintMode}
        onPassClick={handlePassClick}
        onInventoryClick={() => setShowInventory(true)}
        hidePlacedPieces={hidePlacedPieces}
        onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
        scorePulse={scorePulse}
        selectedPieceUid={selectedPieceUid}
        onRemoveClick={handleRemovePiece}
        setsNeeded={setsNeeded}
        cellCount={puzzle?.spec?.sphereCount}
        isPvP={!!pvpSession}
        onCheckClick={pvpSession ? handleCheck : undefined}
        checkInProgress={checkInProgress}
        onResignClick={pvpSession ? async () => {
          const myNum = pvpSession.player1_id === user?.id ? 1 : 2;
          const winner = myNum === 1 ? 2 : 1;

          // Update local PvP session immediately
          setPvpSession(prev => prev ? {
            ...prev,
            status: 'completed' as const,
            winner: winner as 1 | 2,
            end_reason: 'resign' as const,
            ended_at: new Date().toISOString(),
          } : prev);

          // End local game engine — pass resigning player (me = index 0) so opponent wins
          const myPlayerId = gameState?.players[0]?.id;
          dispatchEvent({ type: 'GAME_END', reason: 'resign', resigningPlayerId: myPlayerId });

          // Try to update backend (may fail for simulated games)
          try {
            const { resignPvPGame } = await import('../pvp/pvpApi');
            await resignPvPGame(pvpSession.id, myNum as 1 | 2);
          } catch (err) {
            console.warn('🏳️ [Resign] Backend update failed (simulated game?):', err);
          }
        } : undefined}
      />

      {/* PvP HUD overlay */}
      {pvpSession && (pvpSession.status === 'active' || pvpSession.status === 'completed') && (
        <PvPHUD
          session={pvpSession}
          myPlayerNumber={pvpSession.player1_id === user?.id ? 1 : 2}
          isMyTurn={pvpSession.current_turn === (pvpSession.player1_id === user?.id ? 1 : 2)}
          gameOver={pvpSession.status !== 'active'}
          opponentDisconnected={opponentDisconnected}
          disconnectCountdown={disconnectCountdown}
          engineScores={gameState ? {
            myScore: gameState.players[0]?.score ?? 0,
            opponentScore: gameState.players[1]?.score ?? 0,
          } : undefined}
          onResign={async () => {
            const myNum = pvpSession.player1_id === user?.id ? 1 : 2;
            const winner = myNum === 1 ? 2 : 1;
            setPvpSession(prev => prev ? {
              ...prev,
              status: 'completed' as const,
              winner: winner as 1 | 2,
              end_reason: 'resign' as const,
              ended_at: new Date().toISOString(),
            } : prev);
            const myPlayerId = gameState?.players[0]?.id;
            dispatchEvent({ type: 'GAME_END', reason: 'resign', resigningPlayerId: myPlayerId });
            try {
              const { resignPvPGame } = await import('../pvp/pvpApi');
              await resignPvPGame(pvpSession.id, myNum as 1 | 2);
            } catch (err) {
              console.warn('🏳️ [Resign] Backend update failed:', err);
            }
          }}
        />
      )}

      {/* End-of-game modal (Phase 2C) */}
      {gameState.phase === 'ended' && gameState.endState && !endModalDismissed && (
        <GameEndModal
          endState={gameState.endState}
          players={gameState.players}
          onNewGame={handleNewGame}
          onClose={() => setEndModalDismissed(true)}
          scoringEnabled={gameState.settings.ruleToggles.scoringEnabled}
          playerNameOverrides={pvpSession ? (() => {
            const myName = pvpSession.player1_id === user?.id
              ? pvpSession.player1_name
              : pvpSession.player2_name;
            const oppName = pvpSession.player1_id === user?.id
              ? pvpSession.player2_name
              : pvpSession.player1_name;
            const overrides: Record<string, string> = {};
            // player index 0 = "You" in local engine = me
            if (gameState.players[0]) overrides[gameState.players[0].id] = myName;
            // player index 1 = "Opponent" in local engine = opponent
            if (gameState.players[1]) overrides[gameState.players[1].id] = oppName;
            return overrides;
          })() : undefined}
        />
      )}

      {/* Top Bar - Info, Settings, Close buttons */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        display: 'flex',
        gap: '8px',
        zIndex: 200,
      }}>
        {/* Info Button */}
        <button
          onClick={() => setShowInfoModal(true)}
          title="How to Play"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '22px',
            padding: '8px 12px',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
          }}
        >
          ℹ️
        </button>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(true)}
          title="Environment Settings"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '22px',
            padding: '8px 12px',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
          }}
        >
          ⚙️
        </button>

        {/* Close Button */}
        <button
          onClick={() => navigate('/gallery')}
          title="Back to Gallery"
          style={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '22px',
            padding: '8px 12px',
            minWidth: '40px',
            minHeight: '40px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      {/* Three.js 3D Board (Phase 3A-3/3A-4) */}
      <GameBoard3D
        puzzle={puzzle}
        boardState={gameState.boardState}
        interactionMode={interactionMode}
        isHumanTurn={pvpSession ? true : activePlayer.type === 'human'}
        highlightPieceId={highlightPieceId}
        selectedAnchor={pendingAnchor}
        selectedPieceUid={selectedPieceUid}
        envSettings={envSettings}
        hidePlacedPieces={hidePlacedPieces}
        allowPieceSelection={gameState.settings.ruleToggles.allowRemoval}
        onPlacementCommitted={handlePlacementCommitted}
        onPlacementRejected={handlePlacementRejected}
        onAnchorPicked={handleAnchorSelected}
        onCancelInteraction={handleCancelInteraction}
        onDrawingCellsChange={handleDrawingCellsChange}
        onPieceSelected={setSelectedPieceUid}
      />
      
      
      {/* Anchor Picking Mode Panel (Phase 3A-4) */}
      {interactionMode === 'pickingAnchor' && (
        <div style={styles.anchorPickPanel}>
          <div style={styles.anchorPickTitle}>
            {pendingAnchor 
              ? `Anchor: (${pendingAnchor.i}, ${pendingAnchor.j}, ${pendingAnchor.k})`
              : 'Click a cell to select anchor'
            }
          </div>
          <div style={styles.anchorPickButtons}>
            <button 
              style={styles.anchorPickConfirm}
              onClick={handleConfirmHint}
              disabled={!pendingAnchor}
            >
              ✓ Use Hint
            </button>
            <button 
              style={styles.anchorPickCancel}
              onClick={handleCancelHintMode}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Placement Error Toast */}
      {placementError && (
        <div style={styles.placeError}>{placementError}</div>
      )}

      {/* Debug Panel - HIDDEN */}
      {false && <div style={styles.debugPanel}>
        <div style={styles.debugTitle}>Puzzle: {puzzle.spec.title}</div>
        <div style={styles.debugSubtitle}>ID: {puzzle.spec.id.substring(0, 20)}...</div>
        <div style={styles.debugSubtitle}>Cells: {puzzle.spec.sphereCount}</div>
        <pre style={styles.stateDebug}>
          {JSON.stringify({
            phase: gameState.phase,
            subphase: gameState.subphase,
            piecesPlaced: gameState.boardState.size,
            cellsCovered: Array.from(gameState.boardState.values()).reduce((sum, p) => sum + p.cells.length, 0),
            targetCells: gameState.puzzleSpec.sphereCount,
            stallCounter: `${gameState.roundNoPlacementCount}/${gameState.players.length}`,
            repairReason: gameState.repair?.reason,
            endReason: gameState.endState?.reason,
          }, null, 2)}
        </pre>

        {/* Placed Pieces List (Phase 2D-2) */}
        {gameState.boardState.size > 0 && (
          <div style={styles.pieceListContainer}>
            <div style={styles.pieceListTitle}>Placed Pieces:</div>
            <div style={styles.pieceList}>
              {Array.from(gameState.boardState.entries()).map(([uid, piece]) => {
                const owner = gameState.players.find(p => p.id === piece.placedBy);
                const isHighlighted = uid === highlightPieceId;
                return (
                  <div 
                    key={uid} 
                    style={{
                      ...styles.pieceItem,
                      ...(isHighlighted ? styles.pieceItemHighlight : {}),
                    }}
                  >
                    <span style={styles.pieceId}>{piece.pieceId}</span>
                    <span style={styles.pieceOwner}>by {owner?.name ?? 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

          {/* Repair Progress Indicator */}
          {gameState.subphase === 'repairing' && gameState.repair && (
            <div style={styles.repairProgress}>
              <div style={styles.repairProgressBar}>
                <div 
                  style={{
                    ...styles.repairProgressFill,
                    width: `${(gameState.repair.index / gameState.repair.steps.length) * 100}%`,
                  }}
                />
              </div>
              <span style={styles.repairProgressText}>
                Repair: {gameState.repair.index}/{gameState.repair.steps.length}
              </span>
            </div>
          )}
          
          {/* Test Controls (Repair testing only - placement via draw UI) */}
          <div style={styles.testControls}>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(234, 179, 8, 0.3)',
                borderColor: 'rgba(234, 179, 8, 0.5)',
              }}
              disabled={gameState.subphase === 'repairing' || gameState.boardState.size < 3 || interactionMode === 'pickingAnchor'}
              onClick={() => {
                // Force hint with repair: place 3+ pieces first
                const activePlayer = getActivePlayer(gameState);
                dispatchEvent({ 
                  type: 'TURN_HINT_REQUESTED', 
                  playerId: activePlayer.id,
                  anchor: { i: 10, j: 0, k: 0 },
                });
              }}
            >
              Test: Force Repair (Hint)
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(34, 197, 94, 0.3)',
                borderColor: 'rgba(34, 197, 94, 0.5)',
              }}
              disabled={gameState.phase === 'ended'}
              onClick={() => {
                dispatchEvent({ type: 'GAME_END', reason: 'completed' });
              }}
            >
              Test: Complete Game
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(239, 68, 68, 0.3)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
              }}
              disabled={gameState.phase === 'ended' || gameState.subphase === 'repairing'}
              onClick={() => {
                // Force stall by setting roundNoPlacementCount high enough
                // Then trigger TURN_ADVANCE to detect the stall
                setGameState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    roundNoPlacementCount: prev.players.length - 1,
                    turnPlacementFlag: false,
                  };
                });
                // After state update, next pass will trigger stall detection
                const activePlayer = getActivePlayer(gameState);
                dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
              }}
            >
              Test: Force Stall
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(168, 85, 247, 0.3)',
                borderColor: 'rgba(168, 85, 247, 0.5)',
              }}
              disabled={gameState.phase === 'ended' || gameState.subphase === 'repairing' || gameState.boardState.size === 0}
              onClick={() => {
                dispatchEvent({ type: 'START_REPAIR', reason: 'endgame', triggeredBy: 'system' });
              }}
            >
              Test: Endgame Repair
            </button>
          </div>
      </div>}

      {/* DEV TOOLS - HIDDEN */}
      {false && <DevTools
        gameState={gameState}
        onStateChange={(updater) => setGameState(prev => prev ? updater(prev) : prev)}
        onDispatch={dispatchEvent}
      />}


      {/* Environment Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showSettings}
        currentPreset={currentPreset}
        onClose={() => setShowSettings(false)}
        onSelectPreset={(settings, presetKey) => {
          setEnvSettings(settings);
          setCurrentPreset(presetKey);
        }}
      />

      {/* Piece Browser / Inventory Modal */}
      <PieceBrowserModal
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
        pieces={DEFAULT_PIECES}
        activePiece={DEFAULT_PIECES[0]}
        settings={envSettings}
        mode="oneOfEach"
        setsNeeded={setsNeeded}
        placedCountByPieceId={
          gameState 
            ? Object.fromEntries(
                Array.from(gameState.boardState.values())
                  .reduce((acc, p) => {
                    acc.set(p.pieceId, (acc.get(p.pieceId) ?? 0) + 1);
                    return acc;
                  }, new Map<string, number>())
              )
            : {}
        }
        customInventory={gameState?.inventory ?? {}}
        onSelectPiece={() => {}}
      />

      {/* How to Play Info Modal */}
      {showInfoModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10100,
        }} onClick={() => setShowInfoModal(false)}>
          <div style={{
            background: 'linear-gradient(145deg, #2d3748, #1a202c)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '1.5rem' }}>
              🎮 {gameState.settings.ruleToggles.allowRemoval 
                ? 'Quick Play' 
                : gameState.players.length > 1 
                  ? 'vs Computer' 
                  : 'Solo Mode'}
            </h2>
            
            <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🧩 Puzzle Info
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>{puzzle?.spec?.sphereCount ?? 0} cells</strong> • Using <strong>{setsNeeded} set{setsNeeded > 1 ? 's' : ''}</strong> ({setsNeeded * 25} pieces available)
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🎯 Goal
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells.
                {gameState.settings.ruleToggles.scoringEnabled && ' Highest score wins!'}
              </p>

              {gameState.settings.ruleToggles.scoringEnabled && (
                <>
                  <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                    📊 Scoring
                  </h3>
                  <p style={{ margin: '0 0 10px 0' }}>
                    <strong>+1 point</strong> for each piece you place manually<br/>
                    <strong>0 points</strong> for pieces placed via hint<br/>
                    <strong>-1 point</strong> for each piece removed during repair
                  </p>
                </>
              )}

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                ✏️ Placing Pieces
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y).
                {!gameState.settings.ruleToggles.allowRemoval && <><br/><strong>Only unique pieces allowed</strong> - each piece can only be placed once.</>}
              </p>

              {gameState.settings.ruleToggles.allowRemoval && (
                <>
                  <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                    �️ Remove Pieces
                  </h3>
                  <p style={{ margin: '0 0 10px 0' }}>
                    Tap a placed piece to select it, then tap Remove to take it off the board. Experiment freely!
                  </p>
                </>
              )}

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                💡 Hint
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click one cell, then tap Hint for a piece suggestion.
                {gameState.settings.ruleToggles.scoringEnabled ? ' Hints give 0 points.' : ' Use hints freely!'}
              </p>

              {gameState.settings.ruleToggles.scoringEnabled && (
                <>
                  <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                    🔧 Repair System
                  </h3>
                  <p style={{ margin: '0 0 10px 0' }}>
                    If the puzzle becomes unsolvable, pieces are auto-removed until it's solvable again. Each removed piece costs -1 point.
                  </p>
                </>
              )}

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🏁 Game End
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                {gameState.players.length > 1 
                  ? 'Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!'
                  : 'Complete the puzzle by filling all cells!'}
              </p>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              style={{
                marginTop: '20px',
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100vh',
    background: 'transparent', // Let 3D board show through
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    position: 'fixed',
    top: '12px',
    right: '12px',
    display: 'flex',
    gap: '8px',
    zIndex: 200,
  },
  closeButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.9)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  settingsButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(75, 85, 99, 0.9)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  bottomControls: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 200,
  },
  bottomButton: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1.4rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  debugPanel: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '12px',
    padding: '16px',
    maxWidth: '350px',
    maxHeight: '400px',
    overflow: 'auto',
    zIndex: 150,
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)',
  },
  debugTitle: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '4px',
  },
  debugSubtitle: {
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '2px',
  },
  loadingPanel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '16px',
    padding: '40px 60px',
    textAlign: 'center',
    color: '#fff',
    fontSize: '1.2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  errorPanel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(40, 30, 30, 0.95)',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    maxWidth: '400px',
  },
  errorIcon: {
    fontSize: '3rem',
  },
  errorTitle: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#ef4444',
  },
  errorMessage: {
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '8px',
  },
  errorButton: {
    background: 'rgba(59, 130, 246, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  placeButtonContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    zIndex: 180,
  },
  placeButton: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '14px 28px',
    fontSize: '1.1rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  },
  placeButtonActive: {
    background: 'rgba(59, 130, 246, 0.9)',
    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
  },
  placeHint: {
    background: 'rgba(0,0,0,0.7)',
    color: 'rgba(255,255,255,0.8)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
  },
  placeError: {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    zIndex: 190,
  },
  actionButtonContainer: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 180,
  },
  actionButton: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 20px',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  },
  actionButtonHint: {
    background: 'rgba(168, 85, 247, 0.9)',
  },
  actionButtonActive: {
    background: 'rgba(59, 130, 246, 0.9)',
    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
  },
  modeHintPanel: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.9rem',
    zIndex: 180,
  },
  modeHintCancel: {
    background: 'rgba(239, 68, 68, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  anchorPickPanel: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30, 20, 40, 0.95)',
    border: '2px solid rgba(168, 85, 247, 0.5)',
    borderRadius: '12px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    zIndex: 180,
  },
  anchorPickTitle: {
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
  },
  anchorPickButtons: {
    display: 'flex',
    gap: '12px',
  },
  anchorPickConfirm: {
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  anchorPickCancel: {
    background: 'rgba(107, 114, 128, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  turnBanner: {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(52, 211, 153, 0.9)',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 200,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  turnBannerEnded: {
    background: 'rgba(139, 92, 246, 0.9)',
  },
  turnBannerBusy: {
    background: 'rgba(251, 191, 36, 0.9)',
  },
  turnBannerAI: {
    background: 'rgba(59, 130, 246, 0.9)',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  boardPlaceholder: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    padding: '40px',
    background: 'rgba(30, 30, 40, 0.9)',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
    maxWidth: '500px',
    width: '90%',
  },
  placeholderContent: {
    color: '#fff',
  },
  placeholderTitle: {
    margin: '0 0 16px',
    fontSize: '1.5rem',
  },
  placeholderText: {
    margin: '8px 0',
    color: 'rgba(255,255,255,0.7)',
  },
  boardStateInfo: {
    marginTop: '20px',
    textAlign: 'left',
  },
  stateDebug: {
    background: 'rgba(0,0,0,0.3)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '0.8rem',
    overflow: 'auto',
    maxHeight: '200px',
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },
  pieceListContainer: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
  },
  pieceListTitle: {
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  pieceList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  pieceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    fontSize: '0.75rem',
    transition: 'all 0.2s ease',
  },
  pieceItemHighlight: {
    background: 'rgba(251, 191, 36, 0.5)',
    boxShadow: '0 0 12px rgba(251, 191, 36, 0.6)',
    transform: 'scale(1.1)',
  },
  pieceId: {
    fontWeight: 'bold',
    color: '#fff',
  },
  pieceOwner: {
    color: 'rgba(255,255,255,0.6)',
  },
  testControls: {
    marginTop: '20px',
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  testButton: {
    padding: '10px 16px',
    background: 'rgba(102, 126, 234, 0.3)',
    border: '1px solid rgba(102, 126, 234, 0.5)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  repairProgress: {
    marginTop: '16px',
    marginBottom: '16px',
  },
  repairProgressBar: {
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  repairProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #f97316, #ef4444)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  repairProgressText: {
    display: 'block',
    marginTop: '4px',
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  anchorSelectPanel: {
    marginTop: '16px',
    marginBottom: '16px',
    padding: '16px',
    background: 'rgba(102, 126, 234, 0.2)',
    border: '1px solid rgba(102, 126, 234, 0.4)',
    borderRadius: '12px',
  },
  anchorSelectTitle: {
    fontSize: '1rem',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#fff',
  },
  anchorInputRow: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  anchorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '0.9rem',
  },
  anchorInput: {
    width: '60px',
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
  anchorButtonRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  anchorConfirmButton: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
  },
  anchorCancelButton: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};

export default GamePage;
