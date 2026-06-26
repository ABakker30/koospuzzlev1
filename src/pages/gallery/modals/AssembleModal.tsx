import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import { tokens } from '../../../styles/tokens';

interface AssembleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onAssemblyGuide: () => void;
  onAssemblyAnimation: () => void;
  onPurchase: () => void;
}

export const AssembleModal: React.FC<AssembleModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onAssemblyGuide,
  onAssemblyAnimation,
  onPurchase,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      title={t('gallery.modals.assemble.title')}
      maxWidth={480}
      surface={tokens.gradient.violet}
    >
      {/* Options */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Assembly Guide Button */}
        <button
          onClick={onAssemblyGuide}
          style={{
            background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '16px',
            fontSize: '0.9rem',
            fontWeight: 700,
            minHeight: '90px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(6, 182, 212, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.4)';
          }}
        >
          <span style={{ fontSize: '28px' }}>📖</span>
          <span>{t('gallery.modals.assemble.guide.label')}</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            {t('gallery.modals.assemble.guide.description')}
          </span>
        </button>

        {/* Assembly Animation Button (Coming Soon) */}
        <button
          onClick={onAssemblyAnimation}
          disabled
          style={{
            background: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'not-allowed',
            padding: '16px',
            fontSize: '0.9rem',
            fontWeight: 700,
            minHeight: '90px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(107, 114, 128, 0.4)',
            opacity: 0.7,
          }}
        >
          <span style={{ fontSize: '28px' }}>🎬</span>
          <span>{t('gallery.modals.assemble.animation.label')}</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            {t('gallery.modals.assemble.animation.description')}
          </span>
          <span style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.8 }}>
            ({t('gallery.comingSoon.label')})
          </span>
        </button>

        {/* Purchase Puzzle Button */}
        <button
          onClick={onPurchase}
          style={{
            background: tokens.gradient.violet,
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '16px',
            fontSize: '0.9rem',
            fontWeight: 700,
            minHeight: '90px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
          }}
        >
          <span style={{ fontSize: '28px' }}>🛒</span>
          <span>{t('gallery.modals.assemble.purchase.label')}</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            {t('gallery.modals.assemble.purchase.description')}
          </span>
        </button>
      </div>
    </ModalBase>
  );
};
