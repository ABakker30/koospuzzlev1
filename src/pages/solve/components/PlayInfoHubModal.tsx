import React from 'react';
import { useTranslation } from 'react-i18next';

interface PlayInfoHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPuzzleDetails: () => void;
  onOpenHowToPlay: () => void;
}

export const PlayInfoHubModal: React.FC<PlayInfoHubModalProps> = ({
  isOpen,
  onClose,
  onOpenPuzzleDetails,
  onOpenHowToPlay,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleButtonClick = (action: () => void) => {
    onClose();
    action();
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

      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10002,
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
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10003,
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
              {t('playInfoHub.title')}
            </h2>
          </div>

          <div style={{ padding: '16px 20px 20px' }}>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.85rem',
                margin: '0 0 20px 0',
                textAlign: 'center',
              }}
            >
              {t('playInfoHub.subtitle')}
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <button
                onClick={() => handleButtonClick(onOpenPuzzleDetails)}
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#DB2777',
                  cursor: 'pointer',
                  padding: '18px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  minHeight: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
              >
                <span style={{ fontSize: '32px' }}>🧩</span>
                <span>{t('playInfoHub.aboutPuzzle')}</span>
              </button>

              <button
                onClick={() => handleButtonClick(onOpenHowToPlay)}
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#DB2777',
                  cursor: 'pointer',
                  padding: '18px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  minHeight: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
              >
                <span style={{ fontSize: '32px' }}>🎮</span>
                <span>{t('playInfoHub.howToPlay')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
