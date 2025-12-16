import React from 'react';

type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';

type ManualSolveFooterProps = {
  mode: Mode;
  activePiece: string;
  pieces: string[];
  placedCountByPieceId: Record<string, number>;
  placedCount: number;

  revealK: number;
  revealMax: number;
  onChangeRevealK: (value: number) => void;

  explosionFactor: number;
  onChangeExplosionFactor: (value: number) => void;

  onChangeActivePiece: (pieceId: string) => void;
  onReset: () => void;
};

export const ManualSolveFooter: React.FC<ManualSolveFooterProps> = ({
  mode,
  activePiece,
  pieces,
  placedCountByPieceId,
  placedCount,
  revealK,
  revealMax,
  onChangeRevealK,
  explosionFactor,
  onChangeExplosionFactor,
  onChangeActivePiece,
  onReset,
}) => {
  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .page-footer {
            display: none !important;
          }
        }
      `}</style>
      <footer className="page-footer">
        <div className="footer-section">
          <label>Active Piece:</label>
          <select
            value={activePiece}
            onChange={e => onChangeActivePiece(e.target.value)}
            className="select"
            style={{ fontSize: '16px', padding: '8px 12px', minWidth: '80px' }}
            disabled={mode === 'single' && placedCount > 0}
            title={
              mode === 'single' && placedCount > 0
                ? 'Locked to first piece placed'
                : ''
            }
          >
            {pieces.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span
            style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}
          >
            {mode === 'oneOfEach'
              ? `(${placedCountByPieceId[activePiece] || 0}/1)` 
              : mode === 'single'
              ? placedCount === 0
                ? '(Draw any piece first)'
                : '(Locked)'
              : `(${placedCountByPieceId[activePiece] || 0} placed)`}
          </span>
        </div>

        <div className="footer-section">
          <label>
            Reveal: {revealK}/{revealMax}
            <input
              type="range"
              min="0"
              max={revealMax}
              value={revealK}
              onChange={e => onChangeRevealK(Number(e.target.value))}
              style={{ width: '150px', marginLeft: '8px' }}
            />
          </label>
          <label>
            Explode: {explosionFactor.toFixed(2)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={explosionFactor}
              onChange={e =>
                onChangeExplosionFactor(Number(e.target.value))
              }
              style={{ width: '150px', marginLeft: '8px' }}
            />
          </label>
        </div>

        <div
          className="footer-section"
          style={{ display: 'flex', gap: '8px' }}
        >
          <button onClick={onReset} className="btn btn-warning">
            🔄 Reset
          </button>
        </div>
      </footer>
    </>
  );
};
