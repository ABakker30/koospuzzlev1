// InstallAppPrompt — the "install at the peak" card. Mounted once in App;
// appears when installService.offerInstallAtPeak() fires after a win.
// Chromium: one tap opens the browser's real install dialog. iOS: shows the
// Share → Add to Home Screen steps (no prompt API exists there).

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from './ModalBase';
import { isIOS, canPromptInstall, promptInstall, onInstallOffer } from '../services/installService';
import { tokens } from '../styles/tokens';

export const InstallAppPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => onInstallOffer(() => setIsOpen(true)), []);

  if (!isOpen) return null;

  const ios = isIOS() && !canPromptInstall();

  const handleInstall = async () => {
    setIsOpen(false);
    await promptInstall();
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      size="sm"
      headerIcon="📲"
      title={t('install.title')}
      subtitle={t('install.subtitle')}
      footer={
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: `${tokens.radius.md}px`,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'transparent',
              color: tokens.text.onGradient,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('install.notNow')}
          </button>
          {!ios && (
            <button
              onClick={handleInstall}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: `${tokens.radius.md}px`,
                border: 'none',
                background: tokens.gradient.success,
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('install.install')}
            </button>
          )}
        </div>
      }
    >
      {ios ? (
        <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px' }}>
            {t('install.iosIntro')}
          </p>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>{t('install.iosStep1')}</li>
            <li>{t('install.iosStep2')}</li>
          </ol>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>
          {t('install.body')}
        </p>
      )}
    </ModalBase>
  );
};
