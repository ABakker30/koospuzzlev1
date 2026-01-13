// src/game/ui/GamePage.tsx
// Unified Game Page - Replaces Solve and VsComputer pages
// Phase 2D: UI animations for piece highlight and score tick

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GameSetupModal } from './GameSetupModal';
import { GameHUD } from './GameHUD';
import { GameEndModal } from './GameEndModal';
import type { GameState, GameSetupInput, InventoryState, PlayerId } from '../contracts/GameState';
import { createInitialGameState } from '../contracts/GameState';
import { dispatch, getActivePlayer } from '../engine/GameMachine';
import { createDefaultDependencies, type Anchor } from '../engine/GameDependencies';

// Default inventory: one of each piece A-Y
const DEFAULT_PIECES = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

function createDefaultInventory(): InventoryState {
  const inventory: InventoryState = {};
  for (const piece of DEFAULT_PIECES) {
    inventory[piece] = 1; // One of each
  }
  return inventory;
}

// Placeholder puzzle ref - in real use this comes from URL params
const PLACEHOLDER_PUZZLE = {
  id: 'placeholder-puzzle-id',
  name: 'Demo Puzzle',
};

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get preset from URL query param
  const presetMode = searchParams.get('mode') as 'solo' | 'vs' | 'multiplayer' | null;
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(true);
  
  // Anchor selection mode for hints (Phase 2B)
  const [anchorSelectMode, setAnchorSelectMode] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<Anchor>({ i: 0, j: 0, k: 0 });

  // UI-only effects state (Phase 2D-2)
  const [highlightPieceId, setHighlightPieceId] = useState<string | null>(null);
  const [scorePulse, setScorePulse] = useState<Record<PlayerId, number>>({});
  const lastNarrationIdRef = useRef<string | null>(null);

  // Game dependencies (solvability check, repair plan, hint generation)
  const depsRef = useRef(createDefaultDependencies());

  // Handle setup confirmation
  const handleSetupConfirm = useCallback((setup: GameSetupInput) => {
    const initialInventory = createDefaultInventory();
    const state = createInitialGameState(setup, PLACEHOLDER_PUZZLE, initialInventory);
    setGameState(state);
    setShowSetupModal(false);
    console.log('🎮 Game started:', state);
  }, []);

  // Handle setup cancel
  const handleSetupCancel = useCallback(() => {
    navigate('/gallery');
  }, [navigate]);

  // Dispatch helper that updates state
  const dispatchEvent = useCallback((event: Parameters<typeof dispatch>[1]) => {
    setGameState(prev => {
      if (!prev) return prev;
      const newState = dispatch(prev, event);
      console.log('🎮 Dispatch:', event.type, newState);
      return newState;
    });
  }, []);

  // Action handlers
  
  // Handle HINT action - enter anchor selection mode or use selected anchor
  const handleHintClick = useCallback(() => {
    if (!gameState) return;
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') return;
    
    // If not in anchor select mode, enter it
    if (!anchorSelectMode) {
      setAnchorSelectMode(true);
      return;
    }
    
    // In anchor select mode - dispatch hint with selected anchor
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ 
      type: 'TURN_HINT_REQUESTED', 
      playerId: activePlayer.id,
      anchor: selectedAnchor,
    });
    setAnchorSelectMode(false);
  }, [gameState, dispatchEvent, anchorSelectMode, selectedAnchor]);
  
  // Cancel anchor selection
  const handleCancelAnchorSelect = useCallback(() => {
    setAnchorSelectMode(false);
  }, []);

  // Handle CHECK action with async solvability check
  const handleCheckClick = useCallback(async () => {
    if (!gameState) return;
    const activePlayer = getActivePlayer(gameState);
    
    // First dispatch to decrement counter and set resolving phase
    dispatchEvent({ type: 'TURN_CHECK_REQUESTED', playerId: activePlayer.id });
    
    // Run async solvability check
    try {
      const result = await depsRef.current.solvabilityCheck(gameState);
      console.log('🔍 Solvability result:', result);
      
      // Dispatch the result
      dispatchEvent({ 
        type: 'TURN_CHECK_RESULT', 
        playerId: activePlayer.id, 
        result 
      });
    } catch (err) {
      console.error('❌ Solvability check failed:', err);
      // Treat as unknown
      dispatchEvent({ 
        type: 'TURN_CHECK_RESULT', 
        playerId: activePlayer.id, 
        result: { status: 'unknown', reason: String(err) }
      });
    }
  }, [gameState, dispatchEvent]);

  const handlePassClick = useCallback(() => {
    if (!gameState) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
  }, [gameState, dispatchEvent]);

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
          console.log('💡 [GamePage] Puzzle unsolvable, starting repair...');
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

  // Repair playback effect - auto-step through repair steps
  useEffect(() => {
    if (!gameState) return;
    if (gameState.subphase !== 'repairing') return;
    if (!gameState.repair) return;
    
    // Auto-advance repair steps with delay
    const timeout = setTimeout(() => {
      dispatchEvent({ type: 'REPAIR_STEP' });
    }, 600); // 600ms between steps for visibility
    
    return () => clearTimeout(timeout);
  }, [gameState?.subphase, gameState?.repair?.index, dispatchEvent]);

  // AI turn simulation (Phase 4 will have proper AI logic)
  useEffect(() => {
    if (!gameState || gameState.phase !== 'in_turn') return;
    if (gameState.subphase === 'repairing') return; // Don't act during repair
    
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'ai') return;
    
    // Simulate AI thinking delay
    const timeout = setTimeout(() => {
      // For now, AI just passes (Phase 4 will add real AI logic)
      dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
    }, 1500);
    
    return () => clearTimeout(timeout);
  }, [gameState, dispatchEvent]);

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
  useEffect(() => {
    if (!gameState) return;
    if (gameState.settings.timerMode !== 'timed') return;
    if (gameState.phase === 'ended') return;
    if (gameState.phase === 'resolving' || gameState.subphase === 'repairing') return;
    
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
    dispatchEvent,
  ]);

  // Show setup modal if no game state
  if (!gameState) {
    return (
      <div style={styles.container}>
        <GameSetupModal
          isOpen={showSetupModal}
          onConfirm={handleSetupConfirm}
          onCancel={handleSetupCancel}
          preset={presetMode ?? undefined}
        />
      </div>
    );
  }

  // Handle new game from end modal
  const handleNewGame = useCallback(() => {
    setGameState(null);
    setShowSetupModal(true);
    setAnchorSelectMode(false);
  }, []);

  // UI-derived status model (Phase 2D-3)
  const isEnded = gameState.phase === 'ended';
  const isBusy = gameState.phase === 'resolving' || gameState.subphase === 'repairing';
  const activePlayer = getActivePlayer(gameState);
  const isAITurn = activePlayer.type === 'ai' && !isBusy && !isEnded;
  
  // Banner text precedence
  const bannerText = isEnded
    ? 'Game Over'
    : gameState.subphase === 'repairing'
    ? 'Repairing…'
    : gameState.phase === 'resolving'
    ? 'Resolving…'
    : activePlayer.type === 'ai'
    ? `${activePlayer.name} is thinking…`
    : `${activePlayer.name}'s turn`;

  return (
    <div style={styles.container}>
      {/* Turn Banner (Phase 2D-3) */}
      <div style={{
        ...styles.turnBanner,
        ...(isEnded ? styles.turnBannerEnded : {}),
        ...(isBusy ? styles.turnBannerBusy : {}),
        ...(isAITurn ? styles.turnBannerAI : {}),
      }}>
        {isAITurn && <span style={styles.spinner}>⏳</span>}
        <span>{bannerText}</span>
      </div>

      {/* Game HUD */}
      <GameHUD
        gameState={gameState}
        onHintClick={handleHintClick}
        onCheckClick={handleCheckClick}
        onPassClick={handlePassClick}
        scorePulse={scorePulse}
      />

      {/* End-of-game modal (Phase 2C) */}
      {gameState.phase === 'ended' && gameState.endState && (
        <GameEndModal
          endState={gameState.endState}
          players={gameState.players}
          onNewGame={handleNewGame}
        />
      )}

      {/* Placeholder for 3D board - Phase 1 just shows a message */}
      <div style={styles.boardPlaceholder}>
        <div style={styles.placeholderContent}>
          <h2 style={styles.placeholderTitle}>🎮 Game Board</h2>
          <p style={styles.placeholderText}>
            Phase 1: State machine is running!
          </p>
          <p style={styles.placeholderText}>
            Turn {gameState.turnNumber} • {getActivePlayer(gameState).name}'s turn
          </p>
          <div style={styles.boardStateInfo}>
            <strong>Board State:</strong>
            <pre style={styles.stateDebug}>
              {JSON.stringify({
                phase: gameState.phase,
                subphase: gameState.subphase,
                activePlayer: gameState.phase !== 'ended' ? getActivePlayer(gameState).name : '(ended)',
                scores: gameState.players.map(p => `${p.name}: ${p.score}`),
                hints: gameState.players.map(p => `${p.name}: ${p.hintsRemaining}`),
                checks: gameState.players.map(p => `${p.name}: ${p.checksRemaining}`),
                piecesPlaced: gameState.boardState.size,
                completionThreshold: 5,
                // Stall tracking (Phase 2C-2)
                stallCounter: `${gameState.roundNoPlacementCount}/${gameState.players.length}`,
                turnHadPlacement: gameState.turnPlacementFlag,
                pendingHint: gameState.pendingHint ? `anchor(${gameState.pendingHint.anchor.i},${gameState.pendingHint.anchor.j},${gameState.pendingHint.anchor.k})` : null,
                repairReason: gameState.repair?.reason,
                repairIndex: gameState.repair?.index,
                repairSteps: gameState.repair?.steps.length,
                endReason: gameState.endState?.reason,
                winners: gameState.endState?.winnerPlayerIds,
              }, null, 2)}
            </pre>
          </div>

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

          {/* Anchor Selection Mode (Phase 2B) */}
          {anchorSelectMode && (
            <div style={styles.anchorSelectPanel}>
              <div style={styles.anchorSelectTitle}>Select Anchor for Hint</div>
              <div style={styles.anchorInputRow}>
                <label style={styles.anchorLabel}>
                  i: <input 
                    type="number" 
                    value={selectedAnchor.i} 
                    onChange={(e) => setSelectedAnchor(a => ({ ...a, i: parseInt(e.target.value) || 0 }))}
                    style={styles.anchorInput}
                  />
                </label>
                <label style={styles.anchorLabel}>
                  j: <input 
                    type="number" 
                    value={selectedAnchor.j} 
                    onChange={(e) => setSelectedAnchor(a => ({ ...a, j: parseInt(e.target.value) || 0 }))}
                    style={styles.anchorInput}
                  />
                </label>
                <label style={styles.anchorLabel}>
                  k: <input 
                    type="number" 
                    value={selectedAnchor.k} 
                    onChange={(e) => setSelectedAnchor(a => ({ ...a, k: parseInt(e.target.value) || 0 }))}
                    style={styles.anchorInput}
                  />
                </label>
              </div>
              <div style={styles.anchorButtonRow}>
                <button 
                  style={styles.anchorConfirmButton}
                  onClick={handleHintClick}
                >
                  Use Hint at ({selectedAnchor.i}, {selectedAnchor.j}, {selectedAnchor.k})
                </button>
                <button 
                  style={styles.anchorCancelButton}
                  onClick={handleCancelAnchorSelect}
                >
                  Cancel
                </button>
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
          
          {/* Test Controls */}
          <div style={styles.testControls}>
            <button
              style={styles.testButton}
              disabled={gameState.subphase === 'repairing'}
              onClick={() => {
                const activePlayer = getActivePlayer(gameState);
                if (activePlayer.type !== 'human') return;
                
                // Place pieces with incrementing IDs
                const pieceIds = ['A', 'B', 'C', 'D', 'E'];
                const nextPieceIndex = gameState.boardState.size % pieceIds.length;
                const pieceId = pieceIds[nextPieceIndex];
                
                dispatchEvent({
                  type: 'TURN_PLACE_REQUESTED',
                  playerId: activePlayer.id,
                  payload: {
                    pieceId,
                    orientationId: 'o1',
                    cells: [
                      { i: nextPieceIndex * 4, j: 0, k: 0 },
                      { i: nextPieceIndex * 4 + 1, j: 0, k: 0 },
                      { i: nextPieceIndex * 4 + 2, j: 0, k: 0 },
                      { i: nextPieceIndex * 4 + 3, j: 0, k: 0 },
                    ],
                  },
                });
              }}
            >
              Test: Place Piece
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(234, 102, 102, 0.3)',
                borderColor: 'rgba(234, 102, 102, 0.5)',
              }}
              disabled={gameState.subphase === 'repairing' || gameState.boardState.size < 3}
              onClick={() => {
                // Force unsolvable state by placing 3+ pieces, then check
                // The stub solvability check returns unsolvable when 3+ pieces
                handleCheckClick();
              }}
            >
              Test: Force Repair (Check)
            </button>
            <button
              style={{
                ...styles.testButton,
                background: 'rgba(234, 179, 8, 0.3)',
                borderColor: 'rgba(234, 179, 8, 0.5)',
              }}
              disabled={gameState.subphase === 'repairing' || gameState.boardState.size < 3 || anchorSelectMode}
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
        </div>
      </div>
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
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    position: 'relative',
    overflow: 'hidden',
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
