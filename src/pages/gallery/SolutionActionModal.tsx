import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    view_count: number;
    like_count: number;
    puzzle_name?: string;
  };
}

export const SolutionActionModal: React.FC<SolutionActionModalProps> = ({
  isOpen,
  onClose,
  solution,
}) => {
  const navigate = useNavigate();
  const [showAboutInfo, setShowAboutInfo] = useState(false);

  if (!isOpen) return null;

  const handleSolve = () => {
    if (solution.puzzle_id) {
      navigate(`/manual/${solution.puzzle_id}`);
    } else {
      alert('Puzzle not available for this solution');
    }
  };

  const handleVsComputer = () => {
    if (solution.puzzle_id) {
      navigate(`/game/${solution.puzzle_id}`);
    } else {
      alert('Puzzle not available for this solution');
    }
  };

  const handleAnalyzeSolution = () => {
    if (solution.puzzle_id) {
      // Navigate to solution viewer for this puzzle
      navigate(`/solutions/${solution.puzzle_id}`);
    } else {
      alert('Solution not available for this solution');
    }
  };

  const handleAutoSolve = () => {
    if (solution.puzzle_id) {
      navigate(`/auto/${solution.puzzle_id}`);
    } else {
      alert('Puzzle not available for this solution');
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
            borderRadius: '24px',
            padding: '0',
            width: '90%',
            maxWidth: '420px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '20px 24px',
              borderRadius: '21px 21px 0 0',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '20px',
                color: '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'rotate(90deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'rotate(0deg)';
              }}
            >
              ✕
            </button>

            <h2
              style={{
                color: '#fff',
                fontSize: '1.15rem',
                fontWeight: 700,
                margin: 0,
                paddingRight: '50px',
                paddingLeft: '10px',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              What would you like to do?
            </h2>
          </div>

          {/* Actions - Two Column Grid */}
          <div
            style={{
              padding: '24px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
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
                  padding: '20px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
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
                <span style={{ fontSize: '2rem' }}>🔬</span>
                <span>Analyze Solution</span>
              </button>
            )}

            {/* Solve Puzzle Button */}
            {solution.puzzle_id && (
              <button
                onClick={handleSolve}
                style={{
                  background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '20px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
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
                <span style={{ fontSize: '2rem' }}>🎯</span>
                <span>Solve This Puzzle</span>
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
                  padding: '20px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
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
                <span style={{ fontSize: '2rem' }}>⚡</span>
                <span>Auto Solve</span>
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
                  padding: '20px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
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
                <span style={{ fontSize: '2rem' }}>🤖</span>
                <span>Play VS Computer</span>
              </button>
            )}

            {/* About This Solution Button */}
            <button
              onClick={() => setShowAboutInfo(true)}
              style={{
                background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
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
              <span style={{ fontSize: '2rem' }}>ℹ️</span>
              <span>About This Solution</span>
            </button>
          </div>
        </div>

        {/* About Solution Info Modal */}
        <AboutSolutionInfoModal
          isOpen={showAboutInfo}
          onClose={() => setShowAboutInfo(false)}
          solution={solution}
        />
      </div>

    </>
  );
};
