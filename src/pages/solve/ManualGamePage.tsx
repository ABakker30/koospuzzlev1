import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useManualGameSession } from './hooks/useManualGameSession';
import { useGameTurnController } from './hooks/useGameTurnController';
import { ManualGameHeader } from './components/ManualGameHeader';
import { ManualGameArena } from './components/ManualGameArena';
import { ManualGameDebugPanel } from './components/ManualGameDebugPanel';
import { ManualGameBoard } from './components/ManualGameBoard';
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
  } = useManualGameSession(puzzle?.id);

  const {
    handlePlacePiece,
    handleHint,
    handleSolvabilityCheck,
  } = useGameTurnController({
    session,
    logEvent,
    applyScoreDelta,
    advanceTurn,
  });

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
            <ManualGameArena session={session} />

            {/* Real puzzle board in view-only mode */}
            <ManualGameBoard puzzle={puzzle} />

            {/* TEMP: debug harness for the turn controller */}
            <ManualGameDebugPanel
              session={session}
              onPlacePiece={() => handlePlacePiece({ debug: true })}
              onHint={() => handleHint({ debug: true })}
              onSolvabilityCheck={() =>
                handleSolvabilityCheck({ debug: true })
              }
            />

            <p className="vs-description">
              The 3D board is now live in view-only mode. You can orbit, pan, and zoom.
              Next, we&apos;ll connect actual drawing &amp; placement, hints, and
              solvability checks from the Koos puzzle engine into this controller,
              and then add the computer&apos;s drawing behavior and playback.
            </p>
          </>
        )}

        <button
          onClick={() => navigate(`/manual/${puzzle.id}`)}
          className="btn"
          style={{ marginTop: '0.5rem' }}
        >
          Back to Manual Solve
        </button>
      </div>
    </div>
  );
};

export default ManualGamePage;
