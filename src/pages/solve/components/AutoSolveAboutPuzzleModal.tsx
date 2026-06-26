import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';
import type { SearchSpaceStats } from '../../../engines/engine2/searchSpace';

interface AutoSolveAboutPuzzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: any;
  searchSpaceStats?: SearchSpaceStats | null;
}

export const AutoSolveAboutPuzzleModal: React.FC<AutoSolveAboutPuzzleModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  searchSpaceStats,
}) => {
  const { t } = useTranslation();

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={t('autoSolveInfoHub.aboutPuzzle')}
      maxWidth={560}
      gradient="info"
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>
            {t('infoHub.puzzleModal.creator')}:
          </p>
          <p style={{ margin: 0, opacity: 0.95 }}>
            {puzzle?.created_by || puzzle?.author || t('infoHub.puzzleModal.unknown')}
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>
            {t('infoHub.puzzleModal.created')}:
          </p>
          <p style={{ margin: 0, opacity: 0.95 }}>
            {puzzle?.created_at
              ? new Date(puzzle.created_at).toLocaleDateString()
              : t('infoHub.puzzleModal.unknown')}
          </p>
        </div>

        {searchSpaceStats && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
          }}>
            <p style={{ margin: '0 0 0.75rem 0', fontWeight: 700, fontSize: '1rem' }}>
              📊 {t('autoSolveInfoHub.howToModal.timeComplexity.title')}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95, fontSize: '0.85rem' }}>
              <strong>Search Space Upper Bound:</strong>
            </p>
            <p style={{
              margin: '0 0 0.5rem 0',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              opacity: 0.95,
            }}>
              {searchSpaceStats.upperBounds.fixedInventoryNoOverlap.sci}
            </p>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.85 }}>
              ~10^{Math.floor(searchSpaceStats.upperBounds.fixedInventoryNoOverlap.log10)} combinations
              ({searchSpaceStats.totalPlacements.toLocaleString()} total placements)
            </p>
          </div>
        )}

        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '1.5rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.9 }}>
            💡 {t('autoSolveInfoHub.howToModal.observation.description')}
          </p>
        </div>
      </div>
    </ModalBase>
  );
};
