import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import { tokens } from '../../../styles/tokens';

interface InfoHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPuzzleDetails: () => void;
  onOpenModeInfo: () => void;
  onOpenControls: () => void;
}

export const InfoHubModal: React.FC<InfoHubModalProps> = ({
  isOpen,
  onClose,
  onOpenPuzzleDetails,
  onOpenModeInfo,
  onOpenControls,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={500}
      headerIcon="ℹ️"
      title={t('infoHub.title')}
      subtitle={t('infoHub.subtitle')}
    >
      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={() => {
            onClose();
            onOpenPuzzleDetails();
          }}
          style={{
            width: '100%',
            background: tokens.gradient.info,
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            padding: '18px 24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🧩</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{t('infoHub.aboutPuzzle')}</span>
        </button>

        <button
          onClick={() => {
            onClose();
            onOpenModeInfo();
          }}
          style={{
            width: '100%',
            background: tokens.gradient.success,
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            padding: '18px 24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🎯</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{t('infoHub.aboutMode')}</span>
        </button>

        <button
          onClick={() => {
            onClose();
            onOpenControls();
          }}
          style={{
            width: '100%',
            background: tokens.gradient.warning,
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            padding: '18px 24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🎮</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{t('infoHub.howToSolve')}</span>
        </button>
      </div>
    </ModalBase>
  );
};
