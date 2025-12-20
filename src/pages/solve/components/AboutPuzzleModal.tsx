import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoModal } from '../../../components/InfoModal';
import { estimatePuzzleComplexity } from '../utils/manualSolveHelpers';
import type { SearchSpaceStats } from '../../../engines/engine2/searchSpace';

type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';

interface AboutPuzzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: any;
  mode: Mode;
  cellsCount: number;
  pieces: string[];
  placedCount: number;
  emptyCellsCount: number;
  complexity: ReturnType<typeof estimatePuzzleComplexity>;
  searchSpaceStats?: SearchSpaceStats | null;
}

export const AboutPuzzleModal: React.FC<AboutPuzzleModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  mode,
  cellsCount,
  pieces,
  placedCount,
  emptyCellsCount,
  complexity,
  searchSpaceStats,
}) => {
  const { t } = useTranslation();

  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('infoHub.puzzleModal.title')}
    >
      <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
        <p>
          <strong>{t('infoHub.puzzleModal.creator')}:</strong>{' '}
          {(puzzle as any)?.created_by ||
            (puzzle as any)?.author ||
            t('infoHub.puzzleModal.unknown')}
        </p>
        <p>
          <strong>{t('infoHub.puzzleModal.created')}:</strong>{' '}
          {(puzzle as any)?.created_at
            ? new Date((puzzle as any).created_at).toLocaleString()
            : t('infoHub.puzzleModal.unknown')}
        </p>

        <p style={{ marginTop: '0.75rem' }}>
          <strong>{t('infoHub.puzzleModal.currentMode')}:</strong>{' '}
          {mode === 'oneOfEach'
            ? t('solve.mode.unique')
            : mode === 'unlimited'
            ? t('solve.mode.unlimited')
            : mode === 'customSet'
            ? t('solve.mode.custom')
            : t('solve.mode.identical')}
        </p>

        <p>
          <strong>{t('infoHub.puzzleModal.containerSize')}:</strong> {cellsCount} {t('infoHub.puzzleModal.latticeCells')}
        </p>

        <p>
          <strong>{t('infoHub.puzzleModal.availablePieces')}:</strong>{' '}
          {(() => {
            const allowed =
              ((puzzle as any)?.allowed_piece_ids as string[] | undefined) ||
              pieces;
            return allowed.join(', ');
          })()}
        </p>

        <p>
          <strong>{t('infoHub.puzzleModal.placedCount')}:</strong> {placedCount}
        </p>

        <p>
          <strong>{t('infoHub.puzzleModal.emptyCells')}:</strong> {emptyCellsCount}
        </p>

        <div
          style={{
            marginTop: '0.9rem',
            padding: '0.75rem',
            background: '#f3f4f6',
            borderRadius: '6px',
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{t('infoHub.puzzleModal.difficulty')}:</strong> {complexity.level}
          </p>
          <p style={{ margin: '0.35rem 0 0 0' }}>{complexity.description}</p>
          {searchSpaceStats ? (
            <>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '12px' }}>
                <strong>{t('infoHub.puzzleModal.searchSpace')}:</strong>{' '}
                <code style={{ fontSize: '13px', fontWeight: 600 }}>
                  {searchSpaceStats.upperBounds.fixedInventoryNoOverlap.sci}
                </code>
              </p>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '11px', color: '#6b7280' }}>
                ~10^{Math.floor(searchSpaceStats.upperBounds.fixedInventoryNoOverlap.log10)} {t('infoHub.puzzleModal.combinations')}
                ({searchSpaceStats.totalPlacements.toLocaleString()} {t('infoHub.puzzleModal.totalPlacements')})
              </p>
            </>
          ) : complexity.orderOfMagnitude !== null ? (
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '12px' }}>
              {t('infoHub.puzzleModal.roughSearchSpace')}{' '}
              <code>10^{complexity.orderOfMagnitude}</code> {t('infoHub.puzzleModal.possiblePlacements')}.
            </p>
          ) : null}
        </div>
      </div>
    </InfoModal>
  );
};
