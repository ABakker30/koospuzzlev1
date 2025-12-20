import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';

type SolveMode = 'rated' | 'unrated';

interface AboutModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: SolveMode;
}

export const AboutModeModal: React.FC<AboutModeModalProps> = ({
  isOpen,
  onClose,
  mode,
}) => {
  const { t } = useTranslation();
  const isRated = mode === 'rated';

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      title={t(isRated ? 'infoHub.modeModal.ratedTitle' : 'infoHub.modeModal.unratedTitle')}
    >
      <div style={{ lineHeight: '1.7', fontSize: '15px' }}>
        {isRated ? (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{t('infoHub.modeModal.ratedDescription')}</strong>
            </p>
            <p>
              • {t('infoHub.modeModal.ratedRule1')}
            </p>
            <p>
              • {t('infoHub.modeModal.ratedRule2')}
            </p>
            <p>
              • {t('infoHub.modeModal.ratedRule3')}
            </p>
            <p>
              • {t('infoHub.modeModal.ratedRule4')}
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              🏆 {t('infoHub.modeModal.ratedStrategy')}
            </p>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{t('infoHub.modeModal.unratedDescription')}</strong>
            </p>
            <p>
              • {t('infoHub.modeModal.unratedRule1')}
            </p>
            <p>
              • {t('infoHub.modeModal.unratedRule2')}
            </p>
            <p>
              • {t('infoHub.modeModal.unratedRule3')}
            </p>
            <p>
              • {t('infoHub.modeModal.unratedRule4')}
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              🌱 {t('infoHub.modeModal.unratedTip')}
            </p>
          </>
        )}
      </div>
    </InfoModal>
  );
};
