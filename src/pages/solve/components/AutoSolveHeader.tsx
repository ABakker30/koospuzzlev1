import React, { useState } from 'react';

type AutoSolveHeaderProps = {
  isAutoSolving: boolean;
  hasPiecesDb: boolean;
  onSolveClick: () => void;
  onOpenEngineSettings: () => void;
  onOpenInfo: () => void;
  onOpenEnvSettings: () => void;
  onGoToGallery: () => void;
};

export const AutoSolveHeader: React.FC<AutoSolveHeaderProps> = ({
  isAutoSolving,
  hasPiecesDb,
  onSolveClick,
  onOpenEngineSettings,
  onOpenInfo,
  onOpenEnvSettings,
  onGoToGallery,
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleToggleMenu = () => {
    setShowMobileMenu(prev => !prev);
  };

  const handleCloseMenu = () => {
    setShowMobileMenu(false);
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
          font-size: 22px;
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

        .header-btn-icon:focus {
          outline: none;
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
        {/* Left: Auto-solve controls */}
        <div className="solve-header-left">
          {/* Solve / Stop button */}
          <button
            onClick={onSolveClick}
            disabled={!hasPiecesDb}
            title={isAutoSolving ? 'Stop solver' : 'Find solution'}
            style={{ 
              background: isAutoSolving ? '#f44336' : '#4caf50',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '14px',
              cursor: hasPiecesDb ? 'pointer' : 'not-allowed',
              opacity: hasPiecesDb ? 1 : 0.5,
              minWidth: '120px',
              boxShadow: 'none'
            }}
          >
            {isAutoSolving ? '⏹ Stop Solver' : '🔍 Solve'}
          </button>
          
          {/* Engine Settings Button */}
          <button
            className="pill pill--ghost"
            onClick={onOpenEngineSettings}
            title="Auto-solve settings"
            style={{ 
              background: 'rgba(255,255,255,0.1)',
              color: '#fff'
            }}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Right: 3-dot menu */}
        <div className="solve-header-right">
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
                  onClick={handleCloseMenu}
                />
                <div
                  className="dropdown-menu"
                  style={{ top: '48px', right: 0 }}
                >
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onOpenInfo();
                      handleCloseMenu();
                    }}
                  >
                    ℹ️ Info
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onOpenEnvSettings();
                      handleCloseMenu();
                    }}
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onGoToGallery();
                      handleCloseMenu();
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
