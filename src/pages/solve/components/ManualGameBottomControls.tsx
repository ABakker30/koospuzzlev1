import React from 'react';

interface ManualGameBottomControlsProps {
  hidePlaced: boolean;
  onToggleHidePlaced: () => void;
  onHint: () => void;
}

export const ManualGameBottomControls: React.FC<ManualGameBottomControlsProps> = ({
  hidePlaced,
  onToggleHidePlaced,
  onHint,
}) => {
  return (
    <>
      <style>{`
        .vs-bottom-controls {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 12px;
          align-items: center;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(10px);
          padding: 12px 20px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        
        .vs-control-btn {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border: none;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 22px;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 48px;
          min-height: 48px;
          transition:
            background 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.12s ease;
        }
        
        .vs-control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          transform: translateY(-2px);
        }

        .vs-control-btn:active {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
        }
        
        .vs-control-btn-check {
          padding: 10px 14px;
          min-width: 44px;
        }
        
        @media (max-width: 600px) {
          .vs-bottom-controls {
            padding: 10px 16px;
            gap: 10px;
          }
          
          .vs-control-btn {
            min-width: 44px;
            min-height: 44px;
            padding: 8px 12px;
            font-size: 22px;
          }
        }
      `}</style>
      
      <div className="vs-bottom-controls">
        {/* Hide/Show Placed */}
        <button
          className="vs-control-btn"
          onClick={onToggleHidePlaced}
          title={hidePlaced ? 'Show placed pieces' : 'Hide placed pieces'}
        >
          {hidePlaced ? '👁️' : '🙈'}
        </button>
        
        {/* Hint Button */}
        <button
          className="vs-control-btn"
          onClick={onHint}
          title="Get a hint"
        >
          💡
        </button>
      </div>
    </>
  );
};
