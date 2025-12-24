import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SolutionOptionsModal } from './modals/SolutionOptionsModal';
import { AssembleModal } from './modals/AssembleModal';
import { ComingSoonModal } from './modals/ComingSoonModal';

interface SolutionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: {
    id: string;
    title: string;
    creator_name: string;
    effect_type: string;
    puzzle_id?: string;
    duration_sec: number;
    view_count?: number;
    like_count?: number;
    puzzle_name?: string;
  };
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}

type ModalView = 'main' | 'assemble' | null;

export const SolutionActionModal: React.FC<SolutionActionModalProps> = ({
  isOpen,
  onClose,
  solution,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ModalView>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

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
    if (solution.puzzle_id) {
      navigate(`/game/${solution.puzzle_id}`);
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };

  const handleAnalyzeSolution = () => {
    if (solution.puzzle_id) {
      // Navigate to solution viewer for this puzzle
      navigate(`/solutions/${solution.puzzle_id}`);
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };

  const handlePurchase = () => {
    setShowComingSoon(true);
  };

  const handleAssemblyAnimation = () => {
    // Placeholder for assembly animation
    console.log('Assembly animation coming soon');
  };

  const handleKoosPuzzle = () => {
    const solutionId = solution.id;
    // Navigate to sandbox view page for geometry verification
    navigate(`/view-sandbox/${solutionId}`);
    handleCloseAll();
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
      <SolutionOptionsModal
        isOpen={currentView === 'main'}
        onClose={handleCloseAll}
        onSelectAssemble={() => setCurrentView('assemble')}
        onSelectSolve={() => {
          // Direct navigation to Rated Solo mode
          if (solution.puzzle_id) {
            navigate(`/game/${solution.puzzle_id}?mode=solo`);
            handleCloseAll();
          } else {
            alert(t('errors.puzzleNotFound'));
          }
        }}
        onSelectPlay={() => {
          // Direct navigation to VS Computer mode
          handleVsComputer();
          handleCloseAll();
        }}
        onSelectKoosPuzzle={handleKoosPuzzle}
      />

      {/* Assemble Second-Level Modal */}
      <AssembleModal
        isOpen={currentView === 'assemble'}
        onClose={handleCloseAll}
        onBack={handleBackToMain}
        onAssemblyGuide={handleAnalyzeSolution}
        onAssemblyAnimation={handleAssemblyAnimation}
        onPurchase={handlePurchase}
      />

      {/* Solve and Play modals removed - direct navigation used instead */}

      {/* Coming Soon Modal */}
      <ComingSoonModal
        isOpen={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        featureName="Purchase Physical Puzzle"
        description="Soon you'll be able to order a physical version of this puzzle to assemble in real life!"
        icon="🛒"
      />
    </>
  );
};
