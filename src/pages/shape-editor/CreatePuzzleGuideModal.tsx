import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CreatePuzzleGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDontShowAgain?: () => void;
}

export const CreatePuzzleGuideModal: React.FC<CreatePuzzleGuideModalProps> = ({
  isOpen,
  onClose,
  onDontShowAgain,
}) => {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  
  if (!isOpen) return null;
  
  const handleClose = () => {
    if (dontShowAgain && onDontShowAgain) {
      onDontShowAgain();
    }
    onClose();
  };

  return (
    <>
      <style>{`
        @keyframes createPuzzleSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        
        .create-puzzle-modal-content::-webkit-scrollbar {
          width: 8px;
        }
        .create-puzzle-modal-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .create-puzzle-modal-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        .create-puzzle-modal-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .create-puzzle-modal-content {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleClose}
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
          className="create-puzzle-modal-content"
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
            animation: 'createPuzzleSlideIn 0.3s ease-out',
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
              onClick={handleClose}
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

            <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>✨</div>
            <h2
              style={{
                color: '#fff',
                fontSize: '1.75rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {t('createGuide.welcome.title')}
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '1rem',
                margin: '8px 0 0 0',
              }}
            >
              {t('createGuide.welcome.subtitle')}
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
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎨</div>
              <p
                style={{
                  color: '#fff',
                  fontSize: '1rem',
                  lineHeight: '1.6',
                  margin: 0,
                }}
              >
                {t('createGuide.welcome.purpose')}
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
                {t('createGuide.welcome.featuresTitle')}
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
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>➕</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('createGuide.welcome.feature1Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('createGuide.welcome.feature1Description')}
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
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔄</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('createGuide.welcome.feature2Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('createGuide.welcome.feature2Description')}
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
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🎬</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('createGuide.welcome.feature3Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('createGuide.welcome.feature3Description')}
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
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>💾</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('createGuide.welcome.feature4Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('createGuide.welcome.feature4Description')}
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
                  <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🌍</div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}>
                      {t('createGuide.welcome.feature5Title')}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                      {t('createGuide.welcome.feature5Description')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Don't show again checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.95rem',
                cursor: 'pointer',
                padding: '12px 0',
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
              {t('createGuide.welcome.dontShowAgain', "Don't show this again")}
            </label>
          </div>
        </div>
      </div>
    </>
  );
};
