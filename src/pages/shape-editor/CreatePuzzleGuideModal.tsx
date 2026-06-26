import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../components/ModalBase';

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

  const handleClose = () => {
    if (dontShowAgain && onDontShowAgain) {
      onDontShowAgain();
    }
    onClose();
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth={600}
      headerIcon="✨"
      title={t('createGuide.welcome.title')}
      subtitle={t('createGuide.welcome.subtitle')}
    >
      {/* Content */}
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
    </ModalBase>
  );
};
