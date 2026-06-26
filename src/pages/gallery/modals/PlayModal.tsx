import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

interface PlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onVsComputer: () => void;
  onVsPlayer: () => void;
}

export const PlayModal: React.FC<PlayModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onVsComputer,
  onVsPlayer,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      title={t('gallery.modals.play.title')}
      maxWidth={480}
      surface="linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
    >
      {/* Options */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Versus Computer Button */}
        <button
          onClick={onVsComputer}
          style={{
            background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
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
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(236, 72, 153, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>🤖</span>
          <span>{t('gallery.modals.play.vsComputer')}</span>
        </button>

        {/* Versus Player Button */}
        <button
          onClick={onVsPlayer}
          style={{
            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
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
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>👥</span>
          <span>{t('gallery.modals.play.vsPlayer')}</span>
        </button>
      </div>
    </ModalBase>
  );
};
