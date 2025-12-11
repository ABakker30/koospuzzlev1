import React from 'react';

interface SharedMiniHeaderProps {
  userScore: number;
  computerScore: number;
  onBack?: () => void;
}

export const SharedMiniHeader: React.FC<SharedMiniHeaderProps> = ({
  userScore,
  computerScore,
  onBack,
}) => {
  return (
    <>
      <style>{`
        .mini-header {
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
          justify-content: center;
          padding: 0 12px;
          z-index: 1000;
          gap: 16px;
        }
        
        .btn-back {
          background: rgba(255,255,255,0.08);
          color: #fff;
          border: none;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          transition:
            background 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.12s ease;
          position: absolute;
          left: 12px;
        }
        
        .btn-back:hover {
          background: rgba(255,255,255,0.16);
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          transform: translateY(-1px);
        }

        .btn-back:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        
        .score-display {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
          text-align: center;
          letter-spacing: 0.5px;
        }
        
        .score-display .user-score {
          color: #10b981;
        }
        
        .score-display .computer-score {
          color: #ef4444;
        }
        
        @media (max-width: 768px) {
          .score-display {
            font-size: 16px;
          }
        }
      `}</style>
      
      <div className="mini-header">
        {onBack && (
          <button className="btn-back" onClick={onBack} title="Back">
            ←
          </button>
        )}
        <div className="score-display">
          <span className="user-score">You {userScore}</span>
          {' — '}
          <span className="computer-score">{computerScore} Computer</span>
        </div>
      </div>
    </>
  );
};
