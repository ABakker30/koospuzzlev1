import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../../components/ModalBase';

interface PlayAboutPuzzleModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: any;
  cellsCount: number;
  pieces: any[];
  placedCount: number;
  emptyCellsCount: number;
}

export const PlayAboutPuzzleModal: React.FC<PlayAboutPuzzleModalProps> = ({
  isOpen,
  onClose,
  puzzle,
  cellsCount,
  pieces,
  placedCount,
  emptyCellsCount,
}) => {
  const { t } = useTranslation();

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return t('playInfoHub.puzzleModal.unknown');
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return t('playInfoHub.puzzleModal.unknown');
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={t('playInfoHub.puzzleModal.title')}
      maxWidth={560}
      gradient="accent"
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
          {puzzle?.title || 'Untitled Puzzle'}
        </h3>

        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.creator')}:</span>{' '}
          <span style={{ opacity: 0.95 }}>
            {puzzle?.creator_name || t('playInfoHub.puzzleModal.unknown')}
          </span>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.created')}:</span>{' '}
          <span style={{ opacity: 0.95 }}>
            {formatDate(puzzle?.created_at)}
          </span>
        </div>

        <div
          style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.containerSize')}:</span>{' '}
            <span style={{ opacity: 0.95 }}>
              {cellsCount} {t('playInfoHub.puzzleModal.latticeCells')}
            </span>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.availablePieces')}:</span>{' '}
            <span style={{ opacity: 0.95 }}>{pieces.length}</span>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.placedCount')}:</span>{' '}
            <span style={{ opacity: 0.95 }}>{placedCount}</span>
          </div>

          <div>
            <span style={{ fontWeight: 600 }}>{t('playInfoHub.puzzleModal.emptyCells')}:</span>{' '}
            <span style={{ opacity: 0.95 }}>{emptyCellsCount}</span>
          </div>
        </div>

        {puzzle?.description && (
          <div style={{ marginTop: '1.25rem' }}>
            <p style={{ margin: 0, opacity: 0.95, fontStyle: 'italic' }}>
              {puzzle.description}
            </p>
          </div>
        )}
      </div>
    </ModalBase>
  );
};
