// src/game/ui/DevTools.tsx
// Development-only debug tools for testing completion & repair
// TEMPORARY - Remove after Phase 3A-3 is complete

import React, { useState, useCallback } from 'react';
import type { GameState, GamePlacedPiece, PlayerId } from '../contracts/GameState';
import { cellToKey } from '../puzzle/PuzzleTypes';

// Only render in development
const IS_DEV = import.meta.env.DEV;

interface DevToolsProps {
  gameState: GameState;
  onStateChange: (updater: (state: GameState) => GameState) => void;
  onDispatch: (event: any) => void;
}

export function DevTools({ gameState, onStateChange, onDispatch }: DevToolsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [devFillIndex, setDevFillIndex] = useState(0);
  
  // Don't render in production
  if (!IS_DEV) return null;
  
  const targetCells = gameState.puzzleSpec.targetCells;
  const activePlayerId = gameState.players[gameState.activePlayerIndex]?.id ?? 'player-0';
  
  // Tool 1: Fill All Target Cells (instant completion)
  const handleFillAll = useCallback(() => {
    const now = Date.now();
    const syntheticPiece: GamePlacedPiece = {
      uid: `dev-fill-all-${now}`,
      pieceId: 'DEV-FILL',
      orientationId: 'dev-o1',
      cells: [...targetCells],
      placedAt: now,
      placedBy: activePlayerId,
      source: 'user',
    };
    
    onStateChange(state => {
      const newBoardState = new Map(state.boardState);
      newBoardState.set(syntheticPiece.uid, syntheticPiece);
      
      return {
        ...state,
        boardState: newBoardState,
        turnPlacementFlag: true,
        updatedAt: new Date().toISOString(),
      };
    });
    
    console.log('🧪 [DevTools] Filled all target cells:', targetCells.length);
  }, [targetCells, activePlayerId, onStateChange]);
  
  // Tool 2: Fill Target Cells Gradually (+5 chunks)
  const CHUNK_SIZE = 5;
  const handleFillGradual = useCallback(() => {
    if (devFillIndex >= targetCells.length) {
      console.log('🧪 [DevTools] All target cells already filled');
      return;
    }
    
    const chunk = targetCells.slice(devFillIndex, devFillIndex + CHUNK_SIZE);
    const now = Date.now();
    const syntheticPiece: GamePlacedPiece = {
      uid: `dev-chunk-${devFillIndex}-${now}`,
      pieceId: `DEV-CHUNK-${Math.floor(devFillIndex / CHUNK_SIZE)}`,
      orientationId: 'dev-o1',
      cells: chunk,
      placedAt: now,
      placedBy: activePlayerId,
      source: 'user',
    };
    
    onStateChange(state => {
      const newBoardState = new Map(state.boardState);
      newBoardState.set(syntheticPiece.uid, syntheticPiece);
      
      return {
        ...state,
        boardState: newBoardState,
        turnPlacementFlag: true,
        updatedAt: new Date().toISOString(),
      };
    });
    
    setDevFillIndex(prev => prev + CHUNK_SIZE);
    console.log(`🧪 [DevTools] Filled cells ${devFillIndex}-${devFillIndex + chunk.length} of ${targetCells.length}`);
  }, [devFillIndex, targetCells, activePlayerId, onStateChange]);
  
  // Tool 3: Clear Board
  const handleClearBoard = useCallback(() => {
    onStateChange(state => ({
      ...state,
      boardState: new Map(),
      roundNoPlacementCount: 0,
      turnPlacementFlag: false,
      updatedAt: new Date().toISOString(),
    }));
    setDevFillIndex(0);
    console.log('🧪 [DevTools] Board cleared');
  }, [onStateChange]);
  
  // Tool 4: Force Endgame Repair
  const handleForceRepair = useCallback(() => {
    onDispatch({ type: 'START_REPAIR', reason: 'endgame', triggeredBy: 'system' });
    console.log('🧪 [DevTools] Forced endgame repair');
  }, [onDispatch]);
  
  // Tool 5: Log Coverage Stats
  const handleLogStats = useCallback(() => {
    const targetCellKeys = gameState.puzzleSpec.targetCellKeys;
    const occupiedKeys = new Set<string>();
    
    for (const piece of gameState.boardState.values()) {
      for (const cell of piece.cells) {
        occupiedKeys.add(cellToKey(cell));
      }
    }
    
    let coveredCount = 0;
    for (const key of targetCellKeys) {
      if (occupiedKeys.has(key)) coveredCount++;
    }
    
    console.log('🧪 [DevTools] Coverage Stats:', {
      targetCellsCount: targetCellKeys.size,
      coveredCellsCount: coveredCount,
      occupiedCellsCount: occupiedKeys.size,
      completionPercent: ((coveredCount / targetCellKeys.size) * 100).toFixed(1) + '%',
      firstTargetKeys: Array.from(targetCellKeys).slice(0, 5),
      firstOccupiedKeys: Array.from(occupiedKeys).slice(0, 5),
    });
  }, [gameState]);
  
  // Calculate current coverage for display
  const occupiedCount = Array.from(gameState.boardState.values())
    .reduce((sum, p) => sum + p.cells.length, 0);
  const coveragePercent = ((occupiedCount / targetCells.length) * 100).toFixed(0);
  
  return (
    <div style={styles.container}>
      <div 
        style={styles.header}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span style={styles.headerIcon}>🧪</span>
        <span style={styles.headerTitle}>DEV TOOLS</span>
        <span style={styles.headerToggle}>{isCollapsed ? '▶' : '▼'}</span>
      </div>
      
      {!isCollapsed && (
        <div style={styles.content}>
          <div style={styles.stats}>
            Coverage: {occupiedCount}/{targetCells.length} ({coveragePercent}%)
          </div>
          
          <button style={styles.button} onClick={handleFillAll}>
            DEV: Fill All Target Cells
          </button>
          
          <button style={styles.button} onClick={handleFillGradual}>
            DEV: Fill Target Cells (+{CHUNK_SIZE})
            <span style={styles.buttonHint}>
              {devFillIndex}/{targetCells.length}
            </span>
          </button>
          
          <button style={styles.buttonDanger} onClick={handleClearBoard}>
            DEV: Clear Board
          </button>
          
          <button style={styles.button} onClick={handleForceRepair}>
            DEV: Force Endgame Repair
          </button>
          
          <button style={styles.buttonSecondary} onClick={handleLogStats}>
            DEV: Log Coverage Stats
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: 'rgba(30, 20, 20, 0.95)',
    borderRadius: '12px',
    border: '2px dashed #ef4444',
    minWidth: '240px',
    maxWidth: '280px',
    zIndex: 200,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
    userSelect: 'none',
  },
  headerIcon: {
    fontSize: '1rem',
  },
  headerTitle: {
    flex: 1,
    color: '#ef4444',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  headerToggle: {
    color: '#ef4444',
    fontSize: '0.7rem',
  },
  content: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  stats: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    padding: '4px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  button: {
    background: 'rgba(59, 130, 246, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonSecondary: {
    background: 'rgba(107, 114, 128, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonDanger: {
    background: 'rgba(239, 68, 68, 0.8)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonHint: {
    fontSize: '0.65rem',
    opacity: 0.7,
    marginLeft: '8px',
  },
};

export default DevTools;
