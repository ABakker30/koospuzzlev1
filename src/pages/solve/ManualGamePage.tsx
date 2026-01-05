import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useManualGameSession } from './hooks/useManualGameSession';
import { useGameTurnController } from './hooks/useGameTurnController';
import { ManualGameBoard } from './components/ManualGameBoard';
import { ManualGameResultModal } from './components/ManualGameResultModal';
import { ManualGameHowToPlayModal } from './components/ManualGameHowToPlayModal';
import { PlayInfoHubModal } from './components/PlayInfoHubModal';
import { PlayHowToPlayModal } from './components/PlayHowToPlayModal';
import { PlayHowToSolveModal } from './components/PlayHowToSolveModal';
import { ManualSolveSuccessModal } from './components/ManualSolveSuccessModal';
import { PlayAboutPuzzleModal } from './components/PlayAboutPuzzleModal';
import { ManualGameVSHeader } from './components/ManualGameVSHeader';
import { ChatDrawer } from '../../components/ChatDrawer';
import { ManualGameChatPanel } from './components/ManualGameChatPanel';
import { ManualGameBottomControls } from './components/ManualGameBottomControls';
import { InvalidMoveModal } from './components/InvalidMoveModal';
import { ModeViolationModal } from './components/ModeViolationModal';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
// useComputerTurn removed - now using imperative triggerComputerTurn
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { useOrientationService } from './hooks/useOrientationService';
import { useCompletionAutoSave } from './hooks/useCompletionAutoSave';
import { DEFAULT_PIECE_LIST } from './utils/manualSolveHelpers';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { MaterialSettingsModal } from './components/MaterialSettingsModal';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import type { IJK } from '../../types/shape';
import { 
  dlxCheckSolvable,
  dlxCheckSolvableEnhanced,
  dlxGetHint,
  invalidateWitnessCache,
  type DLXCheckInput,
  type EnhancedDLXCheckResult,
  type SolverState,
  type Mode as DLXMode
} from '../../engines/dlxSolver';
import { DLX_SOLVABILITY_TIMEOUT_MS } from './config/solveValidationConfig';
import { sounds } from '../../utils/audio';

// Piece mode for gameplay
type PieceMode = 'unlimited' | 'unique' | 'identical';
import '../../styles/manualGame.css';

