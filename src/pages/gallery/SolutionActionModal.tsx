import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AboutSolutionInfoModal } from './AboutSolutionInfoModal';
import { SolutionOptionsModal } from './modals/SolutionOptionsModal';
import { AssembleModal } from './modals/AssembleModal';
import { SolveModal } from './modals/SolveModal';
import { PlayModal } from './modals/PlayModal';

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
}

type ModalView = 'main' | 'assemble' | 'solve' | 'play' | 'about' | null;

export const SolutionActionModal: React.FC<SolutionActionModalProps> = ({
  isOpen,
  onClose,
  solution,
}) => {
  const { t } = useTranslation();
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
    if (solution.puzzle_id) {
      navigate(`/manual/${solution.puzzle_id}`);
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };

  const handleSolveRated = () => {
    if (solution.puzzle_id) {
      navigate(`/manual/${solution.puzzle_id}?rated=true`);
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };

  const handlePlayVsPlayer = () => {
    alert(t('gallery.comingSoon.multiplayer'));
  };

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

  const handleAutoSolve = () => {
    if (solution.puzzle_id) {
      navigate(`/auto/${solution.puzzle_id}`);
      onClose();
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };

  const handlePurchase = () => {
    // Placeholder for purchase functionality
    alert('Purchase feature coming soon!');
  };

  const handleAssemblyAnimation = () => {
    // Placeholder for assembly animation
    console.log('Assembly animation coming soon');
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
        onSelectSolve={() => setCurrentView('solve')}
        onSelectPlay={() => setCurrentView('play')}
        onSelectAbout={() => setCurrentView('about')}
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
        onVsPlayer={handlePlayVsPlayer}
      />

      {/* About Solution Info Modal */}
      <AboutSolutionInfoModal
        isOpen={currentView === 'about'}
        onClose={handleCloseAll}
        solution={solution}
      />
    </>
  );
};
