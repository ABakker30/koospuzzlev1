import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useManualGameSession } from './hooks/useManualGameSession';
import { useGameTurnController } from './hooks/useGameTurnController';
import { ManualGameBoard } from './components/ManualGameBoard';
import { ManualGameResultModal } from './components/ManualGameResultModal';
import { ManualGameHowToPlayModal } from './components/ManualGameHowToPlayModal';
import { ManualGameVSHeader } from './components/ManualGameVSHeader';
import { ManualGameBottomControls } from './components/ManualGameBottomControls';
import { FloatingScore } from '../../components/FloatingScore';
import { ChatDrawer } from '../../components/ChatDrawer';
import { ManualGameChatPanel } from './components/ManualGameChatPanel';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
import { useComputerTurn } from './hooks/useComputerTurn';
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { useHintSystem } from './hooks/useHintSystem';
import { useSolvabilityCheck } from './hooks/useSolvabilityCheck';
import { useOrientationService } from './hooks/useOrientationService';
import { findFirstMatchingPiece } from './utils/manualSolveMatch';
import { DEFAULT_PIECE_LIST } from './utils/manualSolveHelpers';
import type { IJK } from '../../types/shape';
import '../../styles/manualGame.css';

// 🔄 HintTx Architecture - Single source of truth for hint transactions
type HintTxStatus = 'idle' | 'solving' | 'preview' | 'committing' | 'failed';

type HintResult = {
  pieceId: string;
  orientationId: string;
  cells: IJK[];
};

