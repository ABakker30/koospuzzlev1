import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';

type ManualSolveHeaderProps = {
  mode: Mode;
  onOpenPieces: () => void;
  onChangeMode: (mode: Mode) => void;
  onOpenAboutPuzzle: () => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
};

export const ManualSolveHeader: React.FC<ManualSolveHeaderProps> = ({
  mode,
  onOpenPieces,
  onChangeMode,
  onOpenAboutPuzzle,
  onOpenSettings,
  onGoHome,
}) => {
  const { t } = useTranslation();
  const [showModeMenu, setShowModeMenu] = useState(false);

  useEffect(() => {
    if (showModeMenu) {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowModeMenu(false);
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }
  }, [showModeMenu]);

  const handleSelectMode = (newMode: Mode) => {
    onChangeMode(newMode);
    setShowModeMenu(false);
  };

  return (
    <>
      <style>{`
        .solve-header {
          position: fixed;
          top: 20px;
          left: 20px;
          right: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 1000;
          pointer-events: none;
        }
        
        .solve-header-left {
          display: flex;
          gap: 8px;
          align-items: center;
          pointer-events: auto;
        }
        
        .solve-header-right {
          display: flex;
          gap: 8px;
          align-items: center;
          pointer-events: auto;
        }
        
        .header-btn {
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 22px;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 40px;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .header-btn:hover {
          background: rgba(0, 0, 0, 0.8);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .header-btn:active {
          transform: translateY(0);
        }
        
        .header-btn-icon {
          color: #fff;
          border: none;
          padding: 8px 12px;
          min-width: 40px;
          min-height: 40px;
          border-radius: 8px;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
        }
        
        .header-btn-icon:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .header-btn-icon:active {
          transform: translateY(0);
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
        {/* Left: Mode + Pieces */}
        <div className="solve-header-left">
          <button
            className="header-btn"
            onClick={() => setShowModeMenu(!showModeMenu)}
            title={
              mode === 'oneOfEach'
                ? t('solve.mode.uniquePieces')
                : mode === 'unlimited'
                ? t('solve.mode.unlimitedPieces')
                : mode === 'customSet'
                ? t('solve.mode.customSet')
                : t('solve.mode.identicalPieces')
            }
          >
            🎲
          </button>
          
          <button
            className="header-btn"
            onClick={onOpenPieces}
            title={t('solve.inventory')}
          >
            📦
          </button>
        </div>

        {/* Right: Settings + Home */}
        <div className="solve-header-right">
          <button
            className="header-btn-icon"
            onClick={onOpenAboutPuzzle}
            title={t('solve.aboutPuzzle')}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)'
            }}
          >
            📖
          </button>

          <button
            className="header-btn-icon"
            onClick={onOpenSettings}
            title={t('environment.title')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)'
            }}
          >
            ⚙
          </button>
          
          <button
            className="header-btn-icon"
            onClick={onGoHome}
            title={t('nav.home')}
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)'
            }}
          >
            🏠
          </button>
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
              {t('solve.mode.header')}
            </div>

            <button
              className={
                'dropdown-item' +
                (mode === 'oneOfEach' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('oneOfEach')}
            >
              {mode === 'oneOfEach' ? '✅ ' : ''}{t('solve.mode.unique')}
            </button>
            <button
              className={
                'dropdown-item' +
                (mode === 'unlimited' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('unlimited')}
            >
              {mode === 'unlimited' ? '✅ ' : ''}{t('solve.mode.unlimited')}
            </button>
            <button
              className={
                'dropdown-item' +
                (mode === 'single' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('single')}
            >
              {mode === 'single' ? '✅ ' : ''}{t('solve.mode.identical')}
            </button>
            <button
              className={
                'dropdown-item' +
                (mode === 'customSet' ? ' dropdown-item-active' : '')
              }
              onClick={() => handleSelectMode('customSet')}
            >
              {mode === 'customSet' ? '✅ ' : ''}{t('solve.mode.custom')}
            </button>
          </div>
        </>
      )}
    </>
  );
};
