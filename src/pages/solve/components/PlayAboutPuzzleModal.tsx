import React from 'react';
import { useTranslation } from 'react-i18next';

interface PlayAboutPuzzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: any;
  cellsCount: number;
  pieces: any[];
  placedCount: number;
  emptyCellsCount: number;
}

export const PlayAboutPuzzleModal: React.FC<PlayAboutPuzzleModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  cellsCount,
  pieces,
  placedCount,
  emptyCellsCount,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return t('playInfoHub.puzzleModal.unknown');
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return t('playInfoHub.puzzleModal.unknown');
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
        
        .play-puzzle-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .play-puzzle-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .play-puzzle-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(219, 39, 119, 0.5);
          borderRadius: 4px;
        }
        
        .play-puzzle-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(219, 39, 119, 0.7);
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
            background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
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
              {t('playInfoHub.puzzleModal.title')}
            </h2>
          </div>

          <div
            className="play-puzzle-scrollbar"
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
                {puzzle?.title || 'Untitled Puzzle'}
              </h3>

              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.creator')}:</span>{' '}
                <span style={{ opacity: 0.95 }}>
                  {puzzle?.creator_name || t('playInfoHub.puzzleModal.unknown')}
                </span>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.created')}:</span>{' '}
                <span style={{ opacity: 0.95 }}>
                  {formatDate(puzzle?.created_at)}
                </span>
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.containerSize')}:</span>{' '}
                  <span style={{ opacity: 0.95 }}>
                    {cellsCount} {t('playInfoHub.puzzleModal.latticeCells')}
                  </span>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.availablePieces')}:</span>{' '}
                  <span style={{ opacity: 0.95 }}>{pieces.length}</span>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.placedCount')}:</span>{' '}
                  <span style={{ opacity: 0.95 }}>{placedCount}</span>
                </div>

                <div>
                  <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.emptyCells')}:</span>{' '}
                  <span style={{ opacity: 0.95 }}>{emptyCellsCount}</span>
                </div>
              </div>

              {puzzle?.description && (
                <div style={{ marginTop: '1.25rem' }}>
                  <p style={{ margin: 0, opacity: 0.95, fontStyle: 'italic' }}>
                    {puzzle.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
