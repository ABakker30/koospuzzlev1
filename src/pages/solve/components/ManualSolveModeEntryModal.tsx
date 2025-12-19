import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';

type SolveMode = 'rated' | 'unrated';

interface ManualSolveModeEntryModalProps {
  isOpen: boolean;
  mode: SolveMode;
  onStart: () => void;
}

export const ManualSolveModeEntryModal: React.FC<ManualSolveModeEntryModalProps> = ({
  isOpen,
  mode,
  onStart,
}) => {
  const { t } = useTranslation();
  const isRated = mode === 'rated';

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onStart}
      title={t(isRated ? 'modal.solveRated.title' : 'modal.solveUnrated.title')}
    >
      <div style={{ lineHeight: '1.7', fontSize: '15px' }}>
        {isRated ? (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{t('modal.solveRated.description')}</strong>
            </p>
            <p>
              • {t('modal.solveRated.rule1')}
            </p>
            <p>
              • {t('modal.solveRated.rule2')}
            </p>
            <p>
              • {t('modal.solveRated.rule3')}
            </p>
            <p>
              • {t('modal.solveRated.rule4')}
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              💡 {t('modal.solveRated.strategy')}
            </p>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{t('modal.solveUnrated.description')}</strong>
            </p>
            <p>
              • {t('modal.solveUnrated.rule1')}
            </p>
            <p>
              • {t('modal.solveUnrated.rule2')}
            </p>
            <p>
              • {t('modal.solveUnrated.rule3')}
            </p>
            <p style={{ marginTop: '1rem', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              🌱 {t('modal.solveUnrated.tip')}
            </p>
          </>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={onStart}
            style={{
              background: isRated 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
          >
            {t(isRated ? 'modal.solveRated.startButton' : 'modal.solveUnrated.startButton')}
          </button>
        </div>
      </div>
    </InfoModal>
  );
};
