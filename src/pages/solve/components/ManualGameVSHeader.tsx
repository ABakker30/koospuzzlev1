import React, { useState } from 'react';

type SolvableStatus = 'unknown' | 'checking' | 'solvable' | 'unsolvable';

interface ManualGameVSHeaderProps {
  hidePlaced: boolean;
  onToggleHidePlaced: () => void;
  onHint: () => void;
  onSolvability: () => void;
  solvableStatus: SolvableStatus;
  onReset: () => void;
  onHowToPlay: () => void;
  onBackToManual: () => void; // Actually goes back to gallery now
}

export const ManualGameVSHeader: React.FC<ManualGameVSHeaderProps> = ({
  hidePlaced,
  onToggleHidePlaced,
  onHint,
  onSolvability,
  solvableStatus,
  onReset,
  onHowToPlay,
  onBackToManual,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <style>{`
        .vs-header {
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
        
        .vs-header-left {
          display: flex;
          gap: 8px;
          align-items: center;
          flex: 1;
          justify-content: flex-start;
        }
        
        .vs-header-right {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
        }
        
        .vs-header-btn {
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
        
        .vs-header-btn:hover {
          background: rgba(255,255,255,0.16);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }

        .vs-header-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        
        .vs-header-btn-check {
          padding: 8px 10px;
          min-width: 36px;
        }
        
        .vs-header-btn-reset {
          background: linear-gradient(135deg, #ef4444, #dc2626);
        }
        
        .vs-header-btn-reset:hover {
          background: linear-gradient(135deg, #f87171, #ef4444);
        }
        
        .vs-header-btn-menu {
          background: transparent;
          color: #fff;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .vs-header-btn-menu:hover {
          background: rgba(255,255,255,0.12);
        }
        
        .dropdown-backdrop {
          position: fixed;
          inset: 0;
          z-index: 999;
        }
        
        .dropdown-menu {
          position: absolute;
          background: rgba(15, 23, 42, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          z-index: 1000;
          backdrop-filter: blur(10px);
        }
        
        .dropdown-item {
          background: transparent;
          color: #fff;
          border: none;
          padding: 10px 14px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          border-radius: 8px;
          font-size: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.15s ease;
        }
        
        .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        
      `}</style>
      
      <header className="vs-header">
        {/* Left: Action Buttons (centered) */}
        <div className="vs-header-left">
          {/* Hide/Show Placed */}
          <button
            className="vs-header-btn"
            onClick={onToggleHidePlaced}
            title={hidePlaced ? 'Show placed pieces' : 'Hide placed pieces'}
          >
            {hidePlaced ? '👁️' : '🙈'}
          </button>
          
          {/* Hint Button */}
          <button
            className="vs-header-btn"
            onClick={onHint}
            title="Get a hint"
          >
            💡
          </button>

          {/* Solvability Check Button */}
          <button
            className="vs-header-btn vs-header-btn-check"
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
        </div>

        {/* Right: Reset + Menu */}
        <div className="vs-header-right">
          <button
            className="vs-header-btn vs-header-btn-reset"
            onClick={onReset}
            title="Reset game"
          >
            🔄
          </button>
          
          <div style={{ position: 'relative' }}>
            <button
              className="vs-header-btn-menu"
              onClick={() => setShowMenu(prev => !prev)}
              title="Menu"
            >
              ⋮
            </button>
            
            {showMenu && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setShowMenu(false)}
                />
                <div
                  className="dropdown-menu"
                  style={{ top: '48px', right: 0 }}
                >
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onHowToPlay();
                      setShowMenu(false);
                    }}
                  >
                    ℹ️ How to Play
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onBackToManual();
                      setShowMenu(false);
                    }}
                  >
                    ← Back to Gallery
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
};
