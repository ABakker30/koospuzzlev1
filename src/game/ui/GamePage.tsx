// src/game/ui/GamePage.tsx
// Unified Game Page - Replaces Solve and VsComputer pages
// Phase 3A-2: Real puzzle loading and completion check

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { GameSetupModal } from './GameSetupModal';
import { GameHUD } from './GameHUD';
import { GameEndModal } from './GameEndModal';
import { DevTools } from './DevTools';
import { GameBoard3D, type InteractionMode } from '../three/GameBoard3D';
import type { PlacementInfo } from '../engine/GameDependencies';
import { loadPuzzleById, loadDefaultPuzzle, PuzzleNotFoundError } from '../puzzle/PuzzleRepo';
import type { PuzzleData } from '../puzzle/PuzzleTypes';
import type { GameState, GameSetupInput, InventoryState, PlayerId } from '../contracts/GameState';
import { createInitialGameState } from '../contracts/GameState';
import { dispatch, getActivePlayer } from '../engine/GameMachine';
import { createDefaultDependencies, type Anchor } from '../engine/GameDependencies';
import { saveGameSolution } from '../persistence/GameRepo';
import { captureCanvasScreenshot } from '../../services/thumbnailService';
import { supabase } from '../../lib/supabase';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';

// Default inventory: one of each piece A-Y
const DEFAULT_PIECES = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

function createDefaultInventory(): InventoryState {
  const inventory: InventoryState = {};
  for (const piece of DEFAULT_PIECES) {
    inventory[piece] = 1; // One of each
  }
  return inventory;
}


