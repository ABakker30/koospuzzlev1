import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AboutSolutionInfoModal } from './AboutSolutionInfoModal';

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

export const SolutionActionModal: React.FC<SolutionActionModalProps> = ({
  isOpen,
  onClose,
  solution,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAboutInfo, setShowAboutInfo] = useState(false);

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
    } else {
      alert(t('errors.puzzleNotFound'));
    }
  };


  return (
    <>
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 20px',
              minHeight: '56px',
              borderRadius: '18px 18px 0 0',
              textAlign: 'center',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '24px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              ✕
            </button>

            <h2
              style={{
                color: '#fff',
                fontSize: '1.05rem',
                fontWeight: 700,
                margin: 0,
                paddingRight: '40px',
                paddingLeft: '10px',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {solution.title}
            </h2>
          </div>

          {/* Actions - Uniform Grid */}
          <div
            style={{
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              justifyContent: 'center',
            }}
          >
            {/* Analyze Solution Button */}
            {solution.puzzle_id && (
              <button
                onClick={handleAnalyzeSolution}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '110px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(6, 182, 212, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.4)';
                }}
              >
                <span style={{ fontSize: '28px' }}>🔍</span>
                <span>{t('gallery.actions.analyze')}</span>
              </button>
            )}

            {/* Solve Puzzle (Unrated) */}
            {solution.puzzle_id && (
              <button
                onClick={handleSolveUnrated}
                style={{
                  background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '110px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
                }}
              >
                <span style={{ fontSize: '28px' }}>🎯</span>
                <span>{t('button.solveUnrated')}</span>
              </button>
            )}

            {/* Solve Puzzle (Rated) */}
            {solution.puzzle_id && (
              <button
                onClick={handleSolveRated}
                style={{
                  background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '110px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
                }}
              >
                <span style={{ fontSize: '28px' }}>🏆</span>
                <span>{t('button.solveRated')}</span>
              </button>
            )}

            {/* Auto Solve Button */}
            {solution.puzzle_id && (
              <button
                onClick={handleAutoSolve}
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '110px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                }}
              >
                <span style={{ fontSize: '28px' }}>⚡</span>
                <span>{t('gallery.actions.autoSolve')}</span>
              </button>
            )}

            {/* VS Computer Button */}
            {solution.puzzle_id && (
              <button
                onClick={handleVsComputer}
                style={{
                  background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 12px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '110px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 152, 0, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.4)';
                }}
              >
                <span style={{ fontSize: '28px' }}>🎮</span>
                <span>{t('gallery.actions.vsComputer')}</span>
              </button>
            )}

            {/* Play vs Another Player (Coming Soon) */}
            <button
              onClick={handlePlayVsPlayer}
              style={{
                background: 'linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)',
                opacity: 0.7,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(156, 39, 176, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.4)';
              }}
            >
              <span style={{ fontSize: '28px' }}>👥</span>
              <span>{t('gallery.actions.vsPlayer')}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>({t('gallery.comingSoon.label')})</span>
            </button>

            {/* About This Solution */}
            <button
              onClick={() => setShowAboutInfo(true)}
              style={{
                background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                minHeight: '110px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(147, 51, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.4)';
              }}
            >
              <span style={{ fontSize: '28px' }}>ℹ️</span>
              <span>{t('gallery.actions.aboutSolution')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* About Solution Info Modal */}
      <AboutSolutionInfoModal
        isOpen={showAboutInfo}
        onClose={() => setShowAboutInfo(false)}
        solution={solution}
      />
    </>
  );
};
