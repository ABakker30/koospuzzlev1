import React from 'react';
import { useTranslation } from 'react-i18next';
import { ThreeDotMenu } from '../../../components/ThreeDotMenu';

interface ManualGameVSHeaderProps {
  onHowToPlay: () => void;
  onOpenSettings: () => void;
  onOpenInventory: () => void;
  onBackToHome: () => void;
  setsNeeded?: number;
  cellCount?: number;
  backgroundColor?: string;
}

export const ManualGameVSHeader: React.FC<ManualGameVSHeaderProps> = ({
  onHowToPlay,
  onOpenSettings,
  onOpenInventory,
  onBackToHome,
  setsNeeded = 1,
  cellCount,
  backgroundColor,
}) => {
  const { t } = useTranslation();

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
        }
        
        .vs-header-center {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .puzzle-info-badge {
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid rgba(245, 158, 11, 0.5);
          color: #f59e0b;
          padding: 8px 12px;
          min-height: 40px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-sizing: border-box;
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
        {/* Left: Inventory */}
        <div className="vs-header-left">
          <button
            className="vs-header-btn"
            onClick={onOpenInventory}
            title={t('solve.inventory')}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
            }}
          >
            📦
          </button>
        </div>
        
        {/* Center: Puzzle info badge */}
        <div className="vs-header-center">
          {cellCount && setsNeeded > 1 && (
            <div className="puzzle-info-badge">
              <span>📐 {cellCount} {t('solve.cells')}</span>
              <span style={{ opacity: 0.5 }}>•</span>
              <span>🧩 {t('solve.pieceSets', { count: setsNeeded })}</span>
            </div>
          )}
        </div>

        {/* Right: Three-Dot Menu */}
        <div className="vs-header-right">
          <ThreeDotMenu
            backgroundColor={backgroundColor}
            items={[
              { icon: '🎨', label: t('game.environmentSettings'), onClick: onOpenSettings },
              { icon: 'ℹ️', label: t('game.howToPlay'), onClick: onHowToPlay },
              { icon: '✕', label: t('button.back'), onClick: onBackToHome },
            ]}
          />
        </div>
      </header>
    </>
  );
};
