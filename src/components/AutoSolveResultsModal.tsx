// src/components/AutoSolveResultsModal.tsx
import React from 'react';
import { useDraggable } from '../hooks/useDraggable';
import type { AutoSolveRunStats } from '../utils/autoSolveStatsLogger';
import { getAutoSolveResultsCopy } from '../utils/autoSolveResultsCopy';
import { formatMs, formatInt, formatRate, formatProgress } from '../utils/formatters';

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
  const draggable = useDraggable();
  
  if (!open || !result) return null;

  // Get mode-aware copy
  const copy = getAutoSolveResultsCopy({
    mode: result.mode,
    stopReason: result.stopReason,
    success: result.success,
    tailTriggered: result.tailTriggered,
  });

  const getModeColor = (mode: string): string => {
    if (mode === 'exhaustive') return '#3b82f6';
    if (mode === 'fast') return '#f59e0b';
    return '#22c55e';
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .autosolver-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .autosolver-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .autosolver-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          border-radius: 10px;
          border: 2px solid rgba(219, 234, 254, 0.5);
        }
        .autosolver-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
        }
        .autosolver-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #1d4ed8;
        }
        .autosolver-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #3b82f6 rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div 
        ref={draggable.ref}
        className="autosolver-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(59,130,246,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{
            background: result.success 
              ? 'linear-gradient(135deg, #10b981, #059669, #047857)'
              : 'linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)',
            padding: '1.25rem 1.5rem',
            borderRadius: '17px 17px 0 0',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            boxShadow: result.success 
              ? '0 4px 20px rgba(16,185,129,0.4)' 
              : '0 4px 20px rgba(239,68,68,0.4)',
            position: 'relative',
            userSelect: 'none',
            flexShrink: 0,
            ...draggable.headerStyle
          }}
        >
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            color: '#fff',
            fontWeight: 700,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {copy.title}
            {result.solutionsFound && result.solutionsFound > 1 && (
              <span style={{ 
                fontSize: '1rem', 
                fontWeight: 500, 
                marginLeft: '0.5rem',
                opacity: 0.9 
              }}>
                ({result.solutionsFound.toLocaleString()} found)
              </span>
            )}
          </h2>
          <div style={{ 
            fontSize: '0.875rem', 
            marginTop: '0.5rem', 
            color: 'rgba(255,255,255,0.95)'
          }}>
            Mode: {result.mode.charAt(0).toUpperCase() + result.mode.slice(1)} ({copy.truthLabel}) · Seed: {result.seed}
            {result.success && result.timeToSolutionMs ? (
              <> · Found in: {formatMs(result.timeToSolutionMs)} · Total: {formatMs(result.elapsedMs)}</>
            ) : (
              <> · Total: {formatMs(result.elapsedMs)}</>
            )}
          </div>
          
          {/* Close button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px',
              lineHeight: 10,
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
            }}
          >×</button>
        </div>

        {/* Content - Scrollable */}
        <div style={{ 
          padding: '1.5rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem',
          overflowY: 'auto',
          flex: 1,
          color: '#1e40af'
        }}>
          
          {/* Two-column summary grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Left: Puzzle */}
            <div style={{
              padding: '1rem',
              background: '#f0f9ff',
              borderLeft: '3px solid #3b82f6',
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: '#3b82f6' }}>PUZZLE</div>
              <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}><strong>{result.puzzleName}</strong></div>
              <div style={{ fontSize: '0.75rem', color: '#666' }}>{result.totalPiecesTarget} pieces target</div>
            </div>

            {/* Right: Strategy */}
            <div style={{
              padding: '1rem',
              background: '#fef3c7',
              borderLeft: `3px solid ${getModeColor(result.mode)}`,
              borderRadius: '6px',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: getModeColor(result.mode) }}>STRATEGY</div>
              <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}><strong>{result.mode.charAt(0).toUpperCase() + result.mode.slice(1)}</strong> · {copy.truthLabel}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>Tail: {result.tailTriggered ? 'Yes' : 'No'} · Restarts: {result.shuffleStrategy} · Random: {result.randomizeTies ? 'Yes' : 'No'}</div>
              <div style={{ fontSize: '0.75rem', color: '#999', fontStyle: 'italic' }}>Stopped: {result.stopReason}</div>
            </div>
          </div>

          {/* Performance strip */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: '#f0fdf4', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a' }}>BEST PROGRESS</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>{formatProgress(result.bestPlaced, result.totalPiecesTarget)}</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: '#fef3c7', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b' }}>ELAPSED</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>{formatMs(result.elapsedMs)}</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: '#f0f9ff', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#3b82f6' }}>NODES</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>{formatInt(result.nodes)}</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px', padding: '0.75rem', background: '#f0fdf4', borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a' }}>SPEED</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.25rem' }}>{formatRate(result.nodesPerSecAvg)}</div>
            </div>
          </div>

          {/* Explanation block */}
          <div style={{
            padding: '1rem',
            background: result.success ? '#f0fdf4' : '#fef3c7',
            borderRadius: '6px',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            color: '#333',
          }}>
            {copy.body}
          </div>

          {/* Tail note */}
          {copy.tailNote && (
            <div style={{
              padding: '0.75rem',
              background: '#f0f9ff',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#666',
              fontStyle: 'italic',
            }}>
              {copy.tailNote}
            </div>
          )}

          {/* Next steps suggestions */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#666' }}>What should I do next?</div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#333' }}>
              {copy.suggestions.map((s, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{s}</li>)}
            </ul>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {/* Primary action */}
            {copy.actions.primary.action === 'runAgain' && (
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
                {copy.actions.primary.label}
              </button>
            )}

            {/* Secondary mode-switch actions */}
            {copy.actions.secondary.map((action, i) => (
              <button
                key={i}
                onClick={() => onSwitchMode && onSwitchMode(action.mode)}
                style={{
                  padding: '0.75rem 1rem',
                  background: getModeColor(action.mode),
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {action.label}
              </button>
            ))}

            {/* Utility actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {copy.actions.utility.map((action, i) => (
                <button
                  key={i}
                  onClick={action.action === 'exportCSV' ? onExportCSV : onClose}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    background: action.action === 'exportCSV' ? '#f59e0b' : '#6b7280',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
