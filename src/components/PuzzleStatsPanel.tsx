// src/components/PuzzleStatsPanel.tsx
// Display community puzzle stats in info modal

import React from 'react';
import type { PuzzleStats } from '../api/puzzleStats';
import { calculatePuzzleMetrics } from '../api/puzzleStats';
import { formatMs, formatInt } from '../utils/formatters';

interface PuzzleStatsPanelProps {
  stats: PuzzleStats | null;
  loading?: boolean;
}

export const PuzzleStatsPanel: React.FC<PuzzleStatsPanelProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div style={{ 
        padding: '1rem', 
        textAlign: 'center', 
        color: '#666',
        fontSize: '0.875rem'
      }}>
        Loading community stats...
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ 
        padding: '1rem', 
        textAlign: 'center', 
        color: '#666',
        fontSize: '0.875rem'
      }}>
        No community stats available yet. Be the first to try this puzzle!
      </div>
    );
  }

  const metrics = calculatePuzzleMetrics(stats);

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.4)',
      borderRadius: '12px',
      padding: '1.25rem',
      marginTop: '1rem',
    }}>
      {/* Header */}
      <div style={{
        fontSize: '1rem',
        fontWeight: 700,
        marginBottom: '0.75rem',
        color: '#1e40af',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span>📊</span>
        <span>Community Effort</span>
      </div>

      <div style={{
        fontSize: '0.75rem',
        color: '#64748b',
        marginBottom: '1rem',
        fontStyle: 'italic'
      }}>
        This is the combined effort of everyone who tried this puzzle
      </div>

      {/* Auto-Solve Stats */}
      {stats.auto_runs_count > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: '#3b82f6'
          }}>
            🤖 Auto-Solve Attempts
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: '#475569'
          }}>
            <div>
              <div style={{ fontWeight: 600, color: '#1e40af' }}>{formatInt(stats.auto_runs_count)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total attempts</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#10b981' }}>{formatInt(stats.auto_solutions_found)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Solutions found</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#3b82f6' }}>{formatInt(stats.auto_nodes_total)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total nodes searched</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#8b5cf6' }}>{formatMs(stats.auto_elapsed_ms_total)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total time spent</div>
            </div>
          </div>

          {/* Solution Scarcity */}
          {stats.auto_solutions_found > 0 && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#1e40af',
              borderLeft: '3px solid #3b82f6'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                💎 Solution Scarcity
              </div>
              <div style={{ fontSize: '0.75rem' }}>
                1 solution per ~{formatInt(metrics.nodesPerSolution)} nodes explored
              </div>
            </div>
          )}

          {stats.auto_solutions_found === 0 && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#991b1b',
              borderLeft: '3px solid #ef4444'
            }}>
              <div style={{ fontWeight: 600 }}>
                🔍 No auto solutions recorded yet
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                This is a challenging puzzle! Be the first to solve it.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Solve Stats */}
      {stats.manual_solutions_count > 0 && (
        <div>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: '#10b981'
          }}>
            🧩 Manual Solutions
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: '#475569'
          }}>
            <div>
              <div style={{ fontWeight: 600, color: '#10b981' }}>{formatInt(stats.manual_solutions_count)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Completed solves</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#8b5cf6' }}>{formatMs(stats.manual_solve_time_ms_total)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total time</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#3b82f6' }}>{formatInt(stats.manual_move_count_total)}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total moves</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#f59e0b' }}>{metrics.avgMovesPerManualSolve}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Avg moves/solve</div>
            </div>
          </div>
        </div>
      )}

      {/* Overall Summary */}
      {stats.solutions_total > 0 && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(16, 185, 129, 0.1)',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: '#047857',
          textAlign: 'center',
          fontWeight: 600
        }}>
          🏆 {formatInt(stats.solutions_total)} total solution{stats.solutions_total === 1 ? '' : 's'} discovered
        </div>
      )}
    </div>
  );
};
