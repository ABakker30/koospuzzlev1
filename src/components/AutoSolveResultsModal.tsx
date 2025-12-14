// src/components/AutoSolveResultsModal.tsx
import React from 'react';
import type { AutoSolveRunStats } from '../utils/autoSolveStatsLogger';

type Props = {
  open: boolean;
  onClose: () => void;
  result: AutoSolveRunStats | null;
  onRunAgain?: () => void;
  onSwitchMode?: (mode: 'exhaustive' | 'balanced' | 'fast') => void;
  onExportCSV?: () => void;
  onClearStats?: () => void;
};

export const AutoSolveResultsModal: React.FC<Props> = ({
  open,
  onClose,
  result,
  onRunAgain,
  onSwitchMode,
  onExportCSV,
}) => {
  if (!open || !result) return null;

  const formatTime = (ms: number | null): string => {
    if (ms === null) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const getModeColor = (mode: string): string => {
    if (mode === 'exhaustive') return '#3b82f6';
    if (mode === 'fast') return '#f59e0b';
    return '#22c55e';
  };

  const getModeExplanation = (mode: string): string => {
    if (mode === 'exhaustive') {
      return 'Exhaustive mode explores systematically for thorough coverage. Not finding a solution suggests the puzzle may be very hard or unsolvable.';
    }
    if (mode === 'fast') {
      return 'Fast mode samples many paths quickly. Not finding a solution doesn\'t mean none exists—try Balanced or Exhaustive for deeper search.';
    }
    return 'Balanced mode explores intelligently with good coverage. Not finding a solution suggests trying different seeds or longer timeouts.';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '2px solid #f0f0f0',
          background: result.success ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            color: result.success ? '#15803d' : '#991b1b',
          }}>
            {result.success ? '✅ Solution Found!' : '❌ No Solution Found'}
          </h2>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Puzzle Summary */}
          <div style={{
            padding: '1rem',
            background: '#f0f9ff',
            borderLeft: `3px solid #3b82f6`,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Puzzle:</strong> {result.puzzleName}
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Target:</strong> {result.totalPiecesTarget} pieces
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              <strong>Best Placed:</strong> {result.bestPlaced}/{result.totalPiecesTarget} pieces
            </div>
          </div>

          {/* Strategy Summary */}
          <div style={{
            padding: '1rem',
            background: '#fef3c7',
            borderLeft: `3px solid ${getModeColor(result.mode)}`,
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Mode:</strong> {result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Seed:</strong> {result.seed}
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Tail Solver:</strong> {result.tailTriggered ? `Triggered (size ${result.tailSize})` : `Not triggered (size ${result.tailSize})`}
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Restart Strategy:</strong> {result.shuffleStrategy}
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              <strong>Randomness:</strong> {result.randomizeTies ? 'Enabled' : 'Disabled'}
            </div>
          </div>

          {/* Performance Summary */}
          <div style={{
            padding: '1rem',
            background: '#f0fdf4',
            borderLeft: '3px solid #22c55e',
            borderRadius: '6px',
          }}>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Time:</strong> {formatTime(result.elapsedMs)} {result.timeToSolutionMs && `(solution at ${formatTime(result.timeToSolutionMs)})`}
            </div>
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              <strong>Nodes Explored:</strong> {result.nodes.toLocaleString()} ({result.nodesPerSecAvg.toLocaleString()} nodes/sec)
            </div>
            <div style={{ fontSize: '0.875rem' }}>
              <strong>Stop Reason:</strong> {result.stopReason}
            </div>
          </div>

          {/* Explanatory Paragraph */}
          {!result.success && (
            <div style={{
              padding: '1rem',
              background: '#fef3c7',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontStyle: 'italic',
              color: '#92400e',
            }}>
              {getModeExplanation(result.mode)}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              onClick={onRunAgain}
              style={{
                padding: '0.75rem 1rem',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔄 Run Again (New Seed)
            </button>

            {result.mode !== 'balanced' && onSwitchMode && (
              <button
                onClick={() => onSwitchMode('balanced')}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⚖️ Try Balanced Mode
              </button>
            )}

            {result.mode !== 'exhaustive' && !result.success && onSwitchMode && (
              <button
                onClick={() => onSwitchMode('exhaustive')}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🔍 Try Exhaustive Mode
              </button>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={onExportCSV}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📊 Export CSV
              </button>

              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
