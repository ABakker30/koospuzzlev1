import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

interface AutoSolveHowToModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoSolveHowToModal: React.FC<AutoSolveHowToModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={560}
      gradient="info"
      title={t('autoSolveInfoHub.howToModal.title')}
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
        <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>
          {t('autoSolveInfoHub.howToModal.intro')}
        </p>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.whatItDoes.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.whatItDoes.description')}
          </p>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.strategies.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.strategies.exhaustive')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.strategies.balanced')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.strategies.fast')}
          </p>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.timeComplexity.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.timeComplexity.description')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.timeComplexity.factors')}
          </p>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.controls.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.controls.start')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.controls.stop')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.controls.reveal')}
          </p>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.controls.explode')}
          </p>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.observation.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.observation.description')}
          </p>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
            {t('autoSolveInfoHub.howToModal.verification.title')}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
            {t('autoSolveInfoHub.howToModal.verification.description')}
          </p>
        </div>

        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '1.5rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
            💡 {t('autoSolveInfoHub.howToModal.tip')}
          </p>
        </div>
      </div>
    </ModalBase>
  );
};
