import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [maxDepthHits, setMaxDepthHits] = useState(0);
  const maxDepthRef = useRef<number>(0);
  const lastWasAtMaxRef = useRef<boolean>(false);
  const seenBelowMaxSinceLastHitRef = useRef<boolean>(false);
  const lastNodesRef = useRef<number>(0);
  const lastElapsedMsRef = useRef<number>(0);

  useEffect(() => {
    if (!status || !isAutoSolving) {
      maxDepthRef.current = 0;
      lastWasAtMaxRef.current = false;
      seenBelowMaxSinceLastHitRef.current = false;
      lastNodesRef.current = 0;
      lastElapsedMsRef.current = 0;
      setMaxDepthHits(0);
      return;
    }

    const nodesNow = status.nodes ?? 0;
    const elapsedNow = status.elapsedMs ?? 0;

    // Detect a new run (engine restarted from scratch) and reset counters.
    if (nodesNow < lastNodesRef.current || elapsedNow < lastElapsedMsRef.current) {
      maxDepthRef.current = 0;
      lastWasAtMaxRef.current = false;
      seenBelowMaxSinceLastHitRef.current = false;
      setMaxDepthHits(0);
    }

    const depthNow = status.depth ?? 0;
    const bestDepthNow = (status as any).bestDepth ?? depthNow;

    // If Max Depth increased, reset hits to 1 (we just reached the new max).
    if (bestDepthNow > maxDepthRef.current) {
      maxDepthRef.current = bestDepthNow;
      setMaxDepthHits(1);
      lastWasAtMaxRef.current = true;
      seenBelowMaxSinceLastHitRef.current = false;
    } else {
      const atMax = depthNow === maxDepthRef.current && maxDepthRef.current > 0;

      if (!atMax && maxDepthRef.current > 0) {
        // Mark that we've been below the current max at least once since the last counted hit.
        seenBelowMaxSinceLastHitRef.current = true;
      }

      // Count a hit when we transition into the current Max Depth.
      // To avoid missing transitions due to coarse status updates, we primarily key off
      // "have we been below max since the last hit".
      if (atMax && seenBelowMaxSinceLastHitRef.current) {
        setMaxDepthHits((prev) => prev + 1);
        seenBelowMaxSinceLastHitRef.current = false;
      } else if (atMax && !lastWasAtMaxRef.current && maxDepthRef.current > 0) {
        // Fallback: if we do observe the exact edge, count it as well.
        setMaxDepthHits((prev) => (prev === 0 ? 1 : prev + 1));
      }

      lastWasAtMaxRef.current = atMax;
    }

    lastNodesRef.current = nodesNow;
    lastElapsedMsRef.current = elapsedNow;
  }, [status, isAutoSolving]);

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
  const bestDepthHits = (status as any).maxDepthHits ?? maxDepthHits;
  const restartCount = (status as any).restartCount ?? 0;
  const shuffleStrategy = (status as any).shuffleStrategy;
  const restartInterval = (status as any).restartInterval;
  const restartIntervalSeconds = (status as any).restartIntervalSeconds;
  
  // Parallel workers info
  const workers = (status as any).workers;
  const totalWorkers = (status as any).totalWorkers;
  
  // Depth histogram from GPU solver
  const depthHistogram = (status as any).depthHistogram as number[] | undefined;
  
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
  
  // Format depth histogram - show top depths with counts
  const formatDepthHistogram = (histogram: number[]): { depth: number; count: number }[] => {
    const entries: { depth: number; count: number }[] = [];
    for (let i = 0; i < histogram.length; i++) {
      if (histogram[i] > 0) {
        entries.push({ depth: i, count: histogram[i] });
      }
    }
    // Sort by depth descending, take top 5
    return entries.sort((a, b) => b.depth - a.depth).slice(0, 5);
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
        🔍 {t('solve.solverStatus')}
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
        {totalWorkers && totalWorkers > 1 && (
          <div style={{ color: '#60a5fa', fontWeight: 500 }}>
            ⚡ Workers: {workers}/{totalWorkers} active
          </div>
        )}
        <div>{t('solve.time')}: {formatTime(elapsedMs)}</div>
        <div>{t('solve.depth')}: {status.depth}</div>
        <div>{t('solve.maxDepth')}: {bestDepth}</div>
        <div>{t('solve.maxDepthHits')}: {bestDepthHits}</div>
        {depthHistogram && depthHistogram.some(c => c > 0) && (
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
            📊 Depth counts: {formatDepthHistogram(depthHistogram).map(({ depth, count }) => 
              `${depth}→${count >= 1000 ? `${(count/1000).toFixed(1)}k` : count}`
            ).join(', ')}
          </div>
        )}
        <div>{t('solve.nodes')}: {nodes.toLocaleString()}</div>
        {restartCount > 0 && (
          <div>
            {t('solve.shuffles')}: {restartCount} {getShuffleInfo() && `(${getShuffleInfo()})`}
          </div>
        )}
        {nodesPerSec !== null && (
          <div>{t('solve.speed')}: {nodesPerSec.toLocaleString()} {t('solve.nodesPerSec')}</div>
        )}
        {solutionsFound > 0 && (
          <div
            style={{
              color: '#10b981',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            ✅ {solutionsFound} {solutionsFound > 1 ? t('solve.solutions') : t('solve.solution')} {t('solve.found')}
          </div>
        )}
      </div>
    </div>
  );
};
