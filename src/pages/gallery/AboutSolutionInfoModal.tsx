import React from 'react';

interface AboutSolutionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: {
    id: string;
    title: string;
    creator_name: string;
    effect_type: string;
    duration_sec: number;
    view_count?: number;
    like_count?: number;
    puzzle_name?: string;
  };
}

export const AboutSolutionInfoModal: React.FC<AboutSolutionInfoModalProps> = ({
  isOpen,
  onClose,
  solution,
}) => {
  if (!isOpen) return null;

  const formatViews = (count: number | undefined | null) => {
    const safeCount = count ?? 0;
    if (safeCount >= 1000) return `${(safeCount / 1000).toFixed(1)}k`;
    return safeCount.toString();
  };

  return (
    <>
      <style>{`
        .about-solution-modal-content::-webkit-scrollbar {
          width: 8px;
        }
        .about-solution-modal-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .about-solution-modal-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        .about-solution-modal-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .about-solution-modal-content {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
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
          zIndex: 10002,
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="about-solution-modal-content"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '440px',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            zIndex: 10003,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '20px',
              borderRadius: '17px 17px 0 0',
              position: 'relative',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
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

            <div style={{ fontSize: '3rem', marginBottom: '8px', textAlign: 'center' }}>🎯</div>
            <h2
              style={{
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 4px 0',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                textAlign: 'center',
              }}
            >
              {solution.title}
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.9rem',
                margin: 0,
                textAlign: 'center',
              }}
            >
              by {solution.creator_name}
            </p>
          </div>

          {/* Content */}
          <div style={{ padding: '20px' }}>
            {/* Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '16px',
                  borderRadius: '12px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>👁️</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>
                  {formatViews(solution.view_count)}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Views
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '16px',
                  borderRadius: '12px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>❤️</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>
                  {formatViews(solution.like_count)}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Likes
                </div>
              </div>
            </div>

            {/* Puzzle Info */}
            {solution.puzzle_name && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '12px',
                  borderRadius: '12px',
                  textAlign: 'center',
                  marginBottom: '20px',
                }}
              >
                <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.85rem', marginBottom: '4px' }}>
                  Featured Puzzle
                </div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>
                  🧩 {solution.puzzle_name}
                </div>
              </div>
            )}

            {/* Fun Facts */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>
                💡 About this Solution
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                This solution demonstrates one way to solve the puzzle. Get inspired and try it yourself!
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