export function GamePage() {
  const { puzzleId } = useParams<{ puzzleId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get preset from URL query param
  const presetMode = searchParams.get('mode') as 'solo' | 'vs' | 'multiplayer' | null;
  
  // Puzzle loading state (Phase 3A-2)
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [puzzleLoading, setPuzzleLoading] = useState(true);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
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
  
  // End modal dismissed (allows viewing the completed board after closing modal)
  const [endModalDismissed, setEndModalDismissed] = useState(false);

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

  // Handle setup confirmation
  const handleSetupConfirm = useCallback((setup: GameSetupInput) => {
    if (!puzzle) return;
    
    const initialInventory = createDefaultInventory();
    const state = createInitialGameState(setup, puzzle.spec, initialInventory);
    setGameState(state);
    setShowSetupModal(false);
    console.log('🎮 Game started:', state);
  }, [puzzle]);

  // Handle setup cancel
  const handleSetupCancel = useCallback(() => {
    navigate('/gallery');
  }, [navigate]);

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
  }, [gameState, drawingCells, dispatchEvent]);
  
  // Handle anchor selected from 3D board (Phase 3A-4)
  const handleAnchorSelected = useCallback((anchor: Anchor) => {
    if (interactionMode !== 'pickingAnchor') return;
    setPendingAnchor(anchor);
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
    
    // Guards: only allow placement when human turn and not busy
    const activePlayer = getActivePlayer(gameState);
    if (activePlayer.type !== 'human') {
      console.log('🎮 [GamePage] Ignoring placement - not human turn');
      return;
    }
    if (gameState.phase !== 'in_turn' || gameState.subphase === 'repairing') {
      console.log('🎮 [GamePage] Ignoring placement - busy/ended');
      return;
    }
    
    console.log('🎮 [GamePage] Placement committed:', placement.pieceId);
    
    // Dispatch TURN_PLACE_REQUESTED
    dispatchEvent({
      type: 'TURN_PLACE_REQUESTED',
      playerId: activePlayer.id,
      payload: placement,
    });
    
    // Exit placing mode
    setInteractionMode('none');
    setPlacementError(null);
  }, [gameState, dispatchEvent]);
  
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
  }, []);

  const handlePassClick = useCallback(() => {
    if (!gameState) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_PASS_REQUESTED', playerId: activePlayer.id });
  }, [gameState, dispatchEvent]);

  // Handle piece removal (Quick Play mode)
  const handleRemovePiece = useCallback(() => {
    if (!gameState || !selectedPieceUid) return;
    const activePlayer = getActivePlayer(gameState);
    dispatchEvent({ type: 'TURN_REMOVE_REQUESTED', playerId: activePlayer.id, pieceUid: selectedPieceUid });
    setSelectedPieceUid(null); // Clear selection after removal
  }, [gameState, selectedPieceUid, dispatchEvent]);

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

  // Repair playback effect - auto-step through repair steps (Phase 3A-5: glow before remove)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.subphase !== 'repairing') return;
    if (!gameState.repair) return;
    
    const { repair } = gameState;
    const currentStep = repair.steps[repair.index];
    
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
  useEffect(() => {
    if (!gameState) return;
    
    const activePlayer = getActivePlayer(gameState);
    const isBusyOrEnded = gameState.phase === 'ended' || 
                          gameState.phase === 'resolving' || 
                          gameState.subphase === 'repairing';
    
    if (isBusyOrEnded) {
      setInteractionMode('none');
      setPendingAnchor(null);
    } else if (activePlayer.type === 'human' && gameState.phase === 'in_turn' && interactionMode === 'none') {
      // Auto-enable placing mode for human turns
      setInteractionMode('placing');
    } else if (activePlayer.type === 'ai') {
      setInteractionMode('none');
    }
  }, [gameState?.phase, gameState?.subphase, gameState?.activePlayerIndex, interactionMode]);

  // Handle new game from end modal (must be before early return to maintain hook order)
  const handleNewGame = useCallback(() => {
    setGameState(null);
    setShowSetupModal(true);
    setInteractionMode('none');
    setPendingAnchor(null);
    setEndModalDismissed(false);
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
          isOpen={showSetupModal}
          onConfirm={handleSetupConfirm}
          onCancel={handleSetupCancel}
          onShowHowToPlay={() => setShowInfoModal(true)}
          preset={presetMode ?? undefined}
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
            zIndex: 1100,
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
                🎮 How to Play
              </h2>
              
              <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🎯 Goal
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells. Highest score wins!
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  📊 Scoring
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>+1 point</strong> for each piece you place manually<br/>
                  <strong>0 points</strong> for pieces placed via hint<br/>
                  <strong>-1 point</strong> for each piece removed during repair
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  ✏️ Placing Pieces
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y). <strong>Only unique pieces allowed</strong> - each piece can only be placed once.
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  💡 Hint (Unlimited)
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Click one cell, then tap Hint for a piece suggestion. Use hints as often as you like!
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🔧 Repair System
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  If the puzzle becomes unsolvable, pieces are auto-removed until it's solvable again. Each removed piece costs -1 point.
                </p>

                <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                  🏁 Game End
                </h3>
                <p style={{ margin: '0 0 10px 0' }}>
                  Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!
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
        hidePlacedPieces={hidePlacedPieces}
        onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
        scorePulse={scorePulse}
        selectedPieceUid={selectedPieceUid}
        onRemoveClick={handleRemovePiece}
      />

      {/* End-of-game modal (Phase 2C) */}
      {gameState.phase === 'ended' && gameState.endState && !endModalDismissed && (
        <GameEndModal
          endState={gameState.endState}
          players={gameState.players}
          onNewGame={handleNewGame}
          onClose={() => setEndModalDismissed(true)}
          scoringEnabled={gameState.settings.ruleToggles.scoringEnabled}
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
        isHumanTurn={activePlayer.type === 'human'}
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
        onDrawingCellsChange={setDrawingCells}
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

      {/* How to Play Info Modal */}
      {showInfoModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
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
              🎮 How to Play
            </h2>
            
            <div style={{ color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.6, fontSize: '0.9rem' }}>
              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🎯 Goal
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Fill the puzzle by placing Koos pieces. Each piece covers exactly 4 cells. Highest score wins!
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                📊 Scoring
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>+1 point</strong> for each piece you place manually<br/>
                <strong>0 points</strong> for pieces placed via hint<br/>
                <strong>-1 point</strong> for each piece removed during repair
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                ✏️ Placing Pieces
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click 4 adjacent cells to draw a piece. The shape must match one of the 25 Koos pieces (A-Y). <strong>Only unique pieces allowed</strong> - each piece can only be placed once.
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                💡 Hint (Unlimited)
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Click one cell, then tap Hint for a piece suggestion. Use hints as often as you like!
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🔧 Repair System
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                If the puzzle becomes unsolvable, pieces are auto-removed until it's solvable again. Each removed piece costs -1 point.
              </p>

              <h3 style={{ color: '#60a5fa', margin: '12px 0 6px 0', fontSize: '1rem' }}>
                🏁 Game End
              </h3>
              <p style={{ margin: '0 0 10px 0' }}>
                Game ends when: puzzle completed, all players stalled, or timer runs out. Highest score wins!
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
