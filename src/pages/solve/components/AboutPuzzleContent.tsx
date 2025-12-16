// About Puzzle content component
import React from 'react';
import { estimatePuzzleComplexity } from '../utils/manualSolveHelpers';
import type { SearchSpaceStats } from '../../../engines/engine2/searchSpace';

type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';

type AboutPuzzleContentProps = {
  puzzle: any; // or a proper type later
  mode: Mode;
  cellsCount: number;
  pieces: string[];
  placedCount: number;
  emptyCellsCount: number;
  complexity: ReturnType<typeof estimatePuzzleComplexity>;
  searchSpaceStats?: SearchSpaceStats | null;
  onOpenHowTo: () => void;
};

export const AboutPuzzleContent: React.FC<AboutPuzzleContentProps> = ({
  puzzle,
  mode,
  cellsCount,
  pieces,
  placedCount,
  emptyCellsCount,
  complexity,
  searchSpaceStats,
  onOpenHowTo,
}) => (
  <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
    <p>
      <strong>Creator:</strong>{' '}
      {(puzzle as any)?.created_by ||
        (puzzle as any)?.author ||
        'Unknown'}
    </p>
    <p>
      <strong>Created:</strong>{' '}
      {(puzzle as any)?.created_at
        ? new Date((puzzle as any).created_at).toLocaleString()
        : 'Unknown'}
    </p>

    <p style={{ marginTop: '0.75rem' }}>
      <strong>Current solve mode:</strong>{' '}
      {mode === 'oneOfEach'
        ? 'One of each piece'
        : mode === 'unlimited'
        ? 'Unlimited pieces'
        : mode === 'customSet'
        ? 'Custom set (inventory)'
        : 'Single piece mode'}
    </p>

    <p>
      <strong>Container size:</strong> {cellsCount} lattice cells
    </p>

    <p>
      <strong>Available pieces:</strong>{' '}
      {(() => {
        const allowed =
          ((puzzle as any)?.allowed_piece_ids as string[] | undefined) ||
          pieces;
        return allowed.join(', ');
      })()}
    </p>

    <p>
      <strong>Pieces already placed:</strong> {placedCount}
    </p>

    <p>
      <strong>Remaining empty cells:</strong> {emptyCellsCount}
    </p>

    {/* Complexity estimate */}
    <div
      style={{
        marginTop: '0.9rem',
        padding: '0.75rem',
        background: '#f3f4f6',
        borderRadius: '6px',
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>Estimated difficulty:</strong> {complexity.level}
      </p>
      <p style={{ margin: '0.35rem 0 0 0' }}>{complexity.description}</p>
      {searchSpaceStats ? (
        <>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '12px' }}>
            <strong>Search space (upper bound):</strong>{' '}
            <code style={{ fontSize: '13px', fontWeight: 600 }}>
              {searchSpaceStats.upperBounds.fixedInventoryNoOverlap.sci}
            </code>
          </p>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '11px', color: '#6b7280' }}>
            ~10^{Math.floor(searchSpaceStats.upperBounds.fixedInventoryNoOverlap.log10)} combinations
            ({searchSpaceStats.totalPlacements.toLocaleString()} total placements)
          </p>
        </>
      ) : complexity.orderOfMagnitude !== null ? (
        <p style={{ margin: '0.35rem 0 0 0', fontSize: '12px' }}>
          Rough search space on the order of{' '}
          <code>10^{complexity.orderOfMagnitude}</code> possible
          placements.
        </p>
      ) : null}
    </div>

    {/* Link to How to puzzle */}
    <div
      style={{
        marginTop: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <button
        type="button"
        onClick={onOpenHowTo}
        style={{
          padding: '0.4rem 0.9rem',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '13px',
          background: '#e5e7eb',
          color: '#111827',
        }}
      >
        📖 How to puzzle
      </button>
    </div>
  </div>
);
