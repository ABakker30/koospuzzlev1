import React, { useState, useEffect } from 'react';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

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
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);

  useEffect(() => {
    console.log('🍔 Mobile menu state changed:', showMobileMenu);
  }, [showMobileMenu]);

  useEffect(() => {
    console.log('🎲 Mode menu state changed:', showModeMenu);
  }, [showModeMenu]);

  const handleSelectMode = (newMode: Mode) => {
    onChangeMode(newMode);
    setShowModeMenu(false);
  };

  const handleToggleMenu = () => {
    setShowMobileMenu(prev => !prev);
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
        }
        
        .header-btn {
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }
        
        .header-btn:hover {
          background: rgba(255,255,255,0.15);
        }
        
        .header-btn-icon {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: #fff;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 18px;
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
        
        .dropdown-menu {
          position: absolute;
          background: #000;
          border: 2px solid #555;
          border-radius: 8px;
          padding: 8px;
          min-width: 180px;
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
          padding: 12px 16px;
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
        
        .dropdown-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <div className="solve-header">
        {/* Left: Main controls */}
        <div className="solve-header-left">
          <button className="header-btn" onClick={onOpenPieces}>
            📦 Pieces
          </button>
          
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className="header-btn"
              onClick={() => setShowModeMenu(prev => !prev)}
            >
              🎲 Mode
            </button>
            
            {showModeMenu && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setShowModeMenu(false)}
                />
                <div
                  className="dropdown-menu"
                  style={{ top: '48px', left: 0, position: 'absolute' }}
                >
                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectMode('oneOfEach')}
                  >
                    Unique pieces
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectMode('unlimited')}
                  >
                    Unlimited pieces
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => handleSelectMode('single')}
                  >
                    Identical pieces
                  </button>
                </div>
              </>
            )}
          </div>
          
          <button
            className="header-btn"
            onClick={onToggleHidePlaced}
            title={hidePlacedPieces ? 'Show placed' : 'Hide placed'}
          >
            {hidePlacedPieces ? '👁️' : '🙈'}
          </button>
        </div>

        {/* Right: Undo + 3-dot menu */}
        <div className="solve-header-right">
          <button
            className="header-btn-icon"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
          >
            ↶
          </button>
          
          <div style={{ position: 'relative' }}>
            <button
              className="header-btn-icon"
              onClick={handleToggleMenu}
              style={{ background: 'transparent', fontSize: '24px' }}
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
                      onOpenInfo();
                      setShowMobileMenu(false);
                    }}
                  >
                    ℹ️ Info
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
    </>
  );
};
