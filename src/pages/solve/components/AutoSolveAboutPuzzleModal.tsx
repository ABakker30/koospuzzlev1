import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchSpaceStats } from '../../../engines/engine2/searchSpace';

interface AutoSolveAboutPuzzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: any;
  searchSpaceStats?: SearchSpaceStats | null;
}

export const AutoSolveAboutPuzzleModal: React.FC<AutoSolveAboutPuzzleModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  searchSpaceStats,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

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
        
        .autosolve-about-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .autosolve-about-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .autosolve-about-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.5);
          borderRadius: 4px;
        }
        
        .autosolve-about-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.7);
        }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10004,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '560px',
            maxHeight: '90vh',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10005,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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
              flexShrink: 0,
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
                fontSize: '1.1rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('autoSolveInfoHub.aboutPuzzle')}
            </h2>
          </div>

          <div
            className="autosolve-about-scrollbar"
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>
                  {t('infoHub.puzzleModal.creator')}:
                </p>
                <p style={{ margin: 0, opacity: 0.95 }}>
                  {puzzle?.created_by || puzzle?.author || t('infoHub.puzzleModal.unknown')}
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>
                  {t('infoHub.puzzleModal.created')}:
                </p>
                <p style={{ margin: 0, opacity: 0.95 }}>
                  {puzzle?.created_at
                    ? new Date(puzzle.created_at).toLocaleDateString()
                    : t('infoHub.puzzleModal.unknown')}
                </p>
              </div>

              {searchSpaceStats && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontWeight: 700, fontSize: '1rem' }}>
                    📊 {t('autoSolveInfoHub.howToModal.timeComplexity.title')}
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95, fontSize: '0.85rem' }}>
                    <strong>Search Space Upper Bound:</strong>
                  </p>
                  <p style={{ 
                    margin: '0 0 0.5rem 0', 
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    opacity: 0.95,
                  }}>
                    {searchSpaceStats.upperBounds.fixedInventoryNoOverlap.sci}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.85 }}>
                    ~10^{Math.floor(searchSpaceStats.upperBounds.fixedInventoryNoOverlap.log10)} combinations
                    ({searchSpaceStats.totalPlacements.toLocaleString()} total placements)
                  </p>
                </div>
              )}

              <div style={{ 
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '1.5rem',
              }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
                  💡 {t('autoSolveInfoHub.howToModal.observation.description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
