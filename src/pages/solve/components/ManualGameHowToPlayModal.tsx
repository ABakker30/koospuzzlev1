import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';

interface ManualGameHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualGameHowToPlayModal: React.FC<ManualGameHowToPlayModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  
  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('howToPlay.title')}
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}><strong>{t('howToPlay.overview.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.overview.description')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.placingPiece.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.placingPiece.rule')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.solvabilityIndicator.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.solvabilityIndicator.orange')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.solvabilityIndicator.green')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.solvabilityIndicator.red')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.winLose.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.winLose.lose')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.winLose.draw')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.winLose.noMoves')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.noUndos.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.noUndos.rule')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.goal.label')}</strong> {t('howToPlay.goal.description')}</p>

        <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid rgba(59, 130, 246, 0.3)' }} />

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.mechanics.title')}</strong></p>
        
        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>{t('howToPlay.mechanics.placing.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.placing.step1')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.placing.step2')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.placing.step3')}
        </p>

        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>{t('howToPlay.mechanics.selecting.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.selecting.action')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.selecting.highlight')}
        </p>
      </div>
    </InfoModal>
  );
};
