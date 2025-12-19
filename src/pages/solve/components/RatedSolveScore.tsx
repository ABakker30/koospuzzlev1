import React from 'react';

interface RatedSolveScoreProps {
  score: number;
}

export const RatedSolveScore: React.FC<RatedSolveScoreProps> = ({ score }) => {
  return (
    <>
      <style>{`
        .rated-score {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 12px 24px;
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          pointer-events: none;
          user-select: none;
        }
        
        .rated-score-content {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          text-shadow: 
            0 2px 4px rgba(0, 0, 0, 0.8),
            0 1px 2px rgba(0, 0, 0, 0.9);
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .rated-score-value {
          color: #10b981;
          text-shadow: 
            0 0 10px rgba(16, 185, 129, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.8);
        }
        
        @media (max-width: 768px) {
          .rated-score {
            top: 64px;
            padding: 10px 20px;
          }
          
          .rated-score-content {
            font-size: 16px;
          }
        }
      `}</style>
      
      <div className="rated-score">
        <div className="rated-score-content">
          <span>Score:</span>
          <span className="rated-score-value">{score}</span>
        </div>
      </div>
    </>
  );
};
