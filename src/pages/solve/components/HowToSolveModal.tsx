import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';

interface HowToSolveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToSolveModal: React.FC<HowToSolveModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

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
      </div>
    </InfoModal>
  );
};
