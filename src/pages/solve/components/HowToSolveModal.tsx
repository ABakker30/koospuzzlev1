import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';

interface HowToSolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDontShowAgain?: () => void;
}

export const HowToSolveModal: React.FC<HowToSolveModalProps> = ({
  isOpen,
  onClose,
  onDontShowAgain,
}) => {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('infoHub.controlsModal.title')}
    >
      <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
        <p>
          {t('infoHub.controlsModal.intro')}
        </p>

        <p style={{ marginTop: '0.75rem' }}>
          <strong>{t('infoHub.controlsModal.basicControlsTitle')}</strong>
        </p>
        <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
          <li>{t('infoHub.controlsModal.drawPiece')}</li>
          <li>{t('infoHub.controlsModal.cancelDrawing')}</li>
          <li>{t('infoHub.controlsModal.selectPiece')}</li>
          <li>{t('infoHub.controlsModal.deletePiece')}</li>
          <li>{t('infoHub.controlsModal.undoRedo')}</li>
        </ul>

        <p style={{ marginTop: '0.75rem' }}>
          <strong>{t('infoHub.controlsModal.modesTitle')}</strong>
        </p>
        <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
          <li>
            <strong>{t('solve.mode.unique')}:</strong> {t('infoHub.controlsModal.modeUnique')}
          </li>
          <li>
            <strong>{t('solve.mode.unlimited')}:</strong> {t('infoHub.controlsModal.modeUnlimited')}
          </li>
          <li>
            <strong>{t('solve.mode.identical')}:</strong> {t('infoHub.controlsModal.modeIdentical')}
          </li>
        </ul>

        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#f3f4f6',
            borderRadius: '6px',
          }}
        >
          💡 <strong>{t('infoHub.controlsModal.tip')}:</strong> {t('infoHub.controlsModal.tipDescription')}
        </div>

        {/* Don't show again checkbox */}
        {onDontShowAgain && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '1rem',
              cursor: 'pointer',
              color: '#4b5563',
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
                accentColor: '#6366f1',
              }}
            />
            Don't show this again
          </label>
        )}

        {/* Close button */}
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
            marginTop: '1rem',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            padding: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Got it!
        </button>
      </div>
    </InfoModal>
  );
};
