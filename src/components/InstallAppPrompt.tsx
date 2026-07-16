// InstallAppPrompt — the "install at the peak" card. Mounted once in App;
// appears when installService.offerInstallAtPeak() fires after a win.
// Chromium: one tap opens the browser's real install dialog. iOS: shows the
// Share → Add to Home Screen steps (no prompt API exists there).

import React, { useEffect, useState } from 'react';
import { ModalBase } from './ModalBase';
import { isIOS, canPromptInstall, promptInstall, onInstallOffer } from '../services/installService';
import { tokens } from '../styles/tokens';

export const InstallAppPrompt: React.FC = () => {
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
      title="Nice solve — keep it close"
      subtitle="Add Koos Puzzle to your home screen"
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
            Not now
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
              Install
            </button>
          )}
        </div>
      }
    >
      {ios ? (
        <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px' }}>
            Get the full-screen app with an icon on your home screen:
          </p>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Tap the <strong>Share</strong> button <span aria-hidden>⎋</span> in Safari</li>
            <li>Choose <strong>"Add to Home Screen"</strong></li>
          </ol>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>
          One tap installs Koos Puzzle as an app — full screen, its own icon,
          ready for your next challenge.
        </p>
      )}
    </ModalBase>
  );
};
