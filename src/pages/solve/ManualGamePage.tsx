import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useManualGameSession } from './hooks/useManualGameSession';
import { useGameTurnController } from './hooks/useGameTurnController';
import { ManualGameBoard } from './components/ManualGameBoard';
import { ManualGameResultModal } from './components/ManualGameResultModal';
import { ManualGameHowToPlayModal } from './components/ManualGameHowToPlayModal';
import { ManualGameVSHeader } from './components/ManualGameVSHeader';
import { ChatDrawer } from '../../components/ChatDrawer';
import { FloatingScore } from '../../components/FloatingScore';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
import { useComputerTurn } from './hooks/useComputerTurn';
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { useHintSystem } from './hooks/useHintSystem';
import { useSolvabilityCheck } from './hooks/useSolvabilityCheck';
import { useOrientationService } from './hooks/useOrientationService';
import { ManualGameChatPanel } from './components/ManualGameChatPanel';
import { findFirstMatchingPiece } from './utils/manualSolveMatch';
import { DEFAULT_PIECE_LIST } from './utils/manualSolveHelpers';
import type { IJK } from '../../types/shape';
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

  // Computer turn loop with animated piece placement
  useComputerTurn({
    session,
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

  // How to play modal state (auto-show on first load)
  const [showHowToPlay, setShowHowToPlay] = useState(true);

  // Chat drawer state
  const [chatOpen, setChatOpen] = useState(true); // Start open by default

  // Hint placement flag (for useEffect pattern)
  const [pendingHintPlacement, setPendingHintPlacement] = useState(false);
  const [hintInProgress, setHintInProgress] = useState(false);
  
  // Timeout to reset stuck hint state (10 seconds)
  useEffect(() => {
    if (!pendingHintPlacement) return;
    
    console.log('⏰ [HINT] Setting 10s timeout to clear pendingHintPlacement');
    const timeoutId = setTimeout(() => {
      console.log('⚠️ [HINT] Timeout reached - clearing stuck pendingHintPlacement flag');
      setPendingHintPlacement(false);
      setHintInProgress(false);
    }, 10000);
    
    return () => {
      console.log('🧹 [HINT] Clearing timeout');
      clearTimeout(timeoutId);
    };
  }, [pendingHintPlacement]);

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
    useComputerMoveGenerator(puzzle);

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
  const handleUserHint = React.useCallback(async () => {
    console.log('🔍 [HINT] handleUserHint called', {
      pendingHintPlacement,
      isHumanTurn,
      orientationsLoading,
      hasOrientationService: !!orientationService,
      drawingCellsCount: drawingCells.length
    });

    if (pendingHintPlacement) {
      console.log('⚠️ [HINT] Blocked: pendingHintPlacement is already true');
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

    console.log('✅ [HINT] Starting hint request');
    setPendingHintPlacement(true);
    clearDrawing();
    await handleRequestHintBase(drawingCells);
    console.log('✅ [HINT] Hint request completed');
  }, [pendingHintPlacement, isHumanTurn, orientationsLoading, orientationService, clearDrawing, handleRequestHintBase, drawingCells, addAIComment]);

  const handleUserSolvabilityCheck = () => {
    if (!isHumanTurn) return;
    addAIComment("Let me check if this position is still solvable...");
    handleRequestSolvability();
  };

  // Consume hint cells when ready and place the hint piece
  useEffect(() => {
    console.log('🔄 [HINT-EFFECT] useEffect triggered', {
      pendingHintPlacement,
      hintInProgress,
      hintCellsLength: hintCells?.length ?? 'null',
      hasOrientationService: !!orientationService
    });

    // only act if: hint requested AND not already animating one
    if (!pendingHintPlacement || hintInProgress) {
      if (!pendingHintPlacement) {
        console.log('⏭️ [HINT-EFFECT] Skip: no pending hint placement');
      } else if (hintInProgress) {
        console.log('⏭️ [HINT-EFFECT] Skip: hint animation already in progress');
      }
      return;
    }
    
    if (!orientationService) {
      console.log('⏭️ [HINT-EFFECT] Skip: no orientation service');
      return;
    }

    // 1) solver still running
    if (hintCells == null) {
      console.log('⏳ [HINT-EFFECT] Waiting: solver still running (hintCells is null)');
      return; // ⬅️ don't clear pending, just wait for next update
    }

    // 2) solver finished but no hint found
    if (hintCells.length === 0) {
      console.log('❌ [HINT-EFFECT] No hint found, clearing flags');
      // CRITICAL: Clear both flags immediately
      setPendingHintPlacement(false);
      setHintInProgress(false);
      addAIComment(
        "I couldn't find a good hint there. This position is tough."
      );
      return;
    }

    // 3) we have real cells – identify the piece
    console.log('🎯 [HINT-EFFECT] Found hint cells, matching piece...', { cells: hintCells });
    const match = findFirstMatchingPiece(hintCells, DEFAULT_PIECE_LIST, orientationService);
    if (!match) {
      console.log('❌ [HINT-EFFECT] No matching piece found');
      // CRITICAL: Clear both flags immediately
      setPendingHintPlacement(false);
      setHintInProgress(false);
      addAIComment(
        "I tried to hint a piece, but nothing matched a valid Koos piece there."
      );
      return;
    }

    console.log('✅ [HINT-EFFECT] Matched piece:', { pieceId: match.pieceId, orientationId: match.orientationId });

    const move = {
      pieceId: match.pieceId,
      orientationId: match.orientationId,
      cells: hintCells,
    };

    // 👇 consume the flag & mark animation in progress RIGHT AWAY
    console.log('🎬 [HINT-EFFECT] Starting animation, setting flags');
    setPendingHintPlacement(false);
    setHintInProgress(true);

    // 4) animate: gold draw → place → then flip turn ONCE
    animateUserHintMove(move, ({ pieceId, orientationId, cells, uid }) => {
      console.log('🎬 [HINT-EFFECT] Animation completed, placing piece');
      
      // place geometry (no score / no turn here)
      handlePlacePiece({
        source: 'human_hint',   // special case – no score/turn
        pieceId,
        orientationId,
        cells,
        uid,
      });

      // mark hint usage + advance turn ONCE
      handleHint({ source: 'human' });

      // AI reaction
      addAIComment(
        `Using a hint with ${pieceId}? Fair move. Let's see what you do next.`
      );

      console.log('✅ [HINT-EFFECT] Hint complete, clearing hintInProgress flag');
      setHintInProgress(false);
    });
  }, [
    pendingHintPlacement,
    hintInProgress,
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
      endGame('noMoves');
    }
  }, [puzzle, session, placedPieces, containerCells, endGame]);

  // Monitor game completion and show result modal + AI wrap-up
  useEffect(() => {
    if (session?.isComplete && !showResultModal) {
      setShowResultModal(true);

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
  }, [session, showResultModal, addAIComment]);

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
      {/* VS Game Header with Controls */}
      <ManualGameVSHeader
        hidePlaced={hidePlacedPieces}
        onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
        onHint={handleUserHint}
        onSolvability={handleUserSolvabilityCheck}
        solvableStatus={solvableStatus}
        onReset={() => {
          resetBoard();
          resetSession();
        }}
        onHowToPlay={() => setShowHowToPlay(true)}
        onBackToManual={() => navigate(`/manual/${puzzle.id}`)}
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
              hintCells={hintCells || []}                    // 👈 NEW
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
              setShowResultModal(false);
              resetBoard();      // Clear all placed pieces
              resetSession();    // Reset game session (scores, turn, etc)
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
