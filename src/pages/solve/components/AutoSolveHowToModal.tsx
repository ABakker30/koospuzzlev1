import React from 'react';
import { useTranslation } from 'react-i18next';

interface AutoSolveHowToModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoSolveHowToModal: React.FC<AutoSolveHowToModalProps> = ({
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
        
        .autosolve-how-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .autosolve-how-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .autosolve-how-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(37, 99, 235, 0.5);
          borderRadius: 4px;
        }
        
        .autosolve-how-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(37, 99, 235, 0.7);
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
              {t('autoSolveInfoHub.howToModal.title')}
            </h2>
          </div>

          <div
            className="autosolve-how-scrollbar"
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
              <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>
                {t('autoSolveInfoHub.howToModal.intro')}
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.whatItDoes.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.whatItDoes.description')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.strategies.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.strategies.exhaustive')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.strategies.balanced')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.strategies.fast')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.timeComplexity.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.timeComplexity.description')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.timeComplexity.factors')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.controls.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.controls.start')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.controls.stop')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.controls.reveal')}
                </p>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.controls.explode')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.observation.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.observation.description')}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                  {t('autoSolveInfoHub.howToModal.verification.title')}
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                  {t('autoSolveInfoHub.howToModal.verification.description')}
                </p>
              </div>

              <div style={{ 
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '1.5rem',
              }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
                  💡 {t('autoSolveInfoHub.howToModal.tip')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
