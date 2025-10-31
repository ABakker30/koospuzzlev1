// Action tracker for manual solve mode - records user solving actions for movie generation
import { useState, useCallback, useRef } from 'react';

export interface SolveAction {
  type: 'PLACE_PIECE' | 'REMOVE_PIECE' | 'UNDO' | 'REDO' | 'START_SOLVE' | 'COMPLETE_SOLVE';
  timestamp: number;
  data: {
    pieceId?: string;
    orientation?: number | string; // Index in orientations array or orientation ID
    ijkPosition?: { i: number; j: number; k: number };
    cells?: Array<{ i: number; j: number; k: number }>; // Affected cells
    uid?: string; // Unique placement ID
  };
}

interface UseSolveActionTrackerReturn {
  actions: SolveAction[];
  trackAction: (type: SolveAction['type'], data: SolveAction['data']) => void;
  startTracking: () => void;
  stopTracking: () => void;
  isTracking: boolean;
  clearHistory: () => void;
  getSolveStats: () => {
    totalActions: number;
    placements: number;
    removals: number;
    undos: number;
    totalTimeMs: number;
    averageActionTimeMs: number;
  };
}

export const useSolveActionTracker = (): UseSolveActionTrackerReturn => {
  const [actions, setActions] = useState<SolveAction[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  
  // Start tracking
  const startTracking = useCallback(() => {
    setIsTracking(true);
    startTimeRef.current = Date.now();
    
    const startAction: SolveAction = {
      type: 'START_SOLVE',
      timestamp: Date.now(),
      data: {},
    };
    
    setActions([startAction]);
    console.log('🎬 Solve action tracking started');
  }, []);
  
  // Stop tracking
  const stopTracking = useCallback(() => {
    setIsTracking(false);
    
    const completeAction: SolveAction = {
      type: 'COMPLETE_SOLVE',
      timestamp: Date.now(),
      data: {},
    };
    
    setActions(prev => [...prev, completeAction]);
    console.log('🎬 Solve action tracking stopped');
  }, []);
  
  // Track action
  const trackAction = useCallback((type: SolveAction['type'], data: SolveAction['data']) => {
    if (!isTracking && type !== 'START_SOLVE') {
      return; // Don't track if not started
    }
    
    const action: SolveAction = {
      type,
      timestamp: Date.now(),
      data,
    };
    
    setActions(prev => [...prev, action]);
    
    // Log for debugging
    console.log(`🎬 Action tracked: ${type}`, {
      pieceId: data.pieceId,
      timestamp: action.timestamp,
    });
  }, [isTracking]);
  
  // Clear history
  const clearHistory = useCallback(() => {
    setActions([]);
    setIsTracking(false);
    startTimeRef.current = null;
    console.log('🎬 Solve action history cleared');
  }, []);
  
  // Get solve statistics
  const getSolveStats = useCallback(() => {
    const placements = actions.filter(a => a.type === 'PLACE_PIECE').length;
    const removals = actions.filter(a => a.type === 'REMOVE_PIECE').length;
    const undos = actions.filter(a => a.type === 'UNDO').length;
    
    const startAction = actions.find(a => a.type === 'START_SOLVE');
    const completeAction = actions.find(a => a.type === 'COMPLETE_SOLVE');
    
    const totalTimeMs = startAction && completeAction 
      ? completeAction.timestamp - startAction.timestamp 
      : startTimeRef.current 
        ? Date.now() - startTimeRef.current 
        : 0;
    
    const actionEvents = actions.filter(a => 
      ['PLACE_PIECE', 'REMOVE_PIECE', 'UNDO', 'REDO'].includes(a.type)
    );
    
    const averageActionTimeMs = actionEvents.length > 1
      ? totalTimeMs / (actionEvents.length - 1)
      : 0;
    
    return {
      totalActions: actions.length,
      placements,
      removals,
      undos,
      totalTimeMs,
      averageActionTimeMs,
    };
  }, [actions]);
  
  return {
    actions,
    trackAction,
    startTracking,
    stopTracking,
    isTracking,
    clearHistory,
    getSolveStats,
  };
};
