import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useManualGameSession } from './hooks/useManualGameSession';
import { useGameTurnController } from './hooks/useGameTurnController';
import { ManualGameHeader } from './components/ManualGameHeader';
import { ManualGameArena } from './components/ManualGameArena';
import { ManualGameDebugPanel } from './components/ManualGameDebugPanel';
import { ManualGameBoard } from './components/ManualGameBoard';
import { ManualGameResultModal } from './components/ManualGameResultModal';
import { useGameBoardLogic } from './hooks/useGameBoardLogic';
import { useComputerTurn } from './hooks/useComputerTurn';
import { useComputerMoveGenerator } from './hooks/useComputerMoveGenerator';
import { useGameChat } from './hooks/useGameChat';
import { useHintSystem } from './hooks/useHintSystem';
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

  // Hint placement flag (for useEffect pattern)
  const [pendingHintPlacement, setPendingHintPlacement] = useState(false);

  // Determine if it's the human's turn
  const currentPlayer =
    session && session.players[session.currentPlayerIndex];
  const isHumanTurn = !!currentPlayer && !currentPlayer.isComputer;

  // Board logic: human drawing & placement
  const {
    placedPieces,
    placedMap,
    drawingCells,
    clearDrawing,
    selectedPieceUid,
    handleInteraction,
    placePieceProgrammatically,
    computerDrawingCells,
    isComputerAnimating,
    animateComputerMove,
    animateUserHintMove,
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
      // Let the controller log this and apply any scoring rules
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
    console.log('💡 handleUserHint fired');
    
    // Check if orientation service is ready
    if (orientationsLoading || !orientationService) {
      addAIComment('Loading piece orientations, please try again in a moment.');
      return;
    }

    // 1) Mark that we want to place the next hint as an actual move
    setPendingHintPlacement(true);

    // 2) Clear any manual drawing (like Manual Solve does)
    clearDrawing();

    // 3) Ask the hint system to compute a hint
    //    Pass drawingCells (same as Manual Solve) so hint system can use gesture semantics
    await handleRequestHintBase(drawingCells);
  }, [handleRequestHintBase, drawingCells, clearDrawing, orientationsLoading, orientationService, addAIComment]);

  const handleUserSolvabilityCheck = () => {
    handleSolvabilityCheck({ source: 'human' });
    addAIComment("Smart to check solvability. This position is getting tricky.");
  };

  // Consume hint cells when ready and place the hint piece
  useEffect(() => {
    if (!pendingHintPlacement) return;
    if (!orientationService) return;

    console.log('🔍 hintCells now', hintCells);

    // 1) If hintCells is null or undefined: hint system hasn't finished yet → wait.
    if (hintCells == null) {
      return; // ⬅️ don't clear pending, just wait for next update
    }

    // 2) If hintCells is an empty array: hint system finished but found no hint.
    if (hintCells.length === 0) {
      addAIComment(
        "I couldn't find a good hint there. This position is tough."
      );
      setPendingHintPlacement(false);
      return;
    }

    // Try to interpret the hint cells as a valid Koos piece move
    const match = findFirstMatchingPiece(hintCells, DEFAULT_PIECE_LIST, orientationService);
    if (!match) {
      addAIComment(
        "I tried to hint a piece, but nothing matched a valid Koos piece there."
      );
      setPendingHintPlacement(false);
      return;
    }

    const move = {
      pieceId: match.pieceId,
      orientationId: match.orientationId,
      cells: hintCells,
    };

    console.log('✨ Animating hint move:', move);

    // Animate user hint move: draw then place
    animateUserHintMove(move, ({ pieceId, orientationId, cells, uid }) => {
      // Place as a real move (score + turn + event)
      handlePlacePiece({
        source: 'human',
        pieceId,
        orientationId,
        cells,
        uid,
      });

      // Track hint usage / turn semantics
      handleHint({ source: 'human' });

      // AI reaction
      addAIComment(
        `Using a hint with ${pieceId}? Fair move. Let's see what you do next.`
      );

      // Clear the pending flag so we don't place again
      setPendingHintPlacement(false);
    });
  }, [
    pendingHintPlacement,
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

  return (
    <div className="page-container vs-page">
      <div className="vs-page-inner">
        <ManualGameHeader puzzleName={puzzle.name} />

        {!session ? (
          <p>Initializing game session...</p>
        ) : (
          <>
            <ManualGameArena
              session={session}
              hidePlacedPieces={hidePlacedPieces}
              onToggleHidePlaced={() =>
                setHidePlacedPieces(prev => !prev)
              }
              onRequestHint={handleUserHint}             // 👈 NEW
              onCheckSolvable={handleUserSolvabilityCheck} // 👈 NEW
              isHumanTurn={isHumanTurn}                  // 👈 NEW
            />

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

            {/* Short, focused description above chat */}
            <p className="vs-description">
              You&apos;re playing a live match against an AI opponent. Place pieces,
              watch the board fill up, and keep an eye on the score as you go.
            </p>

            {/* Chat panel: primary companion to gameplay */}
            <ManualGameChatPanel
              messages={chatMessages}
              isSending={chatIsSending}
              onSendMessage={sendUserMessage}
              onSendEmoji={sendEmoji}
            />

            {/* Debug: developer tools, visually de-emphasized and moved to bottom */}
            <ManualGameDebugPanel
              session={session}
              onPlacePiece={() => handlePlacePiece({ debug: true })}
              onHint={handleUserHint}
              onSolvabilityCheck={handleUserSolvabilityCheck}
            />
          </>
        )}

        <button
          onClick={() => navigate(`/manual/${puzzle.id}`)}
          className="btn"
          style={{ marginTop: '0.5rem' }}
        >
          Back to Manual Solve
        </button>

        {/* Result modal */}
        {session && (
          <ManualGameResultModal
            session={session}
            isOpen={showResultModal}
            puzzleName={puzzle.name}
            onClose={() => setShowResultModal(false)}
            onPlayAgain={() => {
              setShowResultModal(false);
              resetSession();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ManualGamePage;
