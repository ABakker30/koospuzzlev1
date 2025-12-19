import React from 'react';
import { useTranslation } from 'react-i18next';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalFadeIn 0.3s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '20px 24px',
              borderRadius: '18px 18px 0 0',
              textAlign: 'center',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '28px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
                transition: 'color 0.2s',
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
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('about.title')}
            </h2>
          </div>

          {/* Content */}
          <div
            style={{
              padding: '20px 24px',
              color: '#fff',
              lineHeight: 1.6,
            }}
          >
            {/* App Description */}
            <div style={{ marginBottom: '20px' }}>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: '0 0 10px 0',
                  color: '#fff',
                  textShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                }}
              >
                {t('about.whatIs.title')}
              </h3>
              <p
                style={{
                  fontSize: '0.95rem',
                  color: 'rgba(255, 255, 255, 0.95)',
                  margin: 0,
                  textShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                }}
              >
                {t('about.whatIs.description')}
              </p>
            </div>

            {/* Features */}
            <div style={{ marginBottom: '20px' }}>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: '0 0 12px 0',
                  color: '#fff',
                  textShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                }}
              >
                {t('about.features.title')}
              </h3>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.9rem',
                    color: 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🧩</span>
                  <span>{t('about.features.solve')}</span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.9rem',
                    color: 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🎨</span>
                  <span>{t('about.features.create')}</span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.9rem',
                    color: 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🤖</span>
                  <span>{t('about.features.auto')}</span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.9rem',
                    color: 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🌍</span>
                  <span>{t('about.features.multilingual')}</span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.9rem',
                    color: 'rgba(255, 255, 255, 0.95)',
                  }}
                >
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>💾</span>
                  <span>{t('about.features.share')}</span>
                </li>
              </ul>
            </div>

            {/* Version Info */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '2px solid rgba(255, 255, 255, 0.2)',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.8)',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: '0 0 6px 0' }}>
                {t('about.madeWith')} 💜
              </p>
              <p style={{ margin: 0 }}>
                Version 81.11.0
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
