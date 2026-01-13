// src/game/ui/GamePage.tsx
// Unified Game Page - Replaces Solve and VsComputer pages
// Phase 2B: Setup modal + state machine + HINT action with repair-first pipeline

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GameSetupModal } from './GameSetupModal';
import { GameHUD } from './GameHUD';
import type { GameState, GameSetupInput, InventoryState } from '../contracts/GameState';
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

  return (
    <div style={styles.container}>
      {/* Game HUD */}
      <GameHUD
        gameState={gameState}
        onHintClick={handleHintClick}
        onCheckClick={handleCheckClick}
        onPassClick={handlePassClick}
      />

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
                activePlayer: getActivePlayer(gameState).name,
                scores: gameState.players.map(p => `${p.name}: ${p.score}`),
                hints: gameState.players.map(p => `${p.name}: ${p.hintsRemaining}`),
                checks: gameState.players.map(p => `${p.name}: ${p.checksRemaining}`),
                piecesPlaced: gameState.boardState.size,
                pendingHint: gameState.pendingHint ? `anchor(${gameState.pendingHint.anchor.i},${gameState.pendingHint.anchor.j},${gameState.pendingHint.anchor.k})` : null,
                repairReason: gameState.repair?.reason,
                repairIndex: gameState.repair?.index,
                repairSteps: gameState.repair?.steps.length,
              }, null, 2)}
            </pre>
          </div>

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
              style={styles.testButton}
              onClick={() => {
                dispatchEvent({ type: 'GAME_END_REQUESTED', reason: 'completed' });
              }}
            >
              Test: End Game
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
