import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PuzzleOptionsModal } from './modals/PuzzleOptionsModal';
import { ExploreModal } from './modals/ExploreModal';

interface PuzzleActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: {
    id: string;
    name: string;
    creator: string;
    solutionCount?: number;
    hasSolutions?: boolean;
  };
}

type ModalView = 'main' | 'explore' | null;

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

  const handleVsComputer = () => {
    navigate(`/game/${puzzle.id}`);
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
      {/* Top-Level Options Modal (dynamic based on solution_count) */}
      <PuzzleOptionsModal
        isOpen={currentView === 'main'}
        onClose={handleCloseAll}
        onSelectExplore={() => setCurrentView('explore')}
        onSelectSolve={() => {
          // Direct navigation to Rated Solo mode
          navigate(`/game/${puzzle.id}?mode=solo`);
          handleCloseAll();
        }}
        onSelectPlay={() => {
          // Direct navigation to VS Computer mode
          handleVsComputer();
          handleCloseAll();
        }}
        hasSolutions={puzzle.hasSolutions}
        solutionCount={puzzle.solutionCount}
      />

      {/* Explore Second-Level Modal */}
      <ExploreModal
        isOpen={currentView === 'explore'}
        onClose={handleCloseAll}
        onBack={handleBackToMain}
        onExploreShape={handleExploreShape}
      />

      {/* Solve and Play modals removed - direct navigation used instead */}
    </>
  );
};
