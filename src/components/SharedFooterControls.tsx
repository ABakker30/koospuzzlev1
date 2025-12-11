import React from 'react';

type SolvableStatus = 'unknown' | 'checking' | 'solvable' | 'unsolvable';

interface SharedFooterControlsProps {
  onHint: () => void;
  onSolvability: () => void;
  hidePlaced: boolean;
  onToggleHidePlaced: () => void;
  onReset?: () => void;
  solvableStatus?: SolvableStatus;
}

export const SharedFooterControls: React.FC<SharedFooterControlsProps> = ({
  onHint,
  onSolvability,
  hidePlaced,
  onToggleHidePlaced,
  onReset,
  solvableStatus = 'unknown',
}) => {
  return (
    <>
      <style>{`
        .shared-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 56px;
          background: linear-gradient(0deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 100%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 12px;
          gap: 12px;
          z-index: 1000;
        }
        
        .footer-controls-group {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .footer-btn {
          background: rgba(255,255,255,0.08);
          color: #fff;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 22px;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          transition:
            background 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.12s ease;
        }
        
        .footer-btn:hover {
          background: rgba(255,255,255,0.16);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }

        .footer-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        
        .footer-btn-check {
          padding: 8px 10px;
          min-width: 36px;
        }
        
        .footer-btn-reset {
          background: linear-gradient(135deg, #ef4444, #dc2626);
        }
        
        .footer-btn-reset:hover {
          background: linear-gradient(135deg, #f87171, #ef4444);
        }
        
        @media (max-width: 768px) {
          .shared-footer {
            display: none !important;
          }
        }
      `}</style>
      
      <footer className="shared-footer">
        <div className="footer-controls-group">
          {/* Hide/Show Placed Pieces */}
          <button
            className="footer-btn"
            onClick={onToggleHidePlaced}
            title={hidePlaced ? 'Show placed pieces' : 'Hide placed pieces'}
          >
            {hidePlaced ? '👁️' : '🙈'}
          </button>
          
          {/* Hint Button */}
          <button
            className="footer-btn"
            onClick={onHint}
            title="Get a hint"
          >
            💡
          </button>

          {/* Solvability Check Button */}
          <button
            className="footer-btn footer-btn-check"
            onClick={onSolvability}
            title="Check if this position can still be solved"
            style={{
              background:
                solvableStatus === 'solvable'
                  ? '#16a34a' // green
                  : solvableStatus === 'unsolvable'
                  ? '#dc2626' // red
                  : '#f97316', // orange for unknown/checking
            }}
          >
            ?
          </button>
          
          {/* Reset Button */}
          {onReset && (
            <button
              className="footer-btn footer-btn-reset"
              onClick={onReset}
              title="Reset board"
            >
              🔄
            </button>
          )}
        </div>
      </footer>
    </>
  );
};
