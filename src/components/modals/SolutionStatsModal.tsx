// Solution Stats Modal - Show solution statistics and navigation options
// Used when entering via direct solution ID route
import React from 'react';

export interface SolutionStats {
  firstSolverName?: string;
  firstSolveDate?: string;
  firstSolveTime?: number;
  firstSolveMoves?: number;
  manualCount: number;
  autoCount: number;
  fastestManualTime?: number;
  fastestManualSolver?: string;
  fastestAutoTime?: number;
  currentSolveTime?: number;
  currentRank?: number;
}

interface SolutionStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: SolutionStats | null;
  puzzleName: string;
  onWatchMovie: () => void;
  onTryManual: () => void;
  onTryAuto: () => void;
  onCreateMovie: () => void;
  onShare: () => void;
}

export const SolutionStatsModal: React.FC<SolutionStatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  puzzleName,
  onWatchMovie,
  onTryManual,
  onTryAuto,
  onCreateMovie,
  onShare
}) => {
  if (!isOpen) return null;

  const formatTime = (ms?: number) => {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fed7aa 70%, #fecaca 100%)',
        borderRadius: '20px',
        padding: '0',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 25px 80px rgba(251,146,60,0.6), 0 0 60px rgba(251,146,60,0.3)',
        border: '3px solid rgba(251,146,60,0.6)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f97316, #ea580c, #dc2626)',
          padding: '2rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '24px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(251,146,60,0.4)'
        }}>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '28px', 
            fontWeight: 700,
            margin: 0,
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            📊 Solution Statistics
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: '16px',
            margin: 0,
            fontWeight: 600
          }}>
            {puzzleName}
          </p>
        </div>

        {/* Stats Content */}
        {stats && (
          <div style={{ marginBottom: '24px', padding: '0 2rem' }}>
            {/* First Solver */}
            {stats.firstSolverName && (
              <div style={{
                padding: '16px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '2px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '12px',
                marginBottom: '16px',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
              }}>
                <div style={{ color: '#1e40af', fontSize: '12px', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.5px' }}>
                  🏆 FIRST SOLVER
                </div>
                <div style={{ color: '#1e293b', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  {stats.firstSolverName}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                  {stats.firstSolveDate && `📅 ${stats.firstSolveDate}`}
                  {stats.firstSolveTime && ` • ⏱️ ${formatTime(stats.firstSolveTime)}`}
                  {stats.firstSolveMoves && ` • 🧩 ${stats.firstSolveMoves} moves`}
                </div>
              </div>
            )}

            {/* Puzzle Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>
                  👤 Manual Solutions
                </div>
                <div style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                  {stats.manualCount}
                </div>
              </div>
              <div style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>
                  🤖 Auto Solutions
                </div>
                <div style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                  {stats.autoCount}
                </div>
              </div>
            </div>

            {/* Fastest Times */}
            {(stats.fastestManualTime || stats.fastestAutoTime) && (
              <div style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '16px'
              }}>
                <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                  ⚡ Fastest Times
                </div>
                {stats.fastestManualTime && (
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '6px' }}>
                    Manual: <span style={{ color: '#fff' }}>{formatTime(stats.fastestManualTime)}</span>
                    {stats.fastestManualSolver && <span style={{ color: '#60a5fa' }}> by {stats.fastestManualSolver}</span>}
                  </div>
                )}
                {stats.fastestAutoTime && (
                  <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                    Auto: <span style={{ color: '#fff' }}>{formatTime(stats.fastestAutoTime)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Current Solution Rank */}
            {stats.currentRank && stats.manualCount > 0 && (
              <div style={{
                padding: '16px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ color: '#4ade80', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                  🌟 This Solution Ranks
                </div>
                <div style={{ color: '#fff', fontSize: '20px', fontWeight: 600 }}>
                  #{stats.currentRank} of {stats.manualCount}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
                  Top {Math.round((stats.currentRank / stats.manualCount) * 100)}%!
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 2rem 2rem' }}>
          <button
            onClick={onWatchMovie}
            style={{
              padding: '16px 24px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '18px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(251, 146, 60, 0.4)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'all 0.2s'
            }}
          >
            🎬 Watch Turntable
          </button>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onTryManual}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              🧩 Try Manual
            </button>
            <button
              onClick={onTryAuto}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              🤖 Try Auto
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onCreateMovie}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              🎥 New Movie
            </button>
            <button
              onClick={onShare}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              📤 Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
