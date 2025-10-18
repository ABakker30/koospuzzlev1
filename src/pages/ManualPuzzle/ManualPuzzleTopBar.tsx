// Top Bar for Manual Puzzle Page
// Professional header with consistent styling

import React from 'react';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

export interface ManualPuzzleTopBarProps {
  onBrowseClick: () => void;
  onSaveClick: () => void;
  onViewPieces: () => void;
  onHomeClick: () => void;
  onStudioClick: () => void;
  loaded: boolean;
  isComplete: boolean;
  activePiece: string;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onInfoClick: () => void;
  hidePlacedPieces: boolean;
  onHidePlacedPiecesChange: (hide: boolean) => void;
  revealK: number;
  revealMax: number;
  onRevealChange: (k: number) => void;
}

export const ManualPuzzleTopBar: React.FC<ManualPuzzleTopBarProps> = ({
  onBrowseClick,
  onSaveClick,
  onViewPieces,
  onHomeClick,
  onStudioClick,
  loaded,
  isComplete,
  activePiece,
  mode,
  onModeChange,
  onInfoClick,
  hidePlacedPieces,
  onHidePlacedPiecesChange,
  revealK,
  revealMax,
  onRevealChange
}) => {
  const isMobile = window.innerWidth <= 768;

  return (
    <div style={{
      padding: isMobile ? ".5rem .75rem" : ".75rem 1rem",
      borderBottom: "1px solid #eee",
      background: "#fff"
    }}>
      {/* Line 1: Browse + Select Piece | Home */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: loaded ? "0.5rem" : "0"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button 
            className="btn" 
            style={{ height: "2.5rem" }} 
            onClick={onBrowseClick}
          >
            Browse
          </button>
          
          <button 
            className="btn primary" 
            style={{ height: "2.5rem", opacity: isComplete ? 1 : 0.5 }} 
            onClick={onSaveClick}
            disabled={!isComplete}
            title={isComplete ? "Save your solution" : "Complete the puzzle to save"}
          >
            💾 Save
          </button>
          
          <button 
            className="btn" 
            style={{ height: "2.5rem" }} 
            onClick={onViewPieces}
            disabled={!loaded}
          >
            Select Piece {activePiece && `(${activePiece})`}
          </button>
        </div>

        {/* Right: Info + Studio + Home Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button 
            className="btn" 
            onClick={onInfoClick}
            style={{ 
              height: "2.5rem",
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: "1.5em" 
            }}
            title="Help & Information"
          >
            ℹ
          </button>
          
          <button 
            className="btn" 
            onClick={onStudioClick}
            disabled={!isComplete}
            style={{ 
              height: "2.5rem",
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: "1.5em",
              opacity: isComplete ? 1 : 0.5
            }}
            title="Open in Studio"
          >
            📷
          </button>
          
          <button 
            className="btn" 
            onClick={onHomeClick}
            style={{ 
              height: "2.5rem",
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: "1.5em" 
            }}
            title="Home (saves current state)"
          >
            <span style={{ fontSize: "1.8em", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>⌂</span>
          </button>
        </div>
      </div>

      {/* Line 2: Mode Selector + Hide Checkbox (only show when loaded) */}
      {loaded && (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: isMobile ? "0.5rem" : "1rem",
          flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              whiteSpace: 'nowrap',
              fontWeight: '500'
            }}>
              Mode:
            </label>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as Mode)}
              style={{ 
                padding: '6px 10px', 
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                minWidth: isMobile ? '110px' : '140px',
                height: '2.25rem',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="unlimited">Unlimited</option>
              <option value="oneOfEach">One-of-Each</option>
              <option value="single">Single Piece</option>
            </select>
          </div>
          
          {/* Hide Placed Pieces Checkbox */}
          <label style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: '#6b7280',
            fontWeight: '500',
            cursor: 'pointer',
            userSelect: 'none',
            whiteSpace: isMobile ? 'nowrap' : 'normal'
          }}>
            <input
              type="checkbox"
              checked={hidePlacedPieces}
              onChange={(e) => onHidePlacedPiecesChange(e.target.checked)}
            />
            {isMobile ? 'Hide' : 'Hide Placed Pieces'}
          </label>
          
          {/* Reveal Slider (only show when puzzle is complete) */}
          {isComplete && revealMax > 0 && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "0.5rem", 
              marginLeft: isMobile ? "0" : "1rem",
              width: isMobile ? "100%" : "auto"
            }}>
              <span style={{ fontSize: "0.875rem", fontWeight: "500", whiteSpace: "nowrap", color: '#6b7280' }}>
                Reveal: {revealK}/{revealMax}
              </span>
              <input
                type="range"
                min={1}
                max={revealMax}
                step={1}
                value={revealK}
                onChange={(e) => onRevealChange(parseInt(e.target.value, 10))}
                style={{ 
                  minWidth: isMobile ? "0" : "120px",
                  flex: isMobile ? "1" : "0 0 auto"
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
