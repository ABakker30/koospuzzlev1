// Top Bar for Manual Puzzle Page
// Professional header with consistent styling

import React from 'react';
import { useNavigate } from 'react-router-dom';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

export interface ManualPuzzleTopBarProps {
  onBrowseClick: () => void;
  onViewPieces: () => void;
  loaded: boolean;
  activePiece: string;
  mode: Mode;
  onModeChange: (m: Mode) => void;
}

export const ManualPuzzleTopBar: React.FC<ManualPuzzleTopBarProps> = ({
  onBrowseClick,
  onViewPieces,
  loaded,
  activePiece,
  mode,
  onModeChange
}) => {
  const navigate = useNavigate();
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
        marginBottom: loaded ? ".5rem" : "0"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <button 
            className="btn" 
            style={{ height: "2.5rem" }} 
            onClick={onBrowseClick}
          >
            Browse
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

        {/* Right: Home Button */}
        <button 
          className="btn" 
          onClick={() => navigate('/')}
          style={{ 
            height: "2.5rem",
            width: "2.5rem", 
            minWidth: "2.5rem", 
            padding: "0", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontFamily: "monospace", 
            fontSize: "1.4em" 
          }}
        >
          ⌂
        </button>
      </div>

      {/* Line 2: Mode Selector (only show when loaded) */}
      {loaded && (
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
              minWidth: '140px',
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
      )}
    </div>
  );
};