type HintTx = {
  id: string;
  targetCell: IJK;
  requestedAt: number;
  status: HintTxStatus;
  result?: HintResult;
  error?: string;
};

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
    handleRemovePiece,
    handleHint,
    handleSolvabilityCheck,
  } = useGameTurnController({
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
    incrementHintsUsed,
    incrementSolvabilityChecks,
  });

  // 🔄 HintTx - Single source of truth for hint state
  const [hintTx, setHintTx] = useState<HintTx | null>(null);
  const hintTxRef = useRef<HintTx | null>(null);
  useEffect(() => {
    hintTxRef.current = hintTx;
  }, [hintTx]);
  
  const hintActive = hintTx?.status === 'solving' || hintTx?.status === 'preview' || hintTx?.status === 'committing';
  
  // Legacy ref for computer turn gate (will use hintActive)
  const hintInProgressRef = useRef(false);
  useEffect(() => {
    hintInProgressRef.current = hintActive;
  }, [hintActive]);

  // Computer turn loop with animated piece placement
  useComputerTurn({
    session,
    hintInProgressRef, // Gate to prevent overlap during hint animation
    onComputerMove: () => {
      if (!session) return;
      const current = session.players[session.currentPlayerIndex];
      if (!current.isComputer) return;

      let move = null;

      if (computerMoveReady) {
        move = generateMove(placedPieces);
      }

      if (move) {
        // Animate computer drawing cells one-by-one
        animateComputerMove(move, ({ pieceId, orientationId, cells, uid }) => {
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
        // Fallback: no geometrical move found — just score-only for now
        handlePlacePiece({
          source: 'computer',
          noBoardMove: true,
        });

        if (Math.random() < 0.5) {
          addAIComment(
            "That board is almost out of room… I couldn't find a good spot."
          );
        }
      }
    },
    baseDelayMs: 1200, // ~1.2s thinking time (we'll adapt this later)
  });

  // Hide placed pieces toggle
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);

  // Result modal state
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasShownResultModal, setHasShownResultModal] = useState(false);

  // How to play modal state (auto-show on first load)
  const [showHowToPlay, setShowHowToPlay] = useState(true);

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(false); // Start closed by default

  // (Old flags removed - now using hintTx as single source of truth)

  // Solvability check state
  const [solvableStatus, setSolvableStatus] = useState<'unknown' | 'checking' | 'solvable' | 'unsolvable'>('unknown');

  // Determine if it's the human's turn
  const currentPlayer =
    session && session.players[session.currentPlayerIndex];
  const isHumanTurn = !!currentPlayer && !currentPlayer.isComputer && !session?.isComplete;

  // Board logic: human drawing & placement
  const {
    placedPieces,
    placedMap,
    placedCountByPieceId,
    drawingCells,
    clearDrawing,
    selectedPieceUid,
    handleInteraction,
    computerDrawingCells,
    animateComputerMove,
    animateUserHintMove,
    undoLastPlacement,
    resetBoard,
  } = useGameBoardLogic({
    hintInProgressRef, // Pass ref to block placement during hint animation
    onPiecePlaced: ({ pieceId, orientationId, cells }) => {
      // 1) Normal scoring/turn handling
      handlePlacePiece({
        pieceId,
        orientationId,
        cells,
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
    onPieceRemoved: ({ pieceId, uid }) => {
      handleRemovePiece({
        pieceId,
        uid,
        source: 'human',
      });
    },
    isHumanTurn,
  });

  // Computer move generator
  const { generateMove, ready: computerMoveReady } =
    useComputerMoveGenerator(puzzle, placedCountByPieceId);

  // Orientation service for matching hint cells to pieces
  const {
    service: orientationService,
    loading: orientationsLoading,
  } = useOrientationService();

  // Container cells for hint system and game end detection
  const containerCells: IJK[] = React.useMemo(
    () => ((puzzle as any)?.geometry as IJK[] | undefined) || [],
    [puzzle]
  );

  // Hint system (reused from Manual Solve) - wired exactly like Manual Solve
  const {
    hintCells,
    hintsUsed: _hintsUsedFromHook,
    handleRequestHint: handleRequestHintBase,
  } = useHintSystem({
    puzzle,
    cells: containerCells,
    mode: 'oneOfEach',           // vs mode uses one-of-each
    placed: placedMap,           // raw Map from useGameBoardLogic
    activePiece: '',             // not used in oneOfEach mode
    orientationService,          // 👈 FIXED: pass actual service, not null!
    placePiece: () => {},        // we manage placement ourselves
    setNotification: () => {},   // vs mode can skip popups for now
    setNotificationType: () => {},
  });

  // Solvability check system (VS mode uses chat comments instead of notifications)
  const { handleRequestSolvability } = useSolvabilityCheck({
    puzzle,
    cells: containerCells,
    mode: 'oneOfEach',
    placed: placedMap,
    activePiece: '',
    setSolvableStatus,
    setNotification: () => {}, // No-op: VS mode uses chat
    setNotificationType: () => {}, // No-op: VS mode uses chat
    onCheckComplete: (isSolvable) => {
      // Call turn controller with result
      handleSolvabilityCheck({
        source: 'human',
        isSolvable,
      });

      if (isSolvable === false) {
        // Bad move - undo last placement
        undoLastPlacement();
        addAIComment("Ouch! That last move made the puzzle unsolvable. I've removed it. Try again!");
      } else {
        addAIComment("Good call checking solvability - the puzzle is still solvable.");
      }
    },
  });

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
  } = useGameChat(getGameContext);

  // Wrappers for hint/solvability actions with AI chat reactions
  // 🔄 STEP 3: Start hint transaction
  const startHintTx = React.useCallback(async () => {
    console.log('🔍 [HINT] startHintTx called', {
      isHumanTurn,
      orientationsLoading,
      hasOrientationService: !!orientationService,
      drawingCellsCount: drawingCells.length,
      hintTxStatus: hintTxRef.current?.status ?? 'null',
    });

    // Gate: only one hint transaction at a time
    if (hintTxRef.current && hintTxRef.current.status !== 'failed') {
      console.log('⚠️ [HINT] Blocked: hint transaction already active', { status: hintTxRef.current.status });
      return;
    }

    if (!isHumanTurn) {
      console.log('⚠️ [HINT] Blocked: not human turn');
      return;
    }
    if (orientationsLoading || !orientationService) {
      console.log('⚠️ [HINT] Blocked: orientations loading or service not ready');
      addAIComment('Loading piece orientations, please try again in a moment.');
      return;
    }
    if (drawingCells.length === 0) {
      addAIComment('Double-click a cell to choose a hint target.');
      return;
    }

    const targetCell = drawingCells[0];
    const id = `hint-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    console.log('🟦 [HINT] Tx start', { id, targetCell });

    // Single source of truth begins here:
    setHintTx({
      id,
      targetCell,
      requestedAt: Date.now(),
      status: 'solving',
    });

    // Clear drawing once hint starts
    clearDrawing();

    // Pass the target cell explicitly
    await handleRequestHintBase([targetCell]);

    console.log('✅ [HINT] Solver request finished (await returned)', { id });
  }, [
    isHumanTurn,
    orientationsLoading,
    orientationService,
    drawingCells,
    clearDrawing,
    handleRequestHintBase,
    addAIComment,
  ]);

  const handleUserSolvabilityCheck = () => {
    if (!isHumanTurn) return;
    addAIComment("Let me check if this position is still solvable...");
    handleRequestSolvability();
  };

  // 🔄 STEP 4: HintTx-driven effect
  useEffect(() => {
    const tx = hintTx;
    if (!tx) return;

    console.log('🔄 [HINT-TX] effect', {
      id: tx.id,
      status: tx.status,
      hintCellsLength: hintCells?.length ?? 'null',
    });

    // Only react while solving
    if (tx.status !== 'solving') return;

    // Wait for solver
    if (hintCells == null) return;

    // Solver finished but no hint
    if (hintCells.length === 0) {
      setHintTx({ ...tx, status: 'failed', error: 'No hint found' });
      addAIComment("I couldn't find a good hint there. This position is tough.");
      return;
    }

    // Must have orientation service
    if (!orientationService) {
      setHintTx({ ...tx, status: 'failed', error: 'Orientation service missing' });
      return;
    }

    // Identify piece/orientation from returned cells
    const match = findFirstMatchingPiece(hintCells, DEFAULT_PIECE_LIST, orientationService);
    if (!match) {
      setHintTx({ ...tx, status: 'failed', error: 'No matching piece' });
      addAIComment("I tried to hint a piece, but nothing matched a valid Koos piece there.");
      return;
    }

    // Optional invariant: hinted cells should include the target cell
    const key = (c: IJK) => `${c.i},${c.j},${c.k}`;
    const targetKey = key(tx.targetCell);
    const coversTarget = hintCells.some(c => key(c) === targetKey);
    if (!coversTarget) {
      // This is the "architectural truth" check.
      console.error('❌ [HINT-TX] Hint does not cover target', { targetCell: tx.targetCell, hintCells });
      setHintTx({ ...tx, status: 'failed', error: 'Hint does not cover target' });
      addAIComment("That hint didn't match your selected cell. Try another cell.");
      return;
    }

    // Move tx to preview with a canonical result payload
    const result: HintResult = {
      pieceId: match.pieceId,
      orientationId: match.orientationId,
      cells: hintCells,
    };

    console.log('✅ [HINT-TX] Solved => preview', { id: tx.id, result });

    setHintTx({ ...tx, status: 'preview', result });

    // Start your animation using the canonical payload
    animateUserHintMove(result, ({ uid }) => {
      const latest = hintTxRef.current;
      if (!latest || latest.id !== tx.id || latest.status !== 'preview' || !latest.result) {
        console.warn('⚠️ [HINT-TX] Commit aborted: tx changed', { latest });
        return;
      }

      // Commit using the canonical payload (single source of truth)
      setHintTx({ ...latest, status: 'committing' });

      handlePlacePiece({
        source: 'human_hint',
        pieceId: latest.result.pieceId,
        orientationId: latest.result.orientationId,
        cells: latest.result.cells,
        uid,
      });

      handleHint({ source: 'human' });
      addAIComment(`Using a hint with ${latest.result.pieceId}? Fair move. Let's see what you do next.`);

      // Clear tx (also clears gold preview)
      setHintTx(null);
    });
  }, [
    hintTx,
    hintCells,
    orientationService,
    animateUserHintMove,
    handlePlacePiece,
    handleHint,
    addAIComment,
  ]);

  // Detect game end: no more moves possible
  useEffect(() => {
    if (!puzzle || !session || session.isComplete) return;
    if (!containerCells.length) return;

    const occupied = new Set<string>();
    for (const p of placedPieces) {
      for (const c of p.cells) {
        occupied.add(`${c.i},${c.j},${c.k}`);
      }
    }

    const emptyCells = containerCells.filter(
      c => !occupied.has(`${c.i},${c.j},${c.k}`)
    );

    // If fewer than 4 empty cells remain, no 4-cell piece can be placed
    if (emptyCells.length < 4) {
      console.log(`🏁 Game ending - only ${emptyCells.length} empty cells left`);
      endGame('noMoves');
    }
  }, [puzzle, session, placedPieces, containerCells, endGame]);

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

  // Get scores for header
  const humanPlayer = session?.players.find(p => !p.isComputer);
  const computerPlayer = session?.players.find(p => p.isComputer);
  const userScore = humanPlayer ? (session?.scores[humanPlayer.id] ?? 0) : 0;
  const computerScore = computerPlayer ? (session?.scores[computerPlayer.id] ?? 0) : 0;

  return (
    <div className="page-container">
      {/* VS Game Header */}
      <ManualGameVSHeader
        onReset={() => {
          console.log('🔄 Reset button clicked - resetting game');
          setHasShownResultModal(false);
          resetBoard();
          resetSession();
          console.log('✅ Game reset complete');
        }}
        onHowToPlay={() => setShowHowToPlay(true)}
        onBackToHome={() => navigate('/')}
      />
      
      {/* Floating Score Display */}
      {session && (
        <FloatingScore
          userScore={userScore}
          computerScore={computerScore}
        />
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
              hintCells={
                hintTx?.status === 'preview' || hintTx?.status === 'committing'
                  ? (hintTx.result?.cells ?? [])
                  : []
              }
              onInteraction={handleInteraction}
            />

            {/* Bottom Controls */}
            <ManualGameBottomControls
              hidePlaced={hidePlacedPieces}
              onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
              onHint={startHintTx}
              onSolvability={handleUserSolvabilityCheck}
              solvableStatus={solvableStatus}
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
              setShowResultModal(false);
              setHasShownResultModal(false); // Reset flag for new game
              resetBoard();      // Clear all placed pieces
              resetSession();    // Reset game session (scores, turn, etc)
              console.log('✅ Game reset complete');
            }}
          />
        )}

        {/* How to play modal */}
        {session && (
          <ManualGameHowToPlayModal
            isOpen={showHowToPlay}
            onClose={() => setShowHowToPlay(false)}
          />
        )}

    </div>
  );
};

export default ManualGamePage;
