import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import { tokens } from '../../../styles/tokens';

interface SolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onSolveUnrated: () => void;
  onSolveRated: () => void;
  onAutoSolve: () => void;
}

export const SolveModal: React.FC<SolveModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onSolveUnrated,
  onSolveRated,
  onAutoSolve,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      title={t('gallery.modals.solve.title')}
      maxWidth={480}
      surface={tokens.gradient.success}
    >
      {/* Options */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Solve Unrated Button */}
        <button
          onClick={onSolveUnrated}
          style={{
            background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '18px',
            fontSize: '0.95rem',
            fontWeight: 700,
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>�</span>
          <span>{t('gallery.modals.solve.unrated')}</span>
        </button>

        {/* Solve Rated Button */}
        <button
          onClick={onSolveRated}
          style={{
            background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '18px',
            fontSize: '0.95rem',
            fontWeight: 700,
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>🏆</span>
          <span>{t('gallery.modals.solve.rated')}</span>
        </button>

        {/* Auto Solve Button */}
        <button
          onClick={onAutoSolve}
          style={{
            background: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '18px',
            fontSize: '0.95rem',
            fontWeight: 700,
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(147, 51, 234, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(147, 51, 234, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.4)';
          }}
        >
          <span style={{ fontSize: '32px' }}>🤖</span>
          <span>{t('gallery.modals.solve.auto')}</span>
        </button>
      </div>
    </ModalBase>
  );
};
