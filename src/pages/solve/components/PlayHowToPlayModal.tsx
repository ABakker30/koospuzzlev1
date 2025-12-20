import React from 'react';
import { useTranslation } from 'react-i18next';

interface PlayHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlayHowToPlayModal: React.FC<PlayHowToPlayModalProps> = ({
  isOpen,
  onClose,
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
        
        .play-how-to-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(219, 39, 119, 0.5);
          borderRadius: 4px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-thumb:hover {
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
              {t('playInfoHub.howToPlayModal.title')}
            </h2>
          </div>

          <div
            className="play-how-to-scrollbar"
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
              <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>
                {t('playInfoHub.howToPlayModal.intro')}
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.turnBased.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.turnBased.description')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.placing.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.placing.step1')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.placing.step2')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.placing.step3')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.scoring.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.scoring.validPlacement')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.scoring.invalidPlacement')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.hints.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.hints.description')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.hints.noCost')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.visibility.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.visibility.description')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.solvability.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.solvability.description')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('playInfoHub.howToPlayModal.winning.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.winning.condition')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('playInfoHub.howToPlayModal.winning.tiebreaker')}
                </p>
              </div>

              <div style={{ 
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '1.5rem',
              }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
                  💡 {t('playInfoHub.howToPlayModal.tip')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
