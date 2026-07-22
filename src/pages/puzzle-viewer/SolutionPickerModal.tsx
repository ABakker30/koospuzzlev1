import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleSolutionRecord } from '../../api/solutions';
import { tokens } from '../../styles/tokens';

type SortField = 'date' | 'duration' | 'solver';
type SortDirection = 'asc' | 'desc';

interface SolutionPickerModalProps {
  solutions: PuzzleSolutionRecord[];
  puzzleName: string;
  onSelect: (solution: PuzzleSolutionRecord) => void;
  onClose: () => void;
  /** Optional per-row flag affordance — opens the caller's report flow. */
  onReport?: (solution: PuzzleSolutionRecord) => void;
}

export function SolutionPickerModal({
  solutions,
  puzzleName,
  onSelect,
  onClose,
  onReport
}: SolutionPickerModalProps) {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Physical build filter: show only solutions saved with a verified
  // gravity-stable assembly order (buildable with real pieces).
  const [physicalOnly, setPhysicalOnly] = useState(false);
  const physicalCount = useMemo(() => solutions.filter(s => s.is_physical).length, [solutions]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedSolutions = useMemo(() => {
    const pool = physicalOnly ? solutions.filter(s => s.is_physical) : solutions;
    return [...pool].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'duration':
          const aDuration = a.solve_time_ms || a.time_to_solve_sec ? (a.time_to_solve_sec || 0) * 1000 : Infinity;
          const bDuration = b.solve_time_ms || b.time_to_solve_sec ? (b.time_to_solve_sec || 0) * 1000 : Infinity;
          comparison = aDuration - bDuration;
          break;
        case 'solver':
          comparison = (a.solver_name || '').localeCompare(b.solver_name || '');
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [solutions, sortField, sortDirection, physicalOnly]);

  const formatDuration = (solution: PuzzleSolutionRecord): string => {
    const ms = solution.solve_time_ms;
    const sec = solution.time_to_solve_sec;
    
    if (ms) {
      const totalSec = Math.floor(ms / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    if (sec) {
      const mins = Math.floor(sec / 60);
      const secs = sec % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return '—';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Extract display name from solver_name (handle email addresses)
  const getDisplayName = (solverName: string | null | undefined): string => {
    if (!solverName) return 'Anonymous';
    // If it looks like an email, extract the part before @
    if (solverName.includes('@')) {
      return solverName.split('@')[0];
    }
    return solverName;
  };

  const getSortIcon = (field: SortField): string => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '⬆️' : '⬇️';
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: tokens.gradient.brand,
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          position: 'relative'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '1.2rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ 
            color: '#fff', 
            margin: '0 0 8px 0',
            fontSize: '1.6rem',
            fontWeight: 700
          }}>
            🏆 Select a Solution
          </h2>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            margin: 0,
            fontSize: '1rem'
          }}>
            {puzzleName} • {solutions.length} solution{solutions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sort buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => handleSort('date')}
            style={{
              background: sortField === 'date' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '20px',
              padding: '8px 16px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📅 Date {getSortIcon('date')}
          </button>
          <button
            onClick={() => handleSort('duration')}
            style={{
              background: sortField === 'duration' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '20px',
              padding: '8px 16px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⏱️ Duration {getSortIcon('duration')}
          </button>
          <button
            onClick={() => handleSort('solver')}
            style={{
              background: sortField === 'solver' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '20px',
              padding: '8px 16px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👤 Solver {getSortIcon('solver')}
          </button>
          {physicalCount > 0 && (
            <button
              onClick={() => setPhysicalOnly(prev => !prev)}
              title="Only solutions with a verified gravity-stable assembly order — buildable with real pieces"
              style={{
                background: physicalOnly ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.1)',
                border: physicalOnly ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '20px',
                padding: '8px 16px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🏗️ Physical ({physicalCount})
            </button>
          )}
        </div>

        {/* Solutions list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          borderRadius: '12px',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          {sortedSolutions.map((solution, index) => (
            <div
              key={solution.id}
              onClick={() => onSelect(solution)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: index < sortedSolutions.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: 'transparent'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Rank/Index */}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.9rem',
                color: index < 3 ? '#000' : '#fff',
                marginRight: '14px',
                flexShrink: 0
              }}>
                {index + 1}
              </div>

              {/* Thumbnail */}
              {solution.thumbnail_url && (
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  marginRight: '14px',
                  flexShrink: 0,
                  background: 'rgba(0, 0, 0, 0.3)'
                }}>
                  <img
                    src={solution.thumbnail_url}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                </div>
              )}

              {/* Solution info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '1rem',
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getDisplayName(solution.solver_name)}
                </div>
                <div style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <span>📅 {formatDate(solution.created_at)}</span>
                  <span>⏱️ {formatDuration(solution)}</span>
                  {solution.solution_type === 'auto' && (
                    <span style={{ color: '#feca57' }}>🤖 Auto</span>
                  )}
                  {solution.is_physical && (
                    <span style={{ color: '#f59e0b', fontWeight: 600 }} title="Verified gravity-stable assembly order — buildable with real pieces">
                      🏗️ Physical
                    </span>
                  )}
                </div>
              </div>

              {/* Subtle per-row report flag */}
              {onReport && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReport(solution);
                  }}
                  title={t('report.flag')}
                  aria-label={t('report.flag')}
                  style={{
                    flexShrink: 0,
                    marginLeft: '8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    opacity: 0.4,
                    padding: '6px',
                    lineHeight: 1,
                    transition: 'opacity 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
                >
                  🚩
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
