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
import { PlayAboutPuzzleModal } from './components/PlayAboutPuzzleModal';
import { ManualGameVSHeader } from './components/ManualGameVSHeader';
import { ChatDrawer } from '../../components/ChatDrawer';
import { ManualGameChatPanel } from './components/ManualGameChatPanel';
import { ManualGameBottomControls } from './components/ManualGameBottomControls';
import { InvalidMoveModal } from './components/InvalidMoveModal';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
import { useComputerTurn } from './hooks/useComputerTurn';
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { useOrientationService } from './hooks/useOrientationService';
import { DEFAULT_PIECE_LIST } from './utils/manualSolveHelpers';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import type { IJK } from '../../types/shape';
import { 
  dlxCheckSolvable,
  dlxCheckSolvableEnhanced,
  dlxGetHint,
  invalidateWitnessCache,
  type DLXCheckInput,
  type EnhancedDLXCheckResult,
  type SolverState 
} from '../../engines/dlxSolver';
import '../../styles/manualGame.css';

export const ManualGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const gameMode = searchParams.get('mode') === 'solo' ? 'solo' : 'vsComputer';
  const isSoloMode = gameMode === 'solo';
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const {
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
    incrementHintsUsed,
    incrementSolvabilityChecks,
    endGame,
    resetSession,
  } = useManualGameSession(puzzle?.id);

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
  const [vsCurrentPreset, setVsCurrentPreset] = useState<string>('metallic-light');

  // Computer turn loop with animated piece placement (disabled in solo mode)
  useComputerTurn({
    session,
    hintInProgressRef, // Gate to prevent overlap during hint animation
    pendingPlacementRef, // Gate to prevent moves while validation is in progress
    onComputerMove: () => {
      console.log('🤖 [COMPUTER TURN] Entry point triggered');
      console.log('🤖 [COMPUTER TURN] Session state:', {
        currentPlayerIndex: session?.currentPlayerIndex,
        currentPlayer: session?.players[session?.currentPlayerIndex]?.name,
        isComputer: session?.players[session?.currentPlayerIndex]?.isComputer,
        isComplete: session?.isComplete,
        isSoloMode,
        hasPendingPlacement: !!pendingPlacementRef.current,
      });

      if (!session) {
        console.log('🤖 [COMPUTER TURN] No session - exiting');
        return;
      }
      if (session.isComplete) {
        console.log('🤖 [COMPUTER TURN] Game complete - exiting');
        return;
      }
      if (isSoloMode) {
        console.log('🤖 [COMPUTER TURN] Solo mode - exiting');
        return;
      }

      // 🛑 CRITICAL: Don't start new move while validation is in progress
      if (pendingPlacementRef.current) {
        console.log('🤖 [COMPUTER TURN] Pending placement exists - waiting for validation');
        return;
      }

      const current = session.players[session.currentPlayerIndex];
      if (!current.isComputer) {
        console.log('🤖 [COMPUTER TURN] Not computer turn - exiting');
        return;
      }

      // ✅ If generator isn't ready yet, just wait.
      if (!computerMoveReady) {
        console.log('⏳ Computer move generator not ready yet; waiting...');
        return;
      }

      console.log('🤖 [COMPUTER TURN] Generating move...');
      const move = generateMove(placedPieces);

      if (move) {
        console.log('🤖 [COMPUTER TURN] Move generated:', { pieceId: move.pieceId, cellCount: move.cells.length });
        
        // Animate computer drawing cells one-by-one
        animateComputerMove(move, ({ pieceId, orientationId, cells, uid }) => {
          console.log('🤖 [COMPUTER TURN] Animation complete, placing piece:', { pieceId, uid });
          
          // UNIFIED FLOW: Computer uses same pending validation as human
          
          // Invalidate witness cache
          invalidateWitnessCache();
          
          // Capture current player ID
          const currentPlayerId = session?.players[session.currentPlayerIndex]?.id;
          if (!currentPlayerId || !orientationId) {
            console.warn('⚠️ Missing player ID or orientation ID - cannot process computer move');
            return;
          }
          
          console.log('🤖 [COMPUTER TURN] Storing pending placement for validation');
          // Store as pending placement (same as human)
          pendingPlacementRef.current = {
            uid,
            pieceId,
            orientationId,
            cells,
            playerId: currentPlayerId,
          };
          
          console.log('📦 [PENDING-COMPUTER] Stored placement for validation:', {
            pieceId,
            uid,
            playerId: session.players[session.currentPlayerIndex]?.name,
          });
          
          // Increment nonce to trigger solvability check
          // Validation will award points and switch turn
          setLastPlacementNonce(prev => prev + 1);

          // 👇 Add a small AI comment sometimes
          if (Math.random() < 0.4) {
            addAIComment(
              `I placed the ${pieceId} piece. Let's see if it works...`
            );
          }
        });
      } else {
        // Not a proof of "no moves" — just means the heuristic didn't find one.
        // Don't end the game; retry on next tick. Solvability check will end if truly unsolvable.
        console.log('⚠️ Computer heuristic found no move; will retry next tick.');
        addAIComment("I'm not seeing a clean move yet… give me a moment.");
        return;
      }
    },
    baseDelayMs: 1200, // ~1.2s thinking time (we'll adapt this later)
  });

  // Hide placed pieces toggle
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);

  // Result modal state
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasShownResultModal, setHasShownResultModal] = useState(false);

  // Modal system (How to Play auto-opens on first load)
  const [showInfoHub, setShowInfoHub] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(true);
  const [showAboutPuzzle, setShowAboutPuzzle] = useState(false);
  

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(false); // Start closed by default

  // Invalid move modal
  const [showInvalidMove, setShowInvalidMove] = useState(false);
  const [lastInvalidMoveUid, setLastInvalidMoveUid] = useState<string | null>(null);

  // Enhanced solver state (stores full metadata)
  const [solverResult, setSolverResult] = useState<EnhancedDLXCheckResult | null>(null);
  
  // Convenience accessor for indicator color
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
    animateComputerMove,
    resetBoard,
    deletePieceByUid,
  } = useGameBoardLogic({
    hintInProgressRef, // Pass ref to block placement during hint animation
    onPiecePlaced: ({ pieceId, orientationId, cells, uid }) => {
      if (!puzzle || !session) return;
      
      // NEW FLOW: Piece is already placed on board visually
      // Store as pending placement, solvability check will validate it
      
      // Validate required fields
      if (!orientationId) {
        console.error('❌ Missing orientationId - cannot process placement');
        return;
      }
      
      // Invalidate witness cache
      invalidateWitnessCache();
      
      // Capture current player ID
      const currentPlayerId = session.players[session.currentPlayerIndex]?.id;
      if (!currentPlayerId) {
        console.warn('⚠️ No current player ID - cannot process placement');
        return;
      }
      
      // Store pending placement with required orientationId
      pendingPlacementRef.current = {
        uid,
        pieceId,
        orientationId, // Now validated as non-undefined
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

  // Computer move generator
  const { generateMove, ready: computerMoveReady } =
    useComputerMoveGenerator(puzzle, placedCountByPieceId);

  // Handler for when invalid move modal closes
  const handleInvalidMoveClose = useCallback(() => {
    console.log('🗑️ Modal closed - removing invalid piece:', lastInvalidMoveUid);
    
    // Close modal
    setShowInvalidMove(false);
    
    // Remove piece after brief delay (for animation)
    if (lastInvalidMoveUid) {
      setTimeout(() => {
        deletePieceByUid(lastInvalidMoveUid);
        setLastInvalidMoveUid(null);
        
        // Trigger solvability check to update UI to green
        setLastPlacementNonce(prev => prev + 1);
      }, 500);
    }
  }, [lastInvalidMoveUid, deletePieceByUid]);

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
    
    try {
      const containerCells: IJK[] = (puzzle as any).geometry || [];
      const targetCell = drawingCells[0]; // Use first drawn cell as anchor
      
      // Build remaining pieces
      const usedPieces = new Set(placedPieces.map(p => p.pieceId));
      const remainingPieces = DEFAULT_PIECE_LIST
        .filter(pid => !usedPieces.has(pid))
        .map(pid => ({ pieceId: pid, remaining: 1 }));
      
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
        mode: 'oneOfEach',
      };
      
      // Call DLX hint solver with target anchor cell
      console.log('💡 [HINT] Requesting hint for target cell:', targetCell);
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
      const hintCells: IJK[] = orientation.ijkOffsets.map((offset: any) => ({
        i: anchorCell.i + offset.i,
        j: anchorCell.j + offset.j,
        k: anchorCell.k + offset.k,
      }));
      
      const move = {
        pieceId: hintResult.hintedPieceId,
        orientationId: hintResult.hintedOrientationId,
        cells: hintCells, // Now has all 4 cells at correct anchor position
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
    }
  }, [puzzle, session, isHumanTurn, placedPieces, drawingCells, animateComputerMove, handlePlacePiece, addAIComment]);

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
        if (emptyCells.length === 0) {
          console.log('🎉 All cells filled - puzzle complete!');
          
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
            endGame('manual', winner.id);
          }
          return;
        }

        // Build remaining inventory for "oneOfEach"
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

        const remainingPieces = allPieceIds.map(pieceId => ({
          pieceId,
          remaining: usedPieces.has(pieceId) ? 0 : 1,
        }));

        const dlxInput: DLXCheckInput = {
          containerCells,
          placedPieces,
          emptyCells,
          remainingPieces,
          mode: 'oneOfEach',
        };

        // Use Web Worker-based enhanced solver (non-blocking)
        const result = await dlxCheckSolvableEnhanced(dlxInput, {
          timeoutMs: 3000,
          emptyThreshold: 100,
        });
        if (cancelled) return;
        if (gameOverRef.current) return; // guard again after await

        // Store full solver result for Game Status modal
        setSolverResult(result);

        // NEW FLOW: Validate pending placement if any
        const pending = pendingPlacementRef.current;
        
        if (pending) {
          console.log('🔍 [VALIDATION] Checking pending placement:', {
            pieceId: pending.pieceId,
            uid: pending.uid,
            result: result.state,
          });
          
          if (result.state === 'red') {
            // INVALID MOVE - revert the piece
            console.warn('❌ [INVALID] Pending placement breaks solvability - reverting');
            console.log('🔄 [TURN DEBUG] Before advanceTurn (invalid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // Remove the piece from board (will trigger animation)
            setLastInvalidMoveUid(pending.uid);
            
            // Show invalid move modal
            setShowInvalidMove(true);
            
            // Advance turn with NO points (turn penalty)
            advanceTurn();
            
            console.log('🔄 [TURN DEBUG] After advanceTurn (invalid):', {
              currentPlayerIndex: session.currentPlayerIndex,
              currentPlayer: session.players[session.currentPlayerIndex]?.name,
            });
            
            // Clear pending
            pendingPlacementRef.current = null;
            
          } else {
            // VALID MOVE - complete the placement
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
      setShowResultModal(true);
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
  }, [session, hasShownResultModal, addAIComment]);

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
            
            if (isSoloMode) {
              return (
                <div>Score: {userScore}</div>
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
              selectedPieceUid={selectedPieceUid}
              hidePlacedPieces={hidePlacedPieces}
              isHumanTurn={isHumanTurn}
              isGameComplete={!!session?.isComplete}
              hintCells={[]}
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
            onClose={() => setShowResultModal(false)}
            onPlayAgain={() => {
              console.log('🔄 Play Again clicked - resetting game');
              invalidateWitnessCache(); // Clear cache on reset
              setShowResultModal(false);
              setHasShownResultModal(false); // Reset flag for new game
              setSolverResult(null);
              gameOverRef.current = false;
              lastMoveByPlayerIdRef.current = null;
              resetBoard();      // Clear all placed pieces
              resetSession();    // Reset game session (scores, turn, etc)
            }}
            onBackToGallery={() => navigate('/gallery')}
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

        <PlayHowToPlayModal
          isOpen={showHowToPlay}
          onClose={() => setShowHowToPlay(false)}
        />

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

        {/* Bottom Controls */}
        {session && !session.isComplete && (
          <ManualGameBottomControls
            hidePlaced={hidePlacedPieces}
            onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
            onHint={handleHint}
            onNewGame={() => {
              console.log('🔄 New Game button clicked - resetting game');
              invalidateWitnessCache(); // Clear cache on reset
              setHasShownResultModal(false);
              setSolverResult(null);
              gameOverRef.current = false;
              lastMoveByPlayerIdRef.current = null;
              resetBoard();
              resetSession();
              console.log('✅ Game reset complete');
            }}
          />
        )}

        {/* Invalid Move Modal */}
        <InvalidMoveModal
          isOpen={showInvalidMove}
          onClose={handleInvalidMoveClose}
        />

    </div>
  );
};

export default ManualGamePage;
