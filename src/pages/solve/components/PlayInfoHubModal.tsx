import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

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

  const handleButtonClick = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={480}
      gradient="accent"
      title={t('playInfoHub.title')}
    >
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
    </ModalBase>
  );
};
