import React from 'react';
import { ModalBase } from '../../components/ModalBase';
import { tokens } from '../../styles/tokens';
import type { PuzzleSolutionSummary } from '../../api/solutions';

interface SolutionPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  solutions: PuzzleSolutionSummary[];
  /** Currently displayed solution id (highlighted as "current") */
  currentSolutionId: string | null;
  onSelect: (solutionId: string) => void;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatDuration(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Lets the viewer pick which solution of a puzzle to explore.
 * The list is newest-first; the most recent is the default the page loads.
 */
export const SolutionPickerModal: React.FC<SolutionPickerModalProps> = ({
  isOpen,
  onClose,
  solutions,
  currentSolutionId,
  onSelect,
}) => {
  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title="Choose Solution" size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {solutions.length === 0 && (
          <div style={{ color: tokens.text.onGradientMuted, textAlign: 'center', padding: '24px' }}>
            No solutions available.
          </div>
        )}

        {solutions.map((sol, idx) => {
          const isCurrent = sol.id === currentSolutionId;
          const duration = formatDuration(sol.solve_time_ms);
          const isAuto = sol.solution_type === 'auto';

          return (
            <button
              key={sol.id}
              onClick={() => onSelect(sol.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                textAlign: 'left',
                padding: '12px',
                borderRadius: '12px',
                cursor: 'pointer',
                background: isCurrent ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)',
                border: isCurrent
                  ? `2px solid ${tokens.color.highlight}`
                  : '2px solid rgba(255,255,255,0.15)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.22)';
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '8px',
                  flexShrink: 0,
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                {sol.thumbnail_url ? (
                  <img
                    src={sol.thumbnail_url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>🧩</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '2px',
                  }}
                >
                  <span
                    style={{
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {sol.solver_name || 'Unknown solver'}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      color: '#fff',
                      background: isAuto ? 'rgba(16,185,129,0.6)' : 'rgba(59,130,246,0.6)',
                    }}
                  >
                    {isAuto ? 'Auto' : 'Manual'}
                  </span>
                </div>
                <div
                  style={{
                    color: tokens.text.onGradientMuted,
                    fontSize: '0.78rem',
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{idx === 0 ? 'Latest · ' : ''}{formatDate(sol.created_at)}</span>
                  {typeof sol.move_count === 'number' && <span>{sol.move_count} moves</span>}
                  {duration && <span>{duration}</span>}
                </div>
              </div>

              {/* Current marker */}
              {isCurrent && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#1a1a1a',
                    background: tokens.color.highlight,
                    borderRadius: '999px',
                    padding: '3px 10px',
                  }}
                >
                  Viewing
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ModalBase>
  );
};
