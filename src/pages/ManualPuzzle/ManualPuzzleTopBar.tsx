// Top Bar for Manual Puzzle Page
// Matches KOOS design system with three-zone header layout

import React, { useRef } from 'react';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

export interface ManualPuzzleTopBarProps {
  onHomeClick: () => void;
  onBackToShape: () => void;
  onViewPieces: () => void;
  onInfoClick: () => void;
  onUndo: () => void;
  loaded: boolean;
  isComplete: boolean;
  activePiece: string;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  hidePlacedPieces: boolean;
  onHidePlacedPiecesChange: (hide: boolean) => void;
  canUndo: boolean;
}

export const ManualPuzzleTopBar: React.FC<ManualPuzzleTopBarProps> = ({
  onHomeClick,
  onBackToShape,
  onViewPieces,
  onInfoClick,
  onUndo,
  loaded,
  activePiece,
  mode,
  onModeChange,
  hidePlacedPieces,
  onHidePlacedPiecesChange,
  canUndo
}) => {
  const pillbarRef = useRef<HTMLDivElement>(null);

  return (
    <div className="shape-header">
      {/* Left: Home (fixed) */}
      <div className="header-left">
        <button
          className="pill pill--chrome"
          onClick={onHomeClick}
          title="Home"
        >
          ⌂
        </button>
      </div>

      {/* Center: Scrolling action pills */}
      <div className="header-center" ref={pillbarRef}>
        {loaded && (
          <>
            {/* Mode Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                value={mode}
                onChange={(e) => onModeChange(e.target.value as Mode)}
                className="pill pill--primary"
                style={{
                  appearance: 'none',
                  paddingRight: '28px',
                  cursor: 'pointer',
                  border: 0,
                  outline: 0
                }}
                title="Select puzzle mode"
              >
                <option value="unlimited">Unlimited</option>
                <option value="oneOfEach">One of each</option>
                <option value="single">Single piece</option>
              </select>
              <span style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#fff',
                fontSize: '0.7rem'
              }}>▼</span>
            </div>

            {/* Select Piece */}
            <button
              className="pill pill--ghost"
              onClick={onViewPieces}
              title="Select piece to place (shortcut: K)"
            >
              Select Piece ({activePiece})
            </button>

            {/* Hide Placed Toggle */}
            <button
              className={`pill ${hidePlacedPieces ? 'pill--primary' : 'pill--ghost'}`}
              onClick={() => onHidePlacedPiecesChange(!hidePlacedPieces)}
              title={hidePlacedPieces ? "Show placed pieces" : "Hide placed pieces to see inner cells"}
            >
              {hidePlacedPieces ? 'Show Placed' : 'Hide Placed'}
            </button>

            {/* Undo */}
            <button
              className="pill pill--ghost"
              onClick={onUndo}
              disabled={!canUndo}
              title={canUndo ? "Undo last placement" : "Nothing to undo"}
            >
              Undo
            </button>

            {/* Back to Shape */}
            <button
              className="pill pill--ghost"
              onClick={onBackToShape}
              title="Return to Shape Page"
            >
              Back to Shape
            </button>
          </>
        )}
      </div>

      {/* Right: Info (fixed) */}
      <div className="header-right">
        <button
          className="pill pill--chrome"
          onClick={onInfoClick}
          title="About this page"
        >
          ℹ
        </button>
      </div>
    </div>
  );
};
