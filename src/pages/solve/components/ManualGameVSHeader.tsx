import React from 'react';

interface ManualGameVSHeaderProps {
  onReset: () => void;
  onHowToPlay: () => void;
  onOpenSettings: () => void;
  onBackToHome: () => void;
}

export const ManualGameVSHeader: React.FC<ManualGameVSHeaderProps> = ({
  onReset,
  onHowToPlay,
  onOpenSettings,
  onBackToHome,
}) => {

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
        
        .vs-header-btn-info {
          background: rgba(59, 130, 246, 0.15);
        }
        
        .vs-header-btn-info:hover {
          background: rgba(59, 130, 246, 0.25);
        }
        
        .vs-header-btn-home {
          background: rgba(255,255,255,0.08);
        }
        
        .vs-header-btn-home:hover {
          background: rgba(255,255,255,0.16);
        }
        
      `}</style>
      
      <header className="vs-header">
        {/* Left: Reset Button */}
        <div className="vs-header-left">
          <button
            className="vs-header-btn vs-header-btn-reset"
            onClick={onReset}
            title="Reset game"
          >
            🔄
          </button>
        </div>

        {/* Right: Settings + Info + Home */}
        <div className="vs-header-right">
          <button
            className="vs-header-btn"
            onClick={onOpenSettings}
            title="Environment Settings"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
            }}
          >
            🎨
          </button>
          
          <button
            className="vs-header-btn vs-header-btn-info"
            onClick={onHowToPlay}
            title="How to Play"
          >
            ℹ️
          </button>
          
          <button
            className="vs-header-btn vs-header-btn-home"
            onClick={onBackToHome}
            title="Home"
          >
            🏠
          </button>
        </div>
      </header>
    </>
  );
};
