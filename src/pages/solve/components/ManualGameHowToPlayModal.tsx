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
        <p style={{ marginTop: 0 }}><strong>{t('howToPlay.placingPiece.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.placingPiece.rule')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.usingHint.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.usingHint.step1')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.usingHint.step2')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.usingHint.step3')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.hideShow.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.hideShow.description')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.hideShow.useful')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.removingPiece.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.removingPiece.rule')}
        </p>

        <p style={{ marginTop: '1rem' }}><strong>{t('howToPlay.checkingSolvability.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.checkingSolvability.description')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.checkingSolvability.stillSolvable')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.checkingSolvability.notSolvable')}
        </p>
        <p style={{ marginTop: '0.5rem', marginLeft: '1rem', fontStyle: 'italic' }}>
          {t('howToPlay.checkingSolvability.strategy')}
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

        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>{t('howToPlay.mechanics.deleting.title')}</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.deleting.doubleClick')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.deleting.alternative')}
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          {t('howToPlay.mechanics.deleting.reminder')}
        </p>
      </div>
    </InfoModal>
  );
};
