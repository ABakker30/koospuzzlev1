import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

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

  const handleButtonClick = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={480}
      gradient="info"
      title={t('autoSolveInfoHub.title')}
      subtitle={t('autoSolveInfoHub.subtitle')}
    >
      <div
        style={{
          padding: '4px',
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

        {/* Don't show this opening screen again */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'rgba(255,255,255,0.9)',
            fontSize: '0.9rem',
            cursor: 'pointer',
            marginTop: '4px',
          }}
        >
          <input
            type="checkbox"
            onChange={(e) => {
              try {
                if (e.target.checked) localStorage.setItem('autoSolve.hideInfoHub', '1');
                else localStorage.removeItem('autoSolve.hideInfoHub');
              } catch { /* ignore storage errors */ }
            }}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <span>{t('autoSolveInfoHub.dontShowAgain') === 'autoSolveInfoHub.dontShowAgain' ? "Don't show this again" : t('autoSolveInfoHub.dontShowAgain')}</span>
        </label>
      </div>
    </ModalBase>
  );
};
