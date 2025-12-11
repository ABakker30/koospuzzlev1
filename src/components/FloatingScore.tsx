import React from 'react';

interface FloatingScoreProps {
  userScore: number;
  computerScore: number;
}

export const FloatingScore: React.FC<FloatingScoreProps> = ({
  userScore,
  computerScore,
}) => {
  return (
    <>
      <style>{`
        .floating-score {
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
        
        .floating-score-content {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          text-shadow: 
            0 2px 4px rgba(0, 0, 0, 0.8),
            0 1px 2px rgba(0, 0, 0, 0.9);
          letter-spacing: 0.5px;
        }
        
        .floating-score-content .user-score {
          color: #10b981;
          text-shadow: 
            0 0 10px rgba(16, 185, 129, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.8);
        }
        
        .floating-score-content .computer-score {
          color: #ef4444;
          text-shadow: 
            0 0 10px rgba(239, 68, 68, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.8);
        }
        
        .floating-score-content .separator {
          color: rgba(255, 255, 255, 0.6);
          margin: 0 8px;
        }
        
        @media (max-width: 768px) {
          .floating-score {
            top: 64px;
            padding: 10px 20px;
          }
          
          .floating-score-content {
            font-size: 16px;
          }
        }
      `}</style>
      
      <div className="floating-score">
        <div className="floating-score-content">
          <span className="user-score">You {userScore}</span>
          <span className="separator">—</span>
          <span className="computer-score">{computerScore} Computer</span>
        </div>
      </div>
    </>
  );
};
