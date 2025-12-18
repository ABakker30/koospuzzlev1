import React from 'react';

type AutoSolveHeaderProps = {
  isAutoSolving: boolean;
  hasPiecesDb: boolean;
  onSolveClick: () => void;
  onOpenEngineSettings: () => void;
  onOpenEnvSettings: () => void;
  onOpenInfo: () => void;
  onGoHome: () => void;
};

export const AutoSolveHeader: React.FC<AutoSolveHeaderProps> = ({
  isAutoSolving,
  hasPiecesDb,
  onSolveClick,
  onOpenEngineSettings,
  onOpenEnvSettings,
  onOpenInfo,
  onGoHome,
}) => {

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
        {/* Left: Solve and Engine Settings */}
        <div className="solve-header-left">
          <button
            onClick={onSolveClick}
            disabled={!hasPiecesDb}
            title={isAutoSolving ? 'Stop solver' : 'Find solution'}
            style={{
              background: isAutoSolving ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '16px',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: hasPiecesDb ? 'pointer' : 'not-allowed',
              opacity: hasPiecesDb ? 1 : 0.5,
              minWidth: '120px',
              transition: 'all 0.2s ease'
            }}
          >
            {isAutoSolving ? '⏹ Stop' : '🔍 Solve'}
          </button>
          <button
            onClick={onOpenEngineSettings}
            style={{
              background: 'rgba(139, 92, 246, 0.9)',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              fontSize: '14px',
              padding: '10px 18px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            ⚙️ Engine
          </button>
        </div>

        {/* Right: Info, Settings, Home */}
        <div className="solve-header-right">
          <button
            className="header-btn-icon"
            onClick={onOpenInfo}
            title="Info"
          >
            ℹ️
          </button>
          <button
            className="header-btn-icon"
            onClick={onOpenEnvSettings}
            title="Environment settings"
          >
            ⚙️
          </button>
          <button
            className="header-btn-icon"
            onClick={onGoHome}
            title="Home"
          >
            🏠
          </button>
        </div>
      </div>
    </>
  );
};
