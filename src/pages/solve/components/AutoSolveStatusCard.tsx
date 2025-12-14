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
  
  // Extract additional stats
  const elapsedMs = status.elapsedMs ?? 0;
  const bestDepth = (status as any).bestDepth ?? status.depth ?? 0;
  const restartCount = (status as any).restartCount ?? 0;
  const shuffleStrategy = (status as any).shuffleStrategy;
  const restartInterval = (status as any).restartInterval;
  const restartIntervalSeconds = (status as any).restartIntervalSeconds;
  
  // Generate shuffle info text
  const getShuffleInfo = (): string => {
    if (shuffleStrategy === 'periodicRestartTime' && restartIntervalSeconds) {
      return `every ${restartIntervalSeconds}s`;
    } else if (shuffleStrategy === 'periodicRestart' && restartInterval) {
      return `every ${restartInterval.toLocaleString()} nodes`;
    } else if (shuffleStrategy === 'adaptive') {
      return 'when backtracking';
    } else if (shuffleStrategy === 'initial') {
      return 'at start only';
    }
    return '';
  };
  
  // Format elapsed time
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

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
        <div>Time: {formatTime(elapsedMs)}</div>
        <div>Depth: {status.depth}</div>
        <div>Max Depth: {bestDepth}</div>
        <div>Nodes: {nodes.toLocaleString()}</div>
        {restartCount > 0 && (
          <div>
            Shuffles: {restartCount} {getShuffleInfo() && `(${getShuffleInfo()})`}
          </div>
        )}
        {nodesPerSec !== null && (
          <div>Speed: {nodesPerSec.toLocaleString()} nodes/sec</div>
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
