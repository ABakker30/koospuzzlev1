// Timer and move counter for solving
import { useEffect, useState } from 'react';

interface SolveStatsProps {
  moveCount: number;
  isStarted: boolean;
  isPaused?: boolean;
  challengeMessage?: string | null;
}

export const SolveStats: React.FC<SolveStatsProps> = ({
  moveCount,
  isStarted,
  isPaused = false,
  challengeMessage
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isStarted || isPaused) return;

    const startTime = Date.now() - (elapsedSeconds * 1000);
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [isStarted, isPaused, elapsedSeconds]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '2px solid #2196F3',
      borderRadius: '12px',
      padding: '16px 24px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      minWidth: '300px',
      zIndex: 10
    }}>
      {/* Timer and Moves */}
      <div style={{
        display: 'flex',
        gap: '24px',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontSize: '1.1rem',
          fontWeight: 600
        }}>
          <span>⏱️</span>
          <span style={{ fontFamily: 'monospace', color: '#2196F3' }}>
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        <div style={{ 
          width: '2px', 
          height: '20px', 
          background: '#e0e0e0' 
        }} />

        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontSize: '1.1rem',
          fontWeight: 600
        }}>
          <span>🎯</span>
          <span style={{ fontFamily: 'monospace', color: '#2196F3' }}>
            {moveCount} {moveCount === 1 ? 'move' : 'moves'}
          </span>
        </div>
      </div>

      {/* Challenge Message */}
      {challengeMessage && (
        <div style={{
          padding: '8px 12px',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '6px',
          fontSize: '0.875rem',
          color: '#0369a1',
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          💬 {challengeMessage}
        </div>
      )}
    </div>
  );
};
