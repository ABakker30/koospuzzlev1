import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

interface ExploreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onExploreShape: () => void;
}

export const ExploreModal: React.FC<ExploreModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onExploreShape,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      title={t('gallery.modals.explore.title')}
      maxWidth={460}
    >
      {/* Options */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Explore Shape Button */}
        <button
          onClick={onExploreShape}
          style={{
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            padding: '16px',
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            textAlign: 'left',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px' }}>🔍</span>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>
              {t('gallery.modals.explore.shape.label')}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.8rem',
              opacity: 0.9,
              fontWeight: 400,
              paddingLeft: '36px',
            }}
          >
            {t('gallery.modals.explore.shape.description')}
          </span>
        </button>

        {/* Physical Puzzle Available - Informational Hint */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🧩</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
              }}
            >
              {t('gallery.modals.explore.physical.label')}
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.75)',
                fontWeight: 400,
              }}
            >
              {t('gallery.modals.explore.physical.description')}
            </span>
          </div>
        </div>
      </div>
    </ModalBase>
  );
};
