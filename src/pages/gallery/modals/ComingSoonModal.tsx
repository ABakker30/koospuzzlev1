import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import { tokens } from '../../../styles/tokens';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  description: string;
  icon?: string;
}

export const ComingSoonModal: React.FC<ComingSoonModalProps> = ({
  isOpen,
  onClose,
  featureName,
  description,
  icon = '🚀',
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={400}
      title={t('comingSoon.title')}
      headerIcon={
        <>
          <style>{`
            @keyframes comingSoonPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }
          `}</style>
          <span
            style={{
              display: 'inline-block',
              animation: 'comingSoonPulse 2s ease-in-out infinite',
            }}
          >
            {icon}
          </span>
        </>
      }
    >
      {/* Content */}
      <div style={{ padding: '4px' }}>
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: '1.1rem',
              fontWeight: 700,
              marginBottom: '8px',
            }}
          >
            {featureName}
          </div>
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '0.9rem',
              lineHeight: '1.5',
            }}
          >
            {description}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '0.85rem',
              fontStyle: 'italic',
            }}
          >
            {t('comingSoon.message')}
          </div>
        </div>

        {/* OK Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '20px',
            background: tokens.gradient.success,
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 700,
            padding: '14px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            transition: 'all 0.2s',
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
          {t('comingSoon.gotIt')}
        </button>
      </div>
    </ModalBase>
  );
};
