import React from 'react';
import type { StatusV2 } from '../../../engines/types';

type AutoSolveStatusCardProps = {
  status: StatusV2 | null;
  solutionsFound: number;
  isAutoSolving: boolean;
};

export const AutoSolveStatusCard: React.FC<AutoSolveStatusCardProps> = ({
  status,
  solutionsFound,
  isAutoSolving,
}) => {
  if (!status || !isAutoSolving) {
    return null;
  }

  const nodes = status.nodes ?? 0;
  const nodesPerSec =
    (status as any).nodesPerSec !== undefined
      ? (status as any).nodesPerSec
      : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.8)',
        padding: '16px',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: '250px',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          fontSize: '14px',
          color: '#fff',
          marginBottom: '8px',
          fontWeight: 600,
        }}
      >
        🔍 Solver Status
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div>Depth: {status.depth}</div>
        <div>Nodes: {nodes.toLocaleString()}</div>
        {nodesPerSec !== null && (
          <div style={{ fontSize: '11px', opacity: 0.8 }}>
            {nodesPerSec.toFixed(0)} n/s
          </div>
        )}
        {solutionsFound > 0 && (
          <div
            style={{
              color: '#10b981',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            ✅ {solutionsFound} solution
            {solutionsFound > 1 ? 's' : ''} found
          </div>
        )}
      </div>
    </div>
  );
};
