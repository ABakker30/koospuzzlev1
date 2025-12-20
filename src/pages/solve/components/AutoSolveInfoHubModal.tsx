import React from 'react';
import { useTranslation } from 'react-i18next';

interface AutoSolveInfoHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPuzzleDetails: () => void;
  onOpenHowToAutoSolve: () => void;
}

export const AutoSolveInfoHubModal: React.FC<AutoSolveInfoHubModalProps> = ({
  isOpen,
  onClose,
  onOpenPuzzleDetails,
  onOpenHowToAutoSolve,
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
          zIndex: 10000,
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
            maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '20px',
              borderRadius: '18px 18px 0 0',
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
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 8px 0',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('autoSolveInfoHub.title')}
            </h2>

            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.95rem',
                margin: 0,
                textShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
              }}
            >
              {t('autoSolveInfoHub.subtitle')}
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <button
              onClick={() => handleButtonClick(onOpenPuzzleDetails)}
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                padding: '18px 20px',
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#2563EB',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🧩</span>
              <span>{t('autoSolveInfoHub.aboutPuzzle')}</span>
            </button>

            <button
              onClick={() => handleButtonClick(onOpenHowToAutoSolve)}
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                padding: '18px 20px',
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#2563EB',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🤖</span>
              <span>{t('autoSolveInfoHub.howToAutoSolve')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
