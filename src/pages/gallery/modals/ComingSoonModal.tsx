import React from 'react';
import { useTranslation } from 'react-i18next';

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
  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes comingSoonPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes comingSoonSlideIn {
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
          zIndex: 10004,
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
            borderRadius: '24px',
            padding: '0',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            animation: 'comingSoonSlideIn 0.3s ease-out',
            zIndex: 10005,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '20px',
              borderRadius: '21px 21px 0 0',
              position: 'relative',
              textAlign: 'center',
            }}
          >
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

            <div 
              style={{ 
                fontSize: '4rem', 
                marginBottom: '12px',
                animation: 'comingSoonPulse 2s ease-in-out infinite'
              }}
            >
              {icon}
            </div>
            <h2
              style={{
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('comingSoon.title')}
            </h2>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
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
                  marginBottom: '8px'
                }}
              >
                {featureName}
              </div>
              <div 
                style={{ 
                  color: 'rgba(255, 255, 255, 0.9)', 
                  fontSize: '0.9rem',
                  lineHeight: '1.5'
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
                  fontStyle: 'italic'
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
                background: 'linear-gradient(135deg, #10b981, #059669)',
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
        </div>
      </div>
    </>
  );
};
