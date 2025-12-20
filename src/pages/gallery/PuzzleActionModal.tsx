import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PuzzleOptionsModal } from './modals/PuzzleOptionsModal';
import { ExploreModal } from './modals/ExploreModal';
import { SolveModal } from './modals/SolveModal';
import { PlayModal } from './modals/PlayModal';
import { AboutPuzzleInfoModal } from './AboutPuzzleInfoModal';

interface PuzzleActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: {
    id: string;
    name: string;
    creator: string;
  };
}

type ModalView = 'main' | 'explore' | 'solve' | 'play' | 'about' | null;

export const PuzzleActionModal: React.FC<PuzzleActionModalProps> = ({
  isOpen,
  onClose,
  puzzle,
}) => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ModalView>(null);

  // Reset to main view when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setCurrentView('main');
    } else {
      setCurrentView(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSolveUnrated = () => {
    navigate(`/manual/${puzzle.id}`);
  };

  const handleSolveRated = () => {
    navigate(`/manual/${puzzle.id}?rated=true`);
  };

  const handleVsComputer = () => {
    navigate(`/game/${puzzle.id}`);
  };

  const handleVsPlayer = () => {
    alert('Multiplayer mode coming soon!');
  };

  const handleAutoSolve = () => {
    navigate(`/auto/${puzzle.id}`);
  };

  const handleExploreShape = () => {
    // Navigate to shape exploration page
    navigate(`/shape/${puzzle.id}`);
    onClose();
  };

  const handleCloseAll = () => {
    setCurrentView(null);
    onClose();
  };

  const handleBackToMain = () => {
    setCurrentView('main');
  };

  return (
    <>
      {/* Top-Level Options Modal */}
      <PuzzleOptionsModal
        isOpen={currentView === 'main'}
        onClose={handleCloseAll}
        onSelectExplore={() => setCurrentView('explore')}
        onSelectSolve={() => setCurrentView('solve')}
        onSelectPlay={() => setCurrentView('play')}
        onSelectAbout={() => setCurrentView('about')}
      />

      {/* Explore Second-Level Modal */}
      <ExploreModal
        isOpen={currentView === 'explore'}
        onClose={handleCloseAll}
        onBack={handleBackToMain}
        onExploreShape={handleExploreShape}
      />

      {/* Solve Second-Level Modal */}
      <SolveModal
        isOpen={currentView === 'solve'}
        onClose={handleCloseAll}
        onBack={handleBackToMain}
        onSolveUnrated={handleSolveUnrated}
        onSolveRated={handleSolveRated}
        onAutoSolve={handleAutoSolve}
      />

      {/* Play Second-Level Modal */}
      <PlayModal
        isOpen={currentView === 'play'}
        onClose={handleCloseAll}
        onBack={handleBackToMain}
        onVsComputer={handleVsComputer}
        onVsPlayer={handleVsPlayer}
      />

      {/* About Puzzle Info Modal */}
      <AboutPuzzleInfoModal
        isOpen={currentView === 'about'}
        onClose={handleCloseAll}
        puzzle={puzzle}
      />
    </>
  );
};
