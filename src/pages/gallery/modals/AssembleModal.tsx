import React from 'react';
import { useTranslation } from 'react-i18next';

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
          zIndex: 10002,
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
            background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10003,
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
            {/* Back Button */}
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

            {/* Close Button */}
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
                fontSize: '1.1rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('gallery.modals.assemble.title')}
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
                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
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
        </div>
      </div>
    </>
  );
};