export const ManualGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const gameMode = searchParams.get('mode') === 'solo' ? 'solo' : 'vsComputer';
  const isSoloMode = gameMode === 'solo';
  
  const HOW_TO_SOLVE_DISMISSED_KEY = 'manualGame.howToSolveDismissed';
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const {
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
    incrementHintsUsed,
    incrementSolvabilityChecks,
    incrementSolvabilityTimeouts,
    endGame,
    resetSession,
  } = useManualGameSession(puzzle?.id, isSoloMode);

  // Ref to always have current session (for stale closure protection)
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const {
    handlePlacePiece,
  } = useGameTurnController({
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
    incrementHintsUsed,
    incrementSolvabilityChecks,
  });

  // Ref for computer turn gate
  const hintInProgressRef = useRef(false);
  const [hintLoading, setHintLoading] = useState(false);
  
  // Track who made the last move BEFORE turn advances (Fix #1)
  const lastMoveByPlayerIdRef = useRef<string | null>(null);
  
  // Guard against double game-over (Fix #3)
  const gameOverRef = useRef(false);
  
  // Guard against overlapping solvability checks (prevents infinite loop)
  const isCheckingSolvabilityRef = useRef(false);

  // Pending placement (awaiting solvability validation) - MUST be before useComputerTurn
  const pendingPlacementRef = useRef<{
    uid: string;
    pieceId: string;
    orientationId: string;
    cells: IJK[];
    playerId: string;
  } | null>(null);

  // Ref to track computer animation state (synced with isComputerAnimating from useGameBoardLogic)
  const computerAnimatingRef = useRef(false);

  // VS Environment Settings (isolated from Manual mode)
  const [vsEnvSettings, setVsEnvSettings] = useState<StudioSettings>(() => {
    try {
      const stored = localStorage.getItem('studioSettings.vs');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_STUDIO_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.warn('⚠️ Failed to load VS env settings:', err);
    }
    return DEFAULT_STUDIO_SETTINGS;
  });
  const [showVsEnvSettings, setShowVsEnvSettings] = useState(false);
  const [showMaterialSettings, setShowMaterialSettings] = useState(false);
  const [vsCurrentPreset, setVsCurrentPreset] = useState<string>('metallic-light');
  
  // Keyboard shortcut: S to toggle material settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShowMaterialSettings(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ref for computer turn timeout (imperative approach)
  const computerTurnTimeoutRef = useRef<number | null>(null);
  
  // Cancel any pending computer turn
  const cancelComputerTurn = useCallback(() => {
    if (computerTurnTimeoutRef.current !== null) {
      console.log('🛑 [COMPUTER] Cancelling pending computer turn');
      window.clearTimeout(computerTurnTimeoutRef.current);
      computerTurnTimeoutRef.current = null;
    }
  }, []);

  // Hide placed pieces toggle
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);
  
  // Piece mode for gameplay rules
  const [pieceMode, setPieceMode] = useState<PieceMode>('unique');
  const [firstPieceId, setFirstPieceId] = useState<string | null>(null); // For identical mode

  // Result modal state
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasShownResultModal, setHasShownResultModal] = useState(false);

  // Solution auto-save state
  const [solveStartTime] = useState(Date.now()); // Track when game started
  const [solveEndTime, setSolveEndTime] = useState<number | null>(null);
  
  // Game timer - starts after first piece placement
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isComplete, setIsComplete] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [notification, setNotification] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [revealK, setRevealK] = useState(0);

  // Modal system (How to Play auto-opens on first load unless dismissed)
  const [showInfoHub, setShowInfoHub] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(() => {
    try {
      return localStorage.getItem(HOW_TO_SOLVE_DISMISSED_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [showAboutPuzzle, setShowAboutPuzzle] = useState(false);
  

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(false); // Start closed by default

  // Invalid move modal
  const [showInvalidMove, setShowInvalidMove] = useState(false);
  const [lastInvalidMoveUid, setLastInvalidMoveUid] = useState<string | null>(null);
  
  // Mode violation modal
  const [showModeViolation, setShowModeViolation] = useState(false);
  
  // LocalStorage keys for "don't show again" preferences
  const HIDE_INVALID_MOVE_MODAL_KEY = 'koos_hide_invalid_move_modal';
  const HIDE_MODE_VIOLATION_MODAL_KEY = 'koos_hide_mode_violation_modal';
  const [modeViolationPieceId, setModeViolationPieceId] = useState<string | null>(null);

  // Enhanced solver state (stores full metadata)
  const [solverResult, setSolverResult] = useState<EnhancedDLXCheckResult | null>(null);
  
  // Convenience accessor for indicator color
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const solvabilityIndicator: SolverState = solverResult?.state ?? 'orange';
  
  // Placement nonce: increment on each placement to trigger solvability check efficiently
  // (avoids running check on removals/resets/other changes)
  const [lastPlacementNonce, setLastPlacementNonce] = useState(0);

  // Determine if it's the human's turn
  const currentPlayer =
    session && session.players[session.currentPlayerIndex];
  const isHumanTurn = !!currentPlayer && !currentPlayer.isComputer && !session?.isComplete;

  // Board logic: human drawing & placement
  const {
    placedPieces,
    placedCountByPieceId,
    drawingCells,
    selectedPieceUid,
    handleInteraction,
    computerDrawingCells,
    isComputerAnimating,
    animateComputerMove,
    resetBoard,
    deletePieceByUid,
    rejectedPieceCells,
    rejectedPieceId,
  } = useGameBoardLogic({
    hintInProgressRef, // Pass ref to block placement during hint animation
    pieceMode,
    firstPieceId,
    onModeViolation: (attemptedPieceId) => {
      setModeViolationPieceId(attemptedPieceId);
      // Only show modal if user hasn't chosen "don't show again"
      if (localStorage.getItem(HIDE_MODE_VIOLATION_MODAL_KEY) !== 'true') {
        setShowModeViolation(true);
      }
    },
    onPiecePlaced: ({ pieceId, orientationId, cells, uid }) => {
      if (!puzzle || !session) return;
      
      // NEW FLOW: Piece is already placed on board visually
      // Store as pending placement, solvability check will validate it
      
      // Validate required fields
      if (!orientationId) {
        console.error('❌ Missing orientationId - cannot process placement');
        return;
      }
      
      // Mode validation is now handled in useGameBoardLogic before piece is placed
      
      // Invalidate witness cache
      invalidateWitnessCache();
      
      // Capture current player ID
      const currentPlayerId = session.players[session.currentPlayerIndex]?.id;
      if (!currentPlayerId) {
        console.warn('⚠️ No current player ID - cannot process placement');
        return;
      }
      
      // Store pending placement with required orientationId (type-narrowed by check above)
      pendingPlacementRef.current = {
        uid,
        pieceId,
        orientationId: orientationId as string, // Type-narrowed by if check above
        cells,
        playerId: currentPlayerId,
      };
      
      console.log('📦 [PENDING-HUMAN] Stored placement for validation:', {
        pieceId,
        uid,
        playerId: session.players[session.currentPlayerIndex]?.name,
      });
      
      // Increment nonce to trigger solvability check
      setLastPlacementNonce(prev => prev + 1);
    },
    onPieceRemoved: () => {
      // Disabled for strict "landmine" mode - no undos allowed
      // Once a piece is placed, it's committed
      console.log('⚠️ Piece removal disabled in VS mode (landmine rules)');
    },
    isHumanTurn,
  });

  // Sync computerAnimatingRef with isComputerAnimating state (for useComputerTurn gate)
  useEffect(() => {
    computerAnimatingRef.current = isComputerAnimating;
  }, [isComputerAnimating]);

  // Start game timer when first piece is placed
  useEffect(() => {
    if (placedPieces.length > 0 && gameStartTime === null) {
      setGameStartTime(Date.now());
    }
  }, [placedPieces.length, gameStartTime]);

  // Track first piece for identical mode
  useEffect(() => {
    if (pieceMode === 'identical' && placedPieces.length > 0 && firstPieceId === null) {
      const firstPiece = placedPieces[0];
      if (firstPiece?.pieceId) {
        setFirstPieceId(firstPiece.pieceId);
        console.log('🎯 [IDENTICAL MODE] First piece set:', firstPiece.pieceId);
      }
    }
  }, [pieceMode, placedPieces, firstPieceId]);

  // Update elapsed seconds every second while game is active
  // Stop when solveEndTime is set (puzzle completed)
  useEffect(() => {
    // Don't start if no game started or if already completed
    if (gameStartTime === null || solveEndTime !== null) return;
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - gameStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [gameStartTime, solveEndTime]);

  // Set final elapsed time when game completes (matches modal calculation exactly)
  useEffect(() => {
    if (solveEndTime !== null && gameStartTime !== null) {
      const finalSeconds = Math.floor((solveEndTime - gameStartTime) / 1000);
      setElapsedSeconds(finalSeconds);
    }
  }, [solveEndTime, gameStartTime]);

  // Computer move generator
  const { generateMove, ready: computerMoveReady } =
    useComputerMoveGenerator(puzzle, placedCountByPieceId);

  // Handler for when invalid move modal closes
  const handleInvalidMoveClose = useCallback((dontShowAgain: boolean) => {
    console.log('🗑️ Modal closed (piece already removed)');
    
    // Save preference if user checked "don't show again"
    if (dontShowAgain) {
      localStorage.setItem(HIDE_INVALID_MOVE_MODAL_KEY, 'true');
    }
    
    setShowInvalidMove(false);
    setLastInvalidMoveUid(null);
    
    // Trigger solvability check to update UI to green
    setLastPlacementNonce(prev => prev + 1);
  }, []);

  // Container cells for game end detection
  const containerCells: IJK[] = React.useMemo(
    () => ((puzzle as any)?.geometry as IJK[] | undefined) || [],
    [puzzle]
  );

  // Removed: maxPieces and piecesPlaced (unused after SCORE replaced PROGRESS)

  // Initial solvability check when puzzle/session loads
  useEffect(() => {
    if (puzzle && session && containerCells.length > 0 && placedPieces.length === 0) {
      // Trigger initial solvability check to populate status modal
      console.log('🔄 Running initial solvability check for empty puzzle');
      setLastPlacementNonce(prev => prev + 1);
    }
  }, [puzzle, session, containerCells.length, placedPieces.length]);

  // Orientation service for hint piece geometry
  const { service: orientationService } = useOrientationService();

  // Game context for AI chat
  const getGameContext = React.useCallback(() => {
    if (!session) {
      return {
        puzzleId: puzzle?.id,
        puzzleName: puzzle?.name,
        status: 'no_session',
      };
    }

    const current = session.players[session.currentPlayerIndex];

    return {
      puzzleId: puzzle?.id,
      puzzleName: puzzle?.name,
      currentPlayer: current?.name,
      players: session.players.map(p => ({
        name: p.name,
        isComputer: p.isComputer,
        score: session.scores[p.id] ?? 0,
      })),
      placedPiecesCount: placedPieces.length,
    };
  }, [session, puzzle, placedPieces]);

  // Game chat with AI integration
  const {
    messages: chatMessages,
    isSending: chatIsSending,
    sendUserMessage,
    sendEmoji,
    addAIComment,
  } = useGameChat({ 
    getGameContext,
    mode: 'versus'
  });

  // Trigger computer turn after delay (called explicitly after human's turn)
  const triggerComputerTurn = useCallback(() => {
    if (isSoloMode) return;
    if (computerTurnTimeoutRef.current !== null) return; // Already scheduled
    
    const delay = 1200 + Math.random() * 400; // 1.2-1.6s thinking time
    console.log('⏰ [COMPUTER] Scheduling turn in', Math.round(delay), 'ms');
    
    computerTurnTimeoutRef.current = window.setTimeout(() => {
      computerTurnTimeoutRef.current = null;
      
      const currentSession = sessionRef.current;
      console.log('🤖 [COMPUTER TURN] Executing...');
      
      if (!currentSession || currentSession.isComplete || isSoloMode) {
        console.log('🤖 [COMPUTER TURN] Cancelled - game ended or solo mode');
        return;
      }
      
      const current = currentSession.players[currentSession.currentPlayerIndex];
      if (!current?.isComputer) {
        console.log('🤖 [COMPUTER TURN] Cancelled - not computer turn');
        return;
      }
      
      if (!computerMoveReady) {
        console.log('⏳ Computer move generator not ready; retrying...');
        triggerComputerTurn();
        return;
      }
      
      console.log('🤖 [COMPUTER TURN] Generating move...');
      const move = generateMove(placedPieces);
      
      if (move) {
        console.log('🤖 [COMPUTER TURN] Move generated:', { pieceId: move.pieceId });
        
        animateComputerMove(move, ({ pieceId, orientationId, cells, uid }) => {
          const sess = sessionRef.current;
          if (!sess || sess.isComplete) return;
          
          const currentPlayerId = sess.players[sess.currentPlayerIndex]?.id;
          if (!currentPlayerId || !orientationId) return;
          
          invalidateWitnessCache();
          
          pendingPlacementRef.current = {
            uid,
            pieceId,
            orientationId,
            cells,
            playerId: currentPlayerId,
          };
          
          setLastPlacementNonce(prev => prev + 1);
          
          if (Math.random() < 0.4) {
            addAIComment(`I placed the ${pieceId} piece. Let's see if it works...`);
          }
        });
      } else {
        console.log('⚠️ Computer found no move; retrying...');
        addAIComment("I'm not seeing a clean move yet… give me a moment.");
        triggerComputerTurn();
      }
    }, delay) as unknown as number;
  }, [isSoloMode, computerMoveReady, generateMove, placedPieces, animateComputerMove, addAIComment]);

  // Solution stats function for auto-save
  const getSolveStats = useCallback(() => {
    if (!session) {
      return {
        total_moves: placedPieces.length,
        undo_count: 0,
        hints_used: 0,
        solvability_checks_used: 0,
      };
    }
    
    // Get stats for human player
    const humanPlayer = session.players.find(p => !p.isComputer);
    const humanStats = humanPlayer ? session.stats[humanPlayer.id] : { hintsUsed: 0, solvabilityChecksUsed: 0 };
    
    return {
      total_moves: placedPieces.length,
      undo_count: 0, // VS mode doesn't allow undo
      hints_used: humanStats?.hintsUsed ?? 0,
      solvability_checks_used: humanStats?.solvabilityChecksUsed ?? 0,
    };
  }, [session, placedPieces.length]);

  // Convert placedPieces array to Map for useCompletionAutoSave compatibility
  const placedPiecesMap = React.useMemo(() => {
    const map = new Map();
    placedPieces.forEach(piece => {
      map.set(piece.uid, piece);
    });
    return map;
  }, [placedPieces]);

  // Auto-save solution when puzzle is completed (both solo and vs computer modes)
  useCompletionAutoSave({
    puzzle,
    cells: containerCells,
    placed: placedPiecesMap,
    solveStartTime,
    moveCount: placedPieces.length,
    solveActions: [], // Not tracking individual actions in game mode
    getSolveStats,
    setIsComplete,
    setSolveEndTime,
    setRevealK,
    setShowCompletionCelebration,
    setCurrentSolutionId,
    setShowSuccessModal,
    setNotification,
    setNotificationType,
  });

  // Hint handler (must be after useGameChat to access addAIComment)
  const handleHint = useCallback(async () => {
    if (!puzzle || !session || hintInProgressRef.current) return;
    if (session.isComplete) return;
    if (!isHumanTurn) return;
    
    // User must double-click a cell first to set anchor for hint
    if (drawingCells.length === 0) {
      addAIComment("Double-click a cell first, then I'll show you a hint piece for that spot!");
      return;
    }
    
    hintInProgressRef.current = true;
    setHintLoading(true);
    
    try {
      const containerCells: IJK[] = (puzzle as any).geometry || [];
      const targetCell = drawingCells[0]; // Use first drawn cell as anchor
      
      // Build remaining pieces based on pieceMode
      const usedPieces = new Set(placedPieces.map(p => p.pieceId));
      let remainingPieces: { pieceId: string; remaining: number }[];
      let dlxMode: DLXMode;
      
      if (pieceMode === 'unlimited') {
        // All pieces available with unlimited count
        remainingPieces = DEFAULT_PIECE_LIST.map(pid => ({ pieceId: pid, remaining: 999 }));
        dlxMode = 'unlimited';
      } else if (pieceMode === 'identical') {
        // Only the first piece type is allowed
        if (firstPieceId) {
          remainingPieces = [{ pieceId: firstPieceId, remaining: 999 }];
        } else {
          // No piece placed yet - pick a random piece for hint
          const randomPieceId = DEFAULT_PIECE_LIST[Math.floor(Math.random() * DEFAULT_PIECE_LIST.length)];
          remainingPieces = [{ pieceId: randomPieceId, remaining: 999 }];
        }
        dlxMode = 'single';
      } else {
        // unique mode - each piece can only be used once
        remainingPieces = DEFAULT_PIECE_LIST
          .filter(pid => !usedPieces.has(pid))
          .map(pid => ({ pieceId: pid, remaining: 1 }));
        dlxMode = 'oneOfEach';
      }
      
      // Build DLX input for hint request
      const dlxInput: DLXCheckInput = {
        containerCells,
        placedPieces: placedPieces.map((p, idx) => ({
          pieceId: p.pieceId,
          orientationId: p.orientationId || `${p.pieceId}-00`,
          anchorSphereIndex: idx,
          cells: p.cells,
          uid: p.uid,
        })),
        emptyCells: containerCells.filter(c => {
          const occupied = new Set(placedPieces.flatMap(p => p.cells.map(cell => `${cell.i},${cell.j},${cell.k}`)));
          return !occupied.has(`${c.i},${c.j},${c.k}`);
        }),
        remainingPieces,
        mode: dlxMode,
      };
      
      // Call DLX hint solver with target anchor cell
      console.log('💡 [HINT] Requesting hint for target cell:', targetCell);
      console.log('💡 [HINT] DLX Input:', {
        containerCellCount: containerCells.length,
        placedPiecesCount: placedPieces.length,
        emptyCellCount: dlxInput.emptyCells.length,
        remainingPieces: remainingPieces,
        dlxMode: dlxMode,
        pieceMode: pieceMode,
        firstPieceId: firstPieceId,
      });
      const hintResult = await dlxGetHint(dlxInput, targetCell);
      
      if (!hintResult.solvable || !hintResult.hintedPieceId || !hintResult.hintedOrientationId || !hintResult.hintedAnchorCell) {
        console.warn('❌ [HINT] No valid hint found');
        addAIComment("I couldn't find a valid hint for that spot. Try a different cell!");
        return;
      }
      
      console.log('✅ [HINT] Found hint:', {
        pieceId: hintResult.hintedPieceId,
        orientationId: hintResult.hintedOrientationId,
        anchorCell: hintResult.hintedAnchorCell
      });
      
      // Get the full 4 cells of the oriented piece from the orientation service
      if (!orientationService) {
        addAIComment("Orientation service not ready. Try again!");
        return;
      }
      
      const orientations = orientationService.getOrientations(hintResult.hintedPieceId);
      if (!orientations || orientations.length === 0) {
        addAIComment("Couldn't load piece geometry. Try again!");
        return;
      }
      
      const orientation = orientations.find((o: any) => o.orientationId === hintResult.hintedOrientationId) || orientations[0];
      const anchorCell = hintResult.hintedAnchorCell!; // Already validated above
      
      // Compute world-space cells for the hinted piece
      // Reorder so user's double-clicked cell (targetCell) is drawn first
      const allHintCells: IJK[] = orientation.ijkOffsets.map((offset: any) => ({
        i: anchorCell.i + offset.i,
        j: anchorCell.j + offset.j,
        k: anchorCell.k + offset.k,
      }));
      
      // Find the cell matching targetCell (user's double-click) and put it first
      const targetKey = `${targetCell.i},${targetCell.j},${targetCell.k}`;
      const targetIdx = allHintCells.findIndex(c => `${c.i},${c.j},${c.k}` === targetKey);
      const hintCells: IJK[] = targetIdx >= 0
        ? [allHintCells[targetIdx], ...allHintCells.filter((_, i) => i !== targetIdx)]
        : allHintCells;
      
      const move = {
        pieceId: hintResult.hintedPieceId,
        orientationId: hintResult.hintedOrientationId,
        cells: hintCells,
      };
      
      // Animate hint placement
      animateComputerMove(move, ({ pieceId, orientationId, cells, uid }) => {
        invalidateWitnessCache();
        
        // Capture player ID BEFORE turn advances
        lastMoveByPlayerIdRef.current = session.players[session.currentPlayerIndex]?.id ?? null;
        
        // Commit hint placement with 0 points (source: 'hint')
        handlePlacePiece({
          source: 'hint',
          pieceId,
          orientationId,
          cells,
          uid,
        });
        
        addAIComment(`Here's a hint: I placed the ${pieceId} piece at your anchor. No points though!`);
      });
    } catch (err) {
      console.error('❌ Hint failed:', err);
      addAIComment("Sorry, I couldn't generate a hint. Try placing a piece yourself!");
    } finally {
      hintInProgressRef.current = false;
      setHintLoading(false);
    }
  }, [puzzle, session, isHumanTurn, placedPieces, drawingCells, animateComputerMove, handlePlacePiece, addAIComment, pieceMode, firstPieceId, orientationService]);

  // Initial solvability check on game launch (populate game status modal)
  useEffect(() => {
    if (!puzzle || !session || session.isComplete) return;
    if (!containerCells.length) return;
    if (placedPieces.length > 0) return; // Only on completely empty board
    
    // Empty board is always solvable - set initial state without expensive DLX check
    console.log('🎮 [INITIAL CHECK] Setting initial green state for empty puzzle');
    setSolverResult({
      state: 'green',
      emptyCellCount: containerCells.length,
      checkedDepth: 'existence',
      timedOut: false,
      solutionCount: 1000, // Known to be many solutions
      solutionsCapped: true,
      reason: 'initial',
      computeTimeMs: 0,
      validNextMoveCount: 5, // Approximate for empty board
      estimatedSearchSpace: '≈10^42', // Approximate for 25 pieces
    });
  }, [puzzle?.id, session?.players, placedPieces.length]); // Run once when puzzle/session initializes

  // Automatic solvability checking after each placement (DROP-IN REPLACEMENT)
  //
  // Fixes:
  // - proper async cancellation (no stale DLX results ending the game later)
  // - double game-over guard (won't end twice)
  // - safe loser attribution (won't guess if loserId is null)
  // - robust remainingPieces build (handles DEFAULT_PIECE_LIST being string[] OR object[])
  useEffect(() => {
    let cancelled = false;

    const checkSolvability = async () => {
      // Hard guards
      if (cancelled) return;
      if (gameOverRef.current) return;
      if (isCheckingSolvabilityRef.current) {
        console.log('⏭️ Skipping solvability check - already in progress');
        return;
      }
      if (!puzzle || !session || session.isComplete) return;
      
      isCheckingSolvabilityRef.current = true;

      try {
        // No cells => can't check
        if (!containerCells.length) {
          setSolverResult(null);
          return;
        }

        const ijkToKey = (cell: IJK) => `${cell.i},${cell.j},${cell.k}`;

        // Compute occupancy + empty
        const occupied = new Set<string>();
        for (const piece of placedPieces) {
          for (const c of piece.cells) occupied.add(ijkToKey(c));
        }
        const emptyCells = containerCells.filter(c => !occupied.has(ijkToKey(c)));

        // Victory condition: All cells filled
        // BUT wait for pending placement to be validated/scored first
        if (emptyCells.length === 0 && !pendingPlacementRef.current) {
          console.log('🎉 All cells filled - puzzle complete!');
          sounds.puzzleSolved();
          
          if (isSoloMode) {
            // Solo mode: No winner determination, just end game
            const humanPlayer = session.players.find(p => !p.isComputer);
            endGame('manual', humanPlayer?.id || session.players[0].id);
          } else {
            // VS mode: Determine winner by score
            const sortedPlayers = [...session.players].sort((a, b) => 
              (session.scores[b.id] ?? 0) - (session.scores[a.id] ?? 0)
            );
            const winner = sortedPlayers[0];
            const loser = sortedPlayers[1];
            // Check for draw (equal scores)
            const winnerScore = session.scores[winner.id] ?? 0;
            const loserScore = session.scores[loser?.id] ?? 0;
            if (winnerScore === loserScore) {
              // Draw - no winner (pass null explicitly)
              endGame('manual', null);
            } else {
              endGame('manual', winner.id);
            }
          }
          return;
        }

        // Build remaining inventory based on pieceMode
        // Supports DEFAULT_PIECE_LIST being string[] OR an array of objects with { id } or { pieceId }.
        const usedPieces = new Set(
          placedPieces
            .map(p => (p as any).pieceId)
            .filter((x): x is string => typeof x === 'string' && x.length > 0)
        );

        const allPieceIds: string[] = (DEFAULT_PIECE_LIST as any[]).map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p.id === 'string') return p.id;
          if (p && typeof p.pieceId === 'string') return p.pieceId;
          return null;
        }).filter((x): x is string => typeof x === 'string' && x.length > 0);

        // Defensive: if we somehow couldn't extract IDs, fail closed (unknown) but don't crash
        if (allPieceIds.length === 0) {
          console.warn('⚠️ DEFAULT_PIECE_LIST produced no piece IDs; solvability indicator set to unknown.');
          setSolverResult(null);
          return;
        }

        // Build remaining pieces based on pieceMode
        let remainingPieces: { pieceId: string; remaining: number }[];
        let dlxMode: DLXMode;
        
        if (pieceMode === 'unlimited') {
          // All pieces available with unlimited count
          remainingPieces = allPieceIds.map(pieceId => ({ pieceId, remaining: 999 }));
          dlxMode = 'unlimited';
        } else if (pieceMode === 'identical') {
          // Only the first piece type is allowed
          if (firstPieceId) {
            remainingPieces = [{ pieceId: firstPieceId, remaining: 999 }];
          } else {
            // No piece placed yet - all pieces available (first placement sets the type)
            remainingPieces = allPieceIds.map(pieceId => ({ pieceId, remaining: 999 }));
          }
          dlxMode = 'single';
        } else {
          // unique mode - each piece can only be used once
          remainingPieces = allPieceIds.map(pieceId => ({
            pieceId,
            remaining: usedPieces.has(pieceId) ? 0 : 1,
          }));
          dlxMode = 'oneOfEach';
        }

        const dlxInput: DLXCheckInput = {
          containerCells,
          placedPieces,
          emptyCells,
          remainingPieces,
          mode: dlxMode,
        };

        // Use Web Worker-based enhanced solver (non-blocking)
        const result = await dlxCheckSolvableEnhanced(dlxInput, {
          timeoutMs: DLX_SOLVABILITY_TIMEOUT_MS,
          emptyThreshold: 100,
        });
        if (cancelled) return;
        if (gameOverRef.current) return; // guard again after await

        // Store full solver result for Game Status modal
        setSolverResult(result);

        // 🔍 DEBUG: Log every solvability check result
        console.log('🧠 [SOLVABILITY RESULT]', {
          state: result.state,
          emptyCellCount: result.emptyCellCount,
          timedOut: result.timedOut,
          thresholdSkipped: result.thresholdSkipped,
          checkedDepth: result.checkedDepth,
          reason: result.reason,
          hasPending: !!pendingPlacementRef.current,
        });

        // NEW FLOW: Validate pending placement if any
        const pending = pendingPlacementRef.current;
        
        if (pending) {
          console.log('🔍 [VALIDATION] Checking pending placement:', {
            pieceId: pending.pieceId,
            uid: pending.uid,
            result: result.state,
            timedOut: result.timedOut,
          });
          
          if (result.state === 'red') {
            // INVALID MOVE - revert the piece
            console.warn('❌ [INVALID] Pending placement breaks solvability - reverting');
            console.log('🔄 [TURN DEBUG] Before advanceTurn (invalid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // IMMEDIATELY remove the piece from board (don't wait for modal)
            console.log('🗑️ [INVALID] Removing piece immediately:', pending.uid);
            deletePieceByUid(pending.uid);
            
            // Show invalid move modal (unless user chose "don't show again")
            if (localStorage.getItem(HIDE_INVALID_MOVE_MODAL_KEY) !== 'true') {
              setLastInvalidMoveUid(pending.uid); // For modal reference only
              setShowInvalidMove(true);
            }
            
            // Advance turn with NO points (turn penalty)
            advanceTurn();
            
            console.log('🔄 [TURN DEBUG] After advanceTurn (invalid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // Clear pending
            pendingPlacementRef.current = null;
            
            // Trigger computer's turn (if applicable)
            triggerComputerTurn();
            
          } else if (result.state === 'unknown') {
            // TIMEOUT - keep piece, award points (same as valid)
            console.log('⏱️ [TIMEOUT] Solvability check timed out - accepting move');
            
            // Track timeout for telemetry
            if (pending.playerId) {
              incrementSolvabilityTimeouts(pending.playerId);
            }
            
            // Award points and advance turn (same as valid move)
            handlePlacePiece({
              pieceId: pending.pieceId,
              orientationId: pending.orientationId,
              cells: pending.cells,
              uid: pending.uid,
            });
            
            // Clear pending
            pendingPlacementRef.current = null;
            
            // Trigger computer's turn (if applicable)
            triggerComputerTurn();
            
            // Show non-blocking toast notification
            setNotification('⏱️ Solvability check timed out — move accepted.');
            setNotificationType('info');
            console.log('⏱️ [TOAST] Solvability check timed out — move accepted.');
            
          } else {
            // VALID MOVE (green/orange) - complete the placement
            console.log('✅ [VALID] Pending placement is solvable - completing');
            console.log('🔄 [TURN DEBUG] Before handlePlacePiece (valid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // Award points and advance turn
            handlePlacePiece({
              pieceId: pending.pieceId,
              orientationId: pending.orientationId,
              cells: pending.cells,
              uid: pending.uid,
            });
            
            console.log('🔄 [TURN DEBUG] After handlePlacePiece (valid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // Clear pending
            pendingPlacementRef.current = null;
            
            // Check for game completion NOW (after scoring)
            if (result.emptyCellCount === 0) {
              console.log('🎉 All cells filled after validation - puzzle complete!');
              sounds.puzzleSolved();
              gameOverRef.current = true;
              
              if (isSoloMode) {
                const humanPlayer = session.players.find(p => !p.isComputer);
                endGame('manual', humanPlayer?.id || session.players[0].id);
              } else {
                // VS mode: Calculate scores from placedPieces (session state may be stale)
                // Each piece = 1 point, count by who placed it
                let humanPieces = 0;
                let computerPieces = 0;
                for (const piece of placedPieces) {
                  if ((piece as any).reason === 'computer') {
                    computerPieces++;
                  } else {
                    humanPieces++;
                  }
                }
                console.log('🏆 Final scores from pieces:', { human: humanPieces, computer: computerPieces });
                
                const humanPlayer = session.players.find(p => !p.isComputer);
                const computerPlayer = session.players.find(p => p.isComputer);
                
                if (humanPieces === computerPieces) {
                  console.log('🤝 Draw detected!');
                  endGame('manual', null); // Draw
                } else if (humanPieces > computerPieces) {
                  endGame('manual', humanPlayer?.id);
                } else {
                  endGame('manual', computerPlayer?.id);
                }
              }
              return; // Don't trigger computer turn - game is over
            }
            
            // Trigger computer's turn (if applicable)
            triggerComputerTurn();
          }
        } else if (result.state === 'red') {
          // SAFETY ASSERTION: RED state with no pending placement is a logic error
          console.error('🚨 [LOGIC ERROR] Board is RED (unsolvable) but no pending placement to revert!');
          console.error('This should never happen. Board state:', {
            placedCount: placedPieces.length,
            emptyCount: result.emptyCellCount,
            state: result.state,
          });
        }
        // Game continues - no early termination on RED state
      } catch (err) {
        console.error('❌ Solvability check failed:', err);
        if (!cancelled && !gameOverRef.current) setSolverResult(null);
      } finally {
        isCheckingSolvabilityRef.current = false;
      }
    };

    checkSolvability();

    return () => {
      cancelled = true;
    };
  }, [
    lastPlacementNonce, // ONLY trigger on actual placements
    pieceMode, // Re-check when mode changes
    firstPieceId, // Re-check when first piece is set (identical mode)
    // puzzle, session read inside but not deps to prevent loop from object recreation
  ]);

  // Monitor game completion and show result modal + AI wrap-up (only once per game)
  useEffect(() => {
    console.log('🎮 Completion check:', { 
      isComplete: session?.isComplete, 
      hasShownResultModal,
      willShow: session?.isComplete && !hasShownResultModal 
    });
    
    if (session?.isComplete && !hasShownResultModal) {
      console.log('🎉 Game completed! Showing result modal');
      // Only show VS result modal in VS mode, not solo mode
      if (!isSoloMode) {
        setShowResultModal(true);
      }
      setHasShownResultModal(true);

      const winner =
        session.winnerId &&
        session.players.find(p => p.id === session.winnerId);

      if (winner) {
        const winnerScore = session.scores[winner.id] ?? 0;
        const loserScore = session.players
          .filter(p => p.id !== winner.id)
          .map(p => session.scores[p.id] ?? 0)[0] ?? 0;
        
        addAIComment(
          `GG! ${winner.name} wins this match ${winnerScore}–${loserScore}.`
        );
      } else {
        addAIComment('We filled the board and ended in a draw. Nice game!');
      }
    }
  }, [session, hasShownResultModal, addAIComment, isSoloMode]);

  // Redirect shared links to gallery with modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isShared = params.get('shared') === 'true';
    if (isShared && puzzle) {
      navigate(`/gallery?puzzle=${puzzle.id}&shared=true`);
    }
  }, [puzzle, navigate]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading puzzle game...</p>
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Error loading puzzle: {error}</p>
        <button onClick={() => navigate('/gallery')} className="btn">
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* VS Game Header */}
      <ManualGameVSHeader
        onHowToPlay={() => setShowHowToPlay(true)}
        onOpenSettings={() => setShowVsEnvSettings(true)}
        onBackToHome={() => navigate('/')}
      />
      
      {/* Simple Top-Centered Score Display */}
      {session && !session.isComplete && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '12px',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '700',
            zIndex: 1000,
            userSelect: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
          }}
        >
          {session && (() => {
            const humanPlayer = session.players.find(p => !p.isComputer);
            const computerPlayer = session.players.find(p => p.isComputer);
            const userScore = humanPlayer ? (session.scores[humanPlayer.id] ?? 0) : 0;
            const computerScore = computerPlayer ? (session.scores[computerPlayer.id] ?? 0) : 0;
            
            // Format elapsed time as mm:ss
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (isSoloMode) {
              return (
                <>
                  <div>Score: {userScore}</div>
                  <div style={{ color: '#94a3b8' }}>|</div>
                  <div style={{ color: '#94a3b8' }}>⏱ {timeDisplay}</div>
                </>
              );
            } else {
              return (
                <>
                  <div style={{ color: '#fbbf24' }}>YOU: {userScore}</div>
                  <div style={{ color: '#cbd5e1' }}>—</div>
                  <div style={{ color: '#60a5fa' }}>COMPUTER: {computerScore}</div>
                </>
              );
            }
          })()}
        </div>
      )}

      {!session ? (
        <p style={{ padding: '2rem', textAlign: 'center' }}>Initializing game session...</p>
      ) : (
        <>
            <ManualGameBoard
              puzzle={puzzle}
              placedPieces={placedPieces}
              drawingCells={drawingCells}
              computerDrawingCells={computerDrawingCells}
              rejectedPieceCells={rejectedPieceCells}
              rejectedPieceId={rejectedPieceId}
              selectedPieceUid={selectedPieceUid}
              hidePlacedPieces={hidePlacedPieces}
              isHumanTurn={isHumanTurn}
              isGameComplete={!!session?.isComplete}
              hintCells={[]}
              pieceMode={pieceMode}
              envSettings={vsEnvSettings}
              onInteraction={handleInteraction}
            />


            {/* Collapsible Chat Panel */}
            <ChatDrawer isOpen={chatOpen} onToggle={setChatOpen}>
              <ManualGameChatPanel
                messages={chatMessages}
                isSending={chatIsSending}
                onSendMessage={sendUserMessage}
                onSendEmoji={sendEmoji}
              />
            </ChatDrawer>
          </>
        )}

        {/* Result modal */}
        {session && (
          <ManualGameResultModal
            session={session}
            isOpen={showResultModal}
            puzzleName={puzzle.name}
            elapsedSeconds={elapsedSeconds}
            onClose={() => {
              // Same logic as New Game button
              console.log('🔄 New Game button clicked - resetting game');
              cancelComputerTurn(); // Cancel any pending computer turn
              pendingPlacementRef.current = null; // Clear stale validation
              invalidateWitnessCache(); // Clear cache on reset
              setShowResultModal(false);
              setHasShownResultModal(false);
              setSolverResult(null);
              gameOverRef.current = false;
              lastMoveByPlayerIdRef.current = null;
              setFirstPieceId(null); // Reset first piece for identical mode
              resetBoard();
              resetSession();
              console.log('✅ Game reset complete');
            }}
          />
        )}

        <PlayInfoHubModal
          isOpen={showInfoHub}
          onClose={() => setShowInfoHub(false)}
          onOpenPuzzleDetails={() => setShowAboutPuzzle(true)}
          onOpenHowToPlay={() => setShowHowToPlay(true)}
        />

        <PlayAboutPuzzleModal
          isOpen={showAboutPuzzle}
          onClose={() => setShowAboutPuzzle(false)}
          puzzle={puzzle}
          cellsCount={placedPieces.reduce((sum, p) => sum + p.cells.length, 0)}
          pieces={DEFAULT_PIECE_LIST}
          placedCount={placedPieces.length}
          emptyCellsCount={0}
        />

        {isSoloMode ? (
          <PlayHowToSolveModal
            isOpen={showHowToPlay}
            onClose={() => setShowHowToPlay(false)}
            onDontShowAgain={() => {
              try {
                localStorage.setItem(HOW_TO_SOLVE_DISMISSED_KEY, 'true');
              } catch {
                // ignore
              }
              setShowHowToPlay(false);
            }}
          />
        ) : (
          <PlayHowToPlayModal
            isOpen={showHowToPlay}
            onClose={() => setShowHowToPlay(false)}
          />
        )}

        {/* VS Environment Settings Modal */}
        <PresetSelectorModal
          isOpen={showVsEnvSettings}
          currentPreset={vsCurrentPreset}
          onClose={() => setShowVsEnvSettings(false)}
          onSelectPreset={(settings, presetKey) => {
            setVsEnvSettings(settings);
            setVsCurrentPreset(presetKey);
            // Persist VS settings separately from Manual mode
            localStorage.setItem('studioSettings.vs', JSON.stringify(settings));
          }}
        />

        {/* Material Settings Modal (press S to toggle) */}
        <MaterialSettingsModal
          isOpen={showMaterialSettings}
          onClose={() => setShowMaterialSettings(false)}
          settings={vsEnvSettings}
          onSettingsChange={(settings) => {
            setVsEnvSettings(settings);
            localStorage.setItem('studioSettings.vs', JSON.stringify(settings));
          }}
          currentPreset={vsCurrentPreset}
          onPresetChange={setVsCurrentPreset}
        />

        {/* Bottom Controls */}
        {session && !session.isComplete && (
          <ManualGameBottomControls
            hidePlaced={hidePlacedPieces}
            onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
            onHint={handleHint}
            hintLoading={hintLoading}
            onNewGame={() => {
              console.log('🔄 New Game button clicked - resetting game');
              cancelComputerTurn(); // Cancel any pending computer turn
              pendingPlacementRef.current = null; // Clear stale validation
              invalidateWitnessCache(); // Clear cache on reset
              setHasShownResultModal(false);
              setSolverResult(null);
              gameOverRef.current = false;
              lastMoveByPlayerIdRef.current = null;
              setFirstPieceId(null); // Reset first piece for identical mode
              resetBoard();
              resetSession();
              console.log('✅ Game reset complete');
            }}
            pieceMode={pieceMode}
            onCycleMode={() => {
              // Cycle through modes: unique -> unlimited -> identical -> unique
              setPieceMode(prev => {
                if (prev === 'unique') return 'unlimited';
                if (prev === 'unlimited') return 'identical';
                return 'unique';
              });
              // Reset board - remove all placed pieces
              resetBoard();
              // Reset first piece when changing mode
              setFirstPieceId(null);
              // Reset timer
              setGameStartTime(null);
              setElapsedSeconds(0);
              // Reset solvability state
              setSolverResult(null);
              // Trigger solvability recheck
              setLastPlacementNonce(prev => prev + 1);
            }}
          />
        )}

        {/* Invalid Move Modal */}
        <InvalidMoveModal
          isOpen={showInvalidMove}
          onClose={handleInvalidMoveClose}
        />

        {/* Mode Violation Modal */}
        <ModeViolationModal
          isOpen={showModeViolation}
          onClose={(dontShowAgain) => {
            if (dontShowAgain) {
              localStorage.setItem(HIDE_MODE_VIOLATION_MODAL_KEY, 'true');
            }
            setShowModeViolation(false);
            setModeViolationPieceId(null);
          }}
          mode={pieceMode}
          attemptedPieceId={modeViolationPieceId}
          requiredPieceId={firstPieceId}
        />

        {/* Success Modal - Congratulations and Save Confirmation (Solo mode only) */}
        {/* VS mode uses ManualGameResultModal instead */}
        {showSuccessModal && isSoloMode && (
          <ManualSolveSuccessModal
            isOpen={showSuccessModal}
            onClose={() => setShowSuccessModal(false)}
            onViewLeaderboard={() => {
              setShowSuccessModal(false);
              if (puzzle?.id) {
                navigate(`/leaderboards/${puzzle.id}`);
              }
            }}
            solveSeconds={elapsedSeconds}
            moveCount={placedPieces.length}
            pieceCount={placedPieces.length}
            isRated={!isSoloMode} // Show score in VS mode
            ratedScore={session ? session.scores[session.players.find(p => !p.isComputer)?.id ?? ''] : undefined}
          />
        )}

    </div>
  );
};

export default ManualGamePage;
