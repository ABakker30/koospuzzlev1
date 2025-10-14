// Top Bar for Manual Puzzle Page
// MVP: Browse button, visibility controls, home button

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisibilitySettings } from '../../types/lattice';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

export interface ManualPuzzleTopBarProps {
  onBrowseClick: () => void;
  visibility: VisibilitySettings;
  onVisibilityChange: (updates: Partial<VisibilitySettings>) => void;
  onResetView: () => void;
  loaded: boolean;
  pieces: string[];
  activePiece: string;
  onActivePieceChange: (id: string) => void;
  containerOpacity: number;
  onContainerOpacityChange: (opacity: number) => void;
  containerColor: string;
  onContainerColorChange: (color: string) => void;
  containerRoughness: number;
  onContainerRoughnessChange: (roughness: number) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  availablePieces: string[];
}

export const ManualPuzzleTopBar: React.FC<ManualPuzzleTopBarProps> = ({
  onBrowseClick,
  visibility,
  onVisibilityChange,
  onResetView,
  loaded,
  pieces,
  activePiece,
  onActivePieceChange,
  containerOpacity,
  onContainerOpacityChange,
  containerColor,
  onContainerColorChange,
  containerRoughness,
  onContainerRoughnessChange,
  mode,
  onModeChange,
  availablePieces
}) => {
  const navigate = useNavigate();
  const isMobile = window.innerWidth <= 768;

  return (
    <div style={{
      padding: isMobile ? ".5rem .75rem" : ".75rem 1rem",
      borderBottom: "1px solid #eee",
      background: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: isMobile ? 'wrap' : 'nowrap',
      gap: isMobile ? '0.5rem' : '1rem'
    }}>
      {/* Left: Title + Browse + Active Piece */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: isMobile ? '1.25rem' : '1.5rem', 
          fontWeight: 600 
        }}>
          Manual Puzzle
        </h1>
        <button 
          className="btn primary" 
          style={{ height: "2.5rem" }} 
          onClick={onBrowseClick}
        >
          Browse Shapes
        </button>
        
        {/* Mode Selector */}
        <div style={{ display: 'inline-flex', gap: 6, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          {(['oneOfEach', 'unlimited', 'single'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
              disabled={!loaded}
              style={{
                padding: '4px 8px',
                border: 'none',
                background: mode === m ? '#111827' : '#fff',
                color: mode === m ? '#fff' : '#111827',
                cursor: loaded ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                opacity: loaded ? 1 : 0.5
              }}
            >
              {m === 'oneOfEach' ? 'One-of-Each' : m === 'unlimited' ? 'Unlimited' : 'Single Piece'}
            </button>
          ))}
        </div>
        
        {/* Active Piece Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label style={{ fontSize: '0.875rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
            Active Piece
          </label>
          <select
            value={activePiece}
            onChange={(e) => onActivePieceChange(e.target.value)}
            disabled={!loaded || availablePieces.length === 0}
            style={{ 
              padding: '4px 8px', 
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              minWidth: '60px'
            }}
          >
            <option value="" disabled>{mode === 'single' ? 'Pick piece' : 'Select piece'}</option>
            {availablePieces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {mode === 'single' && activePiece && (
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
              (limited to {activePiece})
            </span>
          )}
        </div>
      </div>

      {/* Right: Visibility Controls + Home */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "0.75rem",
        flexWrap: 'wrap'
      }}>
        {/* X-Ray Toggle */}
        <label style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem",
          cursor: loaded ? 'pointer' : 'not-allowed',
          opacity: loaded ? 1 : 0.5,
          fontSize: '0.9rem'
        }}>
          <input
            type="checkbox"
            checked={visibility.xray}
            onChange={(e) => onVisibilityChange({ xray: e.target.checked })}
            disabled={!loaded}
            style={{ cursor: loaded ? 'pointer' : 'not-allowed' }}
          />
          <span>X-Ray</span>
        </label>

        {/* Empty-Only Toggle */}
        <label style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem",
          cursor: loaded ? 'pointer' : 'not-allowed',
          opacity: loaded ? 1 : 0.5,
          fontSize: '0.9rem'
        }}>
          <input
            type="checkbox"
            checked={visibility.emptyOnly}
            onChange={(e) => onVisibilityChange({ emptyOnly: e.target.checked })}
            disabled={!loaded}
            style={{ cursor: loaded ? 'pointer' : 'not-allowed' }}
          />
          <span>Empty-Only</span>
        </label>

        {/* Slice Y Control */}
        {!isMobile && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem",
            opacity: loaded ? 1 : 0.5
          }}>
            <label style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
              Slice Y:
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={visibility.sliceY.center}
              onChange={(e) => onVisibilityChange({
                sliceY: { ...visibility.sliceY, center: parseFloat(e.target.value) }
              })}
              disabled={!loaded}
              style={{ width: '100px' }}
            />
            <span style={{ fontSize: '0.85rem', color: '#666', minWidth: '3rem' }}>
              {(visibility.sliceY.center * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Reset View Button */}
        <button 
          className="btn" 
          style={{ height: "2.5rem" }} 
          onClick={onResetView}
          disabled={!loaded}
        >
          Reset View
        </button>

        {/* Home Button */}
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
          title="Home"
        >
          ⌂
        </button>
      </div>

      {/* Mobile: Second line for Slice Y */}
      {isMobile && loaded && (
        <div style={{ 
          width: '100%',
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem"
        }}>
          <label style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
            Slice Y:
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={visibility.sliceY.center}
            onChange={(e) => onVisibilityChange({
              sliceY: { ...visibility.sliceY, center: parseFloat(e.target.value) }
            })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '0.85rem', color: '#666', minWidth: '3rem' }}>
            {(visibility.sliceY.center * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Container Opacity Slider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: isMobile ? '0.8rem' : '0.9rem'
      }}>
        <label style={{ whiteSpace: 'nowrap', color: '#666' }}>
          Opacity:
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={containerOpacity}
          onChange={(e) => onContainerOpacityChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '0.85rem', color: '#666', minWidth: '3rem' }}>
          {(containerOpacity * 100).toFixed(0)}%
        </span>
      </div>

      {/* Container Color Picker */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: isMobile ? '0.8rem' : '0.9rem'
      }}>
        <label style={{ whiteSpace: 'nowrap', color: '#666' }}>
          Color:
        </label>
        <input
          type="color"
          value={containerColor}
          onChange={(e) => onContainerColorChange(e.target.value)}
          style={{ width: '50px', height: '30px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
        />
      </div>

      {/* Container Reflectiveness Slider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: isMobile ? '0.8rem' : '0.9rem'
      }}>
        <label style={{ whiteSpace: 'nowrap', color: '#666' }}>
          Reflect:
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={1.0 - containerRoughness}
          onChange={(e) => onContainerRoughnessChange(1.0 - parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '0.85rem', color: '#666', minWidth: '3rem' }}>
          {((1.0 - containerRoughness) * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
