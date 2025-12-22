import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { GameStatusModal } from './components/GameStatusModal';
import { ChatDrawer } from '../../components/ChatDrawer';
import { ManualGameChatPanel } from './components/ManualGameChatPanel';
import { ManualGameBottomControls } from './components/ManualGameBottomControls';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
import { useComputerTurn } from './hooks/useComputerTurn';
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { DEFAULT_PIECE_LIST } from './utils/manualSolveHelpers';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import type { IJK } from '../../types/shape';
import { 
  dlxCheckSolvable,
  dlxCheckSolvableEnhanced,
  invalidateWitnessCache,
  type DLXCheckInput,
  type EnhancedDLXCheckResult,
  type SolverState 
} from '../../engines/dlxSolver';
import '../../styles/manualGame.css';

export const ManualGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
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

  // Computer turn loop with animated piece placement
  useComputerTurn({
    session,
    hintInProgressRef, // Gate to prevent overlap during hint animation
    onComputerMove: () => {
      if (!session) return;
      if (session.isComplete) return;

      const current = session.players[session.currentPlayerIndex];
      if (!current.isComputer) return;

      // ✅ If generator isn't ready yet, just wait.
      if (!computerMoveReady) {
        console.log('⏳ Computer move generator not ready yet; waiting...');
        return;
      }

      const move = generateMove(placedPieces);

      if (move) {
        // Animate computer drawing cells one-by-one
        animateComputerMove(move, ({ pieceId, orientationId, cells, uid }) => {
          // Invalidate witness cache (required by hintEngine for consistency)
          invalidateWitnessCache();
          
          // Fix #1: Capture player ID BEFORE turn advances (for computer too)
          lastMoveByPlayerIdRef.current = session?.players[session.currentPlayerIndex]?.id ?? null;
          
          // Increment nonce to trigger solvability check
          setLastPlacementNonce(prev => prev + 1);
          
          // When animation finishes, apply scoring + turn via controller
          handlePlacePiece({
            source: 'computer',
            pieceId,
            orientationId,
            cells,
            uid,
          });

          // 👇 Add a small AI comment sometimes
          if (Math.random() < 0.4) {
            addAIComment(
              `Your turn. Let's see what you do with that ${pieceId} I just placed.`
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

  // Info Hub modal system (auto-show on first load)
  const [showInfoHub, setShowInfoHub] = useState(true);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAboutPuzzle, setShowAboutPuzzle] = useState(false);
  
  // Game Status modal
  const [showGameStatus, setShowGameStatus] = useState(false);

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(false); // Start closed by default

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
  } = useGameBoardLogic({
    hintInProgressRef, // Pass ref to block placement during hint animation
    onPiecePlaced: async ({ pieceId, orientationId, cells, uid }) => {
      if (!puzzle || !session) return;
      
      const containerCells: IJK[] = (puzzle as any).geometry || [];
      
      // ===== PRE-COMMIT VALIDATION =====
      
      // Step A: Check inventory availability
      const usedCount = placedCountByPieceId[pieceId] ?? 0;
      if (usedCount >= 1) {
        // Piece already used in one-of-each mode
        addAIComment(`You can't use ${pieceId} again - it's already been played!`);
        // DO NOT end turn, allow retry
        return;
      }
      
      // Step B: Geometry validation (already done in board logic before calling this)
      // If we reach here, geometry is valid
      
      // Step C: Solvability validation (landmine detection)
      const candidatePlacement = {
        pieceId,
        cells,
        uid: uid || `temp-${Date.now()}`,
      };
      
      const testPlaced = [...placedPieces, candidatePlacement];
      const testOccupied = new Set<string>();
      for (const p of testPlaced) {
        for (const c of p.cells) {
          testOccupied.add(`${c.i},${c.j},${c.k}`);
        }
      }
      const testEmpty = containerCells.filter(c => !testOccupied.has(`${c.i},${c.j},${c.k}`));
      
      // Build remaining pieces
      const testUsed = new Set(testPlaced.map(p => p.pieceId));
      const testRemaining = DEFAULT_PIECE_LIST
        .filter(pid => !testUsed.has(pid))
        .map(pid => ({ pieceId: pid, orientationId: 0 }));
      
      const dlxInput: DLXCheckInput = {
        containerCells,
        placedPieces: testPlaced.map((p, idx) => ({
          pieceId: p.pieceId,
          orientationId: orientationId || `${p.pieceId}-00`,
          anchorSphereIndex: idx,
          cells: p.cells,
          uid: p.uid,
        })),
        emptyCells: testEmpty,
        remainingPieces: testRemaining.map(pr => ({ ...pr, remaining: 1 })),
        mode: 'oneOfEach',
      };
      
      // Run solvability check
      const solvabilityResult = await dlxCheckSolvableEnhanced(dlxInput, {
        timeoutMs: 3000,
        emptyThreshold: 0, // Always check
      });
      
      // If puzzle becomes unsolvable, REJECT placement
      if (solvabilityResult.state === 'red') {
        console.warn('❌ [Landmine] Placement would make puzzle unsolvable - rejecting');
        addAIComment(`That ${pieceId} piece would make the puzzle unsolvable. You lose your turn!`);
        
        // Capture player ID BEFORE turn advances
        lastMoveByPlayerIdRef.current = session.players[session.currentPlayerIndex]?.id ?? null;
        
        // End turn with NO placement, NO points
        advanceTurn();
        return;
      }
      
      // ===== COMMIT PLACEMENT (Valid Move) =====
      
      // Invalidate witness cache
      invalidateWitnessCache();
      
      // Capture current player ID BEFORE turn advances
      lastMoveByPlayerIdRef.current = session.players[session.currentPlayerIndex]?.id ?? null;
      
      // Increment nonce to trigger solvability check display update
      setLastPlacementNonce(prev => prev + 1);
      
      // Commit placement with +1 point
      handlePlacePiece({
        pieceId,
        orientationId,
        cells,
        uid,
      });

      // 2) AI chat reaction (local, no OpenAI call)
      const totalCells =
        ((puzzle as any).geometry as any[] | undefined)?.length ?? 0;
      const filledAfterMove = placedPieces.length + 1; // we just placed one
      const fillRatio =
        totalCells > 0 ? filledAfterMove / totalCells : 0;

      // Comment every now and then: ~40% chance
      if (Math.random() < 0.4) {
        const basicComments = [
          `Nice placement with the ${pieceId} piece.`,
          `I saw that ${pieceId} drop. Interesting choice…`,
          `You're making that ${pieceId} work for you.`,
        ];

        const comment =
          basicComments[Math.floor(Math.random() * basicComments.length)];

        addAIComment(comment);
      }

      // Extra comment when board is getting full
      if (fillRatio > 0.7 && Math.random() < 0.5) {
        const percent = Math.round(fillRatio * 100);
        addAIComment(
          `The board is about ${percent}% full now. It's getting tight in here.`
        );
      }
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

  // Container cells for game end detection
  const containerCells: IJK[] = React.useMemo(
    () => ((puzzle as any)?.geometry as IJK[] | undefined) || [],
    [puzzle]
  );

  // In Koos "oneOfEach" mode, max pieces = min(inventory, shape capacity)
  const maxPieces = React.useMemo(() => {
    // DEFAULT_PIECE_LIST might be string[] or objects; extract ids robustly
    const ids = (DEFAULT_PIECE_LIST as any[]).map((p: any) => {
      if (typeof p === 'string') return p;
      if (p && typeof p.id === 'string') return p.id;
      if (p && typeof p.pieceId === 'string') return p.pieceId;
      return null;
    }).filter((x): x is string => typeof x === 'string' && x.length > 0);

    const inventoryMax = Math.max(1, ids.length);
    const shapeMax = containerCells.length > 0 ? Math.floor(containerCells.length / 4) : 1;

    return Math.max(1, Math.min(inventoryMax, shapeMax));
  }, [containerCells.length]);

  const piecesPlaced = placedPieces.length;


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
    
    hintInProgressRef.current = true;
    
    try {
      // Generate a valid move using computer logic
      const move = generateMove(placedPieces);
      
      if (!move) {
        addAIComment("I couldn't find a valid hint. Try placing a piece yourself!");
        return;
      }
      
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
        
        addAIComment(`Here's a hint: I placed the ${pieceId} piece for you. No points though!`);
      });
    } finally {
      hintInProgressRef.current = false;
    }
  }, [puzzle, session, isHumanTurn, placedPieces, generateMove, animateComputerMove, handlePlacePiece, addAIComment]);


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
        // No cells / no placements => unknown
        if (!containerCells.length || placedPieces.length === 0) {
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
          // Determine winner by score
          const sortedPlayers = [...session.players].sort((a, b) => 
            (session.scores[b.id] ?? 0) - (session.scores[a.id] ?? 0)
          );
          const winner = sortedPlayers[0];
          endGame('manual', winner.id);
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
          timeoutMs: 5000,
          emptyThreshold: 90,
        });
        if (cancelled) return;
        if (gameOverRef.current) return; // guard again after await

        // Store full solver result for Game Status modal
        setSolverResult(result);

        // Only RED ends the game (definitive unsolvable)
        if (result.state === 'red') {
          const loserId = lastMoveByPlayerIdRef.current;

          // If we can't safely attribute, do NOT guess—fail closed.
          if (!loserId) {
            console.warn('⚠️ Solver says RED (unsolvable), but loserId is null. Not ending game.');
            return;
          }

          const loser = session.players.find(p => p.id === loserId);
          const winner = session.players.find(p => p.id !== loserId);

          if (!loser || !winner) {
            console.warn('⚠️ Could not resolve winner/loser from session.players. Not ending game.');
            return;
          }

          addAIComment(`Game over! That last move made the puzzle unsolvable. ${winner.name} wins!`);

          // One-time latch before calling endGame
          gameOverRef.current = true;

          // Pass winnerId directly to endGame to avoid race condition
          endGame('manual', winner.id);
        }
        // GREEN and ORANGE never end the game
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
        onReset={() => {
          console.log('🔄 Reset button clicked - resetting game');
          invalidateWitnessCache(); // Clear cache on reset
          setHasShownResultModal(false);
          setSolverResult(null);
          gameOverRef.current = false;
          lastMoveByPlayerIdRef.current = null;
          resetBoard();
          resetSession();
          console.log('✅ Game reset complete');
        }}
        onHowToPlay={() => setShowInfoHub(true)}
        onOpenSettings={() => setShowVsEnvSettings(true)}
        onBackToHome={() => navigate('/')}
      />
      
      {/* Always-Visible Game Stats Panel */}
      {session && !session.isComplete && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            left: '20px',
            padding: '18px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #fef3c7 0%, #ddd6fe 50%, #bfdbfe 100%)',
            border: '3px solid #a78bfa',
            color: '#1e293b',
            fontSize: '13px',
            zIndex: 1000,
            userSelect: 'none',
            minWidth: '220px',
            boxShadow: '0 12px 40px rgba(139,92,246,0.25), 0 0 0 1px rgba(255,255,255,0.8) inset',
          }}
        >
          {/* Status Row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor:
                  solvabilityIndicator === 'green' ? '#22c55e' :
                  solvabilityIndicator === 'red' ? '#f43f5e' :
                  '#fb923c',
                marginRight: '10px',
                flexShrink: 0,
                boxShadow: solvabilityIndicator === 'green' ? '0 0 16px rgba(34,197,94,0.7)' :
                           solvabilityIndicator === 'red' ? '0 0 16px rgba(244,63,94,0.7)' :
                           '0 0 16px rgba(251,146,60,0.7)',
                border: '2px solid white',
              }}
            />
            <span style={{ 
              fontSize: '15px', 
              color: solvabilityIndicator === 'green' ? '#15803d' :
                     solvabilityIndicator === 'red' ? '#be123c' :
                     '#c2410c',
              fontWeight: '800',
              textTransform: 'uppercase', 
              letterSpacing: '0.1em',
            }}>
              {solvabilityIndicator === 'green' ? 'Solvable' :
               solvabilityIndicator === 'red' ? 'Unsolvable' :
               'Unknown'}
            </span>
          </div>

          {/* Progress */}
          <div style={{ marginBottom: '10px', padding: '10px', background: 'rgba(255,255,255,0.8)', borderRadius: '12px', border: '2px solid #a78bfa' }}>
            <div style={{ fontSize: '11px', color: '#7c3aed', marginBottom: '4px', fontWeight: '700', letterSpacing: '0.05em' }}>PROGRESS</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#4c1d95' }}>
              {piecesPlaced}<span style={{ color: '#a78bfa' }}>/</span>{maxPieces}
            </div>
          </div>

          {/* Solver Stats (always show structure) */}
          <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
            {/* Empty cells - always visible */}
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: '#2563eb', fontWeight: '700' }}>Empty:</span>{' '}
              <span style={{ color: '#1e293b', fontWeight: '600' }}>{solverResult?.emptyCellCount ?? containerCells.length}</span>
            </div>
            
            {/* Solutions - conditional */}
            {solverResult && !solverResult.thresholdSkipped && solverResult.solutionCount !== undefined && (
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#16a34a', fontWeight: '700' }}>Solutions:</span>{' '}
                <span style={{ color: '#1e293b', fontWeight: '600' }}>
                  {solverResult.solutionCount}{solverResult.solutionsCapped ? '+' : ''}
                </span>
              </div>
            )}
            
            {/* Search space - always visible */}
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: '#ea580c', fontWeight: '700' }}>Search space:</span>{' '}
              <span style={{ color: '#1e293b', fontWeight: '600' }}>
                {solverResult?.estimatedSearchSpace ?? '—'}
              </span>
            </div>
            
            {/* Valid moves - always visible */}
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: '#ca8a04', fontWeight: '700' }}>Valid moves:</span>{' '}
              <span style={{ color: '#1e293b', fontWeight: '600' }}>
                {solverResult?.validNextMoveCount ?? '—'}
              </span>
            </div>
            
            {/* Compute time - conditional */}
            {solverResult && !solverResult.thresholdSkipped && solverResult.computeTimeMs !== undefined && (
              <div style={{ marginBottom: '6px' }}>
                <span style={{ color: '#9333ea', fontWeight: '700' }}>Compute:</span>{' '}
                <span style={{ color: '#1e293b', fontWeight: '600' }}>{solverResult.computeTimeMs.toFixed(0)}ms</span>
              </div>
            )}
          </div>
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
              console.log('✅ Game reset complete');
            }}
          />
        )}

        {/* Game Status Modal */}
        <GameStatusModal
          isOpen={showGameStatus}
          onClose={() => setShowGameStatus(false)}
          solverResult={solverResult}
          session={session}
          piecesPlaced={piecesPlaced}
          maxPieces={maxPieces}
          puzzleName={puzzle.name}
        />

        {/* Play Info Hub Modal System */}
        {session && (
          <>
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
          </>
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

        {/* Bottom Controls */}
        {session && !session.isComplete && (
          <ManualGameBottomControls
            hidePlaced={hidePlacedPieces}
            onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
            onHint={handleHint}
            onSolvability={() => incrementSolvabilityChecks(session.players[session.currentPlayerIndex].id)}
            solvableStatus={
              solverResult?.state === 'green' ? 'solvable' :
              solverResult?.state === 'red' ? 'unsolvable' :
              'unknown'
            }
          />
        )}

    </div>
  );
};

export default ManualGamePage;
