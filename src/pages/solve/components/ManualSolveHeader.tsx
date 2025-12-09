import React, { useState, useEffect } from 'react';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

// Solvability status
type SolvableStatus = 'unknown' | 'checking' | 'solvable' | 'unsolvable';

type ManualSolveHeaderProps = {
  mode: Mode;
  hidePlacedPieces: boolean;
  canUndo: boolean;
  onOpenPieces: () => void;
  onChangeMode: (mode: Mode) => void;
  onToggleHidePlaced: () => void;
  onUndo: () => void;
  onOpenInfo: () => void;
  onOpenSettings: () => void;
  onGoToGallery: () => void;
  onGoToAutoSolve: () => void;
  onCheckSolvable: () => void;
  onRequestHint: () => void;
  solvableStatus: SolvableStatus;
  canHint: boolean;
  showSolvableButton: boolean;
  onOpenAboutPuzzle: () => void;
};

export const ManualSolveHeader: React.FC<ManualSolveHeaderProps> = ({
  mode,
  hidePlacedPieces,
  canUndo,
  onOpenPieces,
  onChangeMode,
  onToggleHidePlaced,
  onUndo,
  onOpenInfo,
  onOpenSettings,
  onGoToGallery,
  onGoToAutoSolve,
  onCheckSolvable,
  onRequestHint,
  solvableStatus,
  canHint,
  showSolvableButton,
  onOpenAboutPuzzle,
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);

  useEffect(() => {
    if (showMobileMenu || showModeMenu) {
      // close menus on Escape
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowMobileMenu(false);
          setShowModeMenu(false);
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }
  }, [showMobileMenu, showModeMenu]);

  const handleSelectMode = (newMode: Mode) => {
    onChangeMode(newMode);
    setShowModeMenu(false);
  };

  const handleToggleModeMenu = () => {
    setShowModeMenu(prev => !prev);
    // Close the other menu if it's open
    setShowMobileMenu(false);
  };

  const handleToggleMobileMenu = () => {
    setShowMobileMenu(prev => !prev);
    // Close the other menu if it's open
    setShowModeMenu(false);
  };

  return (
    <>
      <style>{`
        .solve-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 56px;
          background: linear-gradient(180deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 12px;
          z-index: 1000;
        }
        
        .solve-header-left {
          display: flex;
          gap: 8px;
          flex: 1;
          overflow-x: auto;
          align-items: center;
        }
        
        .solve-header-right {
          display: flex;
          gap: 8px;
          align-items: center;
          padding-left: 10px;
          border-left: 1px solid rgba(255, 255, 255, 0.15);
        }
        
        .header-btn {
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
        
        .header-btn:hover {
          background: rgba(255,255,255,0.16);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }

        .header-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        
        .header-btn-check {
          padding: 8px 10px;
          min-width: 36px;
        }
        
        .header-btn-icon {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: #fff;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .header-btn-icon:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: rgba(139, 92, 246, 0.3);
        }
        
        .header-btn-icon-menu {
          background: transparent;
          color: #fff;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .header-btn-icon-menu-active {
          background: rgba(255,255,255,0.12);
        }
        
        .dropdown-menu {
          position: absolute;
          background: #000;
          border: 2px solid #555;
          border-radius: 8px;
          padding: 8px;
          min-width: 200px;
          z-index: 10000;
          box-shadow: 0 4px 16px rgba(0,0,0,0.9);
        }
        
        .dropdown-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
        }
        
        .dropdown-item {
          width: 100%;
          padding: 10px 14px;
          background: transparent;
          border: none;
          color: #fff;
          text-align: left;
          cursor: pointer;
          border-radius: 4px;
          font-size: 14px;
          display: block;
        }
        
        .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .dropdown-item-active {
          background: rgba(255, 255, 255, 0.15);
          font-weight: 600;
        }
        
        .dropdown-header {
          cursor: default;
          user-select: none;
          color: rgba(255, 255, 255, 0.75);
          font-size: 13px;
          font-weight: 500;
          padding-top: 4px;
          padding-bottom: 6px;
        }
        
        .header-btn:focus,
        .header-btn-icon:focus,
        .header-btn-icon-menu:focus {
          outline: none;
        }
      `}</style>

      <div className="solve-header">
        {/* Left: Main controls */}
        <div className="solve-header-left">
          <button
            className="header-btn"
            onClick={onOpenPieces}
            title="Pieces"
          >
            📦
          </button>
          
          {/* Mode: icon-only, dropdown rendered outside header */}
          <div style={{ display: 'inline-block' }}>
            <button
              className="header-btn"
              onClick={handleToggleModeMenu}
              title={
                mode === 'oneOfEach'
                  ? 'Mode: Unique pieces'
                  : mode === 'unlimited'
                  ? 'Mode: Unlimited pieces'
                  : 'Mode: Identical pieces'
              }
            >
              🎲
            </button>
          </div>
          
          <button
            className="header-btn"
            onClick={onToggleHidePlaced}
            title={hidePlacedPieces ? 'Show placed' : 'Hide placed'}
          >
            {hidePlacedPieces ? '👁️' : '🙈'}
          </button>
          
          {/* Hint button - only when enabled */}
          {canHint && (
            <button
              className="header-btn"
              onClick={onRequestHint}
              title="Get a hint for the current cell"
            >
              💡
            </button>
          )}

          {/* Solvability check button - only when < 30 empty cells */}
          {showSolvableButton && (
            <button
              className="header-btn header-btn-check"
              onClick={onCheckSolvable}
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
          )}
        </div>

        {/* Right: Undo + 3-dot menu */}
        <div className="solve-header-right">
          <button
            className="header-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            style={{ opacity: canUndo ? 1 : 0.5 }}
          >
            ↶
          </button>
          
          <div style={{ position: 'relative' }}>
            <button
              className={
                'header-btn-icon-menu' +
                (showMobileMenu ? ' header-btn-icon-menu-active' : '')
              }
              onClick={handleToggleMobileMenu}
              title="Menu"
            >
              ⋮
            </button>
            
            {showMobileMenu && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setShowMobileMenu(false)}
                />
                <div
                  className="dropdown-menu"
                  style={{ top: '48px', right: 0 }}
                >
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onGoToAutoSolve();
                      setShowMobileMenu(false);
                    }}
                  >
                    🤖 Auto-Solve
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onOpenAboutPuzzle();
                      setShowMobileMenu(false);
                    }}
                  >
                    📖 About this puzzle
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onOpenInfo();
                      setShowMobileMenu(false);
                    }}
                  >
                    ℹ️ How to puzzle
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onOpenSettings();
                      setShowMobileMenu(false);
                    }}
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onGoToGallery();
                      setShowMobileMenu(false);
                    }}
                  >
                    ⊞ Gallery
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mode dropdown – fixed overlay below header, left-aligned */}
      {showModeMenu && (
        <>
          <div
            className="dropdown-backdrop"
            onClick={() => setShowModeMenu(false)}
          />
          <div
            className="dropdown-menu"
            style={{ position: 'fixed', top: '56px', left: '12px' }}
          >
            <div className="dropdown-item dropdown-header">
              Puzzle with:
            </div>

            <button
              className={
                'dropdown-item' +
                (mode === 'oneOfEach' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('oneOfEach')}
            >
              {mode === 'oneOfEach' ? '✅ ' : ''}Unique pieces
            </button>
            <button
              className={
                'dropdown-item' +
                (mode === 'unlimited' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('unlimited')}
            >
              {mode === 'unlimited' ? '✅ ' : ''}Unlimited pieces
            </button>
            <button
              className={
                'dropdown-item' +
                (mode === 'single' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('single')}
            >
              {mode === 'single' ? '✅ ' : ''}Identical pieces
            </button>
          </div>
        </>
      )}
    </>
  );
};
