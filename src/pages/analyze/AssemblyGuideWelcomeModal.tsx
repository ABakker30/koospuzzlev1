import React from 'react';
import { useTranslation } from 'react-i18next';

interface AssemblyGuideWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDontShowAgain?: () => void;
}

export const AssemblyGuideWelcomeModal: React.FC<AssemblyGuideWelcomeModalProps> = ({
  isOpen,
  onClose,
  onDontShowAgain,
}) => {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes assemblyWelcomeSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        
        .assembly-guide-modal-content::-webkit-scrollbar {
          width: 8px;
        }
        .assembly-guide-modal-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .assembly-guide-modal-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        .assembly-guide-modal-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .assembly-guide-modal-content {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
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
          className="assembly-guide-modal-content"
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
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'assemblyWelcomeSlideIn 0.3s ease-out',
            zIndex: 10005,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '24px',
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

            <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>📖</div>
            <h2
              style={{
                color: '#fff',
                fontSize: '1.75rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('assemblyGuide.welcome.title')}
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '1rem',
                margin: '8px 0 0 0',
              }}
            >
              {t('assemblyGuide.welcome.subtitle')}
            </p>
          </div>

          {/* Content */}
          <div style={{ padding: '28px' }}>
            {/* Main Purpose */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                padding: '20px',
                borderRadius: '16px',
                marginBottom: '20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🧩</div>
              <p
                style={{
                  color: '#fff',
                  fontSize: '1rem',
                  lineHeight: '1.6',
                  margin: 0,
                }}
              >
                {t('assemblyGuide.welcome.purpose')}
              </p>
            </div>

            {/* Features List */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '20px',
                borderRadius: '16px',
                marginBottom: '20px',
              }}
            >
              <h3
                style={{
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: '0 0 16px 0',
                  textAlign: 'center',
                }}
              >
                {t('assemblyGuide.welcome.featuresTitle')}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Feature 1 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔍</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('assemblyGuide.welcome.feature1Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('assemblyGuide.welcome.feature1Description')}
                    </div>
                  </div>
                </div>

                {/* Feature 2 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>💥</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('assemblyGuide.welcome.feature2Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('assemblyGuide.welcome.feature2Description')}
                    </div>
                  </div>
                </div>

                {/* Feature 3 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>ℹ️</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('assemblyGuide.welcome.feature3Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('assemblyGuide.welcome.feature3Description')}
                    </div>
                  </div>
                </div>

                {/* Feature 4 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🎨</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('assemblyGuide.welcome.feature4Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('assemblyGuide.welcome.feature4Description')}
                    </div>
                  </div>
                </div>

                {/* Feature 5 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🖱️</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('assemblyGuide.welcome.feature5Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('assemblyGuide.welcome.feature5Description')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Don't show again checkbox */}
            {onDontShowAgain && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '0.95rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#10b981',
                  }}
                />
                Don't show this again
              </label>
            )}

            {/* Get Started Button */}
            <button
              onClick={() => {
                if (dontShowAgain && onDontShowAgain) {
                  onDontShowAgain();
                } else {
                  onClose();
                }
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 700,
                padding: '16px',
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
              {t('assemblyGuide.welcome.getStarted')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
