import React from 'react';
import { useTranslation } from 'react-i18next';

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

  if (!isOpen) return null;

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

      {/* Backdrop */}
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
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '460px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Header */}
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
              onClick={onBack}
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
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
              ←
            </button>

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
                fontSize: '1.25rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('gallery.modals.explore.title')}
            </h2>
          </div>

          {/* Options */}
          <div
            style={{
              padding: '20px',
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
        </div>
      </div>
    </>
  );
};
