import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../components/ModalBase';
import { tokens } from '../../styles/tokens';

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

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      headerIcon="📖"
      title={t('assemblyGuide.welcome.title')}
      subtitle={t('assemblyGuide.welcome.subtitle')}
      maxWidth={600}
    >
      <div style={{ padding: '8px' }}>
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
                background: tokens.gradient.success,
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
    </ModalBase>
  );
};
