import React from 'react';

interface AboutPuzzleInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: {
    id: string;
    name: string;
    creator: string;
    cellCount?: number;
    cells?: any[];
  };
}

export const AboutPuzzleInfoModal: React.FC<AboutPuzzleInfoModalProps> = ({
  isOpen,
  onClose,
  puzzle,
}) => {
  if (!isOpen) return null;

  const cellCount = puzzle.cellCount || puzzle.cells?.length || 0;
  
  // Mock stats - would come from API in real implementation
  const stats = {
    solveCount: Math.floor(Math.random() * 500) + 50,
    averageTime: `${Math.floor(Math.random() * 20) + 5} min`,
    fastestTime: `${Math.floor(Math.random() * 5) + 1} min ${Math.floor(Math.random() * 60)} sec`,
    difficulty: cellCount < 30 ? 'Easy 😊' : cellCount < 50 ? 'Medium 🤔' : 'Hard 💪',
  };

  return (
    <>
      <style>{`
        .about-puzzle-modal-content::-webkit-scrollbar {
          width: 8px;
        }
        .about-puzzle-modal-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .about-puzzle-modal-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        .about-puzzle-modal-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .about-puzzle-modal-content {
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
          className="about-puzzle-modal-content"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)',
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
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                color: '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              ✕
            </button>

            <div style={{ fontSize: '3rem', marginBottom: '8px', textAlign: 'center' }}>🧩</div>
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
              {puzzle.name}
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.9rem',
                margin: 0,
                textAlign: 'center',
              }}
            >
              by {puzzle.creator}
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
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🎯</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>
                  {cellCount}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Cells
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
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>✨</div>
                <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>
                  {stats.solveCount}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Times Solved
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
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>⚡</div>
                <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>
                  {stats.fastestTime}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Fastest Solve
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
                <div style={{ fontSize: '1.8rem', marginBottom: '4px' }}>⏱️</div>
                <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                  {stats.averageTime}
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.75rem' }}>
                  Avg. Time
                </div>
              </div>
            </div>

            {/* Difficulty Badge */}
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
                Difficulty Rating
              </div>
              <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>
                {stats.difficulty}
              </div>
            </div>

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
                💡 Did you know?
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                This puzzle has been attempted by puzzlers from around the world! Think you can beat the fastest time?
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
