// Solution Stats Modal - Show solution statistics and navigation options
// Used when entering via direct solution ID route
import React from 'react';
import { useDraggable } from '../../hooks/useDraggable';

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
  const draggable = useDraggable();
  if (!isOpen) return null;

  const formatTime = (ms?: number) => {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .solution-stats-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .solution-stats-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(251, 146, 60, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .solution-stats-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f97316, #ea580c);
          border-radius: 10px;
          border: 2px solid rgba(254, 243, 199, 0.5);
        }
        .solution-stats-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #ea580c, #dc2626);
        }
        .solution-stats-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #dc2626;
        }
        .solution-stats-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #f97316 rgba(251, 146, 60, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="solution-stats-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fed7aa 70%, #fecaca 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(251,146,60,0.6)',
          zIndex: 10001,
          ...draggable.style
        }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f97316, #ea580c, #dc2626)',
          padding: '1.25rem 1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '16px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(251,146,60,0.4)',
          position: 'relative',
          userSelect: 'none',
          ...draggable.headerStyle
        }}>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
            title="Close"
          >
            ×
          </button>
          
          <h2 style={{ 
            color: '#fff', 
            fontSize: '20px', 
            fontWeight: 700,
            margin: 0,
            marginBottom: '4px',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '24px' }}>📊</span>
            <span>Solution Statistics</span>
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: '14px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 1.5rem 1.5rem' }}>
          {/* Primary Action */}
          <button
            onClick={onWatchMovie}
            style={{
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(251, 146, 60, 0.4)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>🎬</span>
            <span>Watch Turntable</span>
          </button>
          
          {/* Secondary Actions - Compact Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={onTryManual}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(251,146,60,0.4)',
                borderRadius: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
            >
              🧩 Try Manual
            </button>
            <button
              onClick={onTryAuto}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(251,146,60,0.4)',
                borderRadius: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
            >
              🤖 Try Auto
            </button>
            <button
              onClick={onCreateMovie}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(251,146,60,0.4)',
                borderRadius: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
            >
              🎥 New Movie
            </button>
            <button
              onClick={onShare}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(251,146,60,0.4)',
                borderRadius: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
            >
              📤 Share
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
