import { useState, useCallback, useRef } from 'react';
import type { IJK } from '../../../types/shape';

export interface Action {
  type: 'ADD_SPHERE' | 'REMOVE_SPHERE' | 'CLEAR_ALL' | 'UNDO' | 'REDO';
  timestamp: number;
  data: any;
  stateBefore?: IJK[];
  stateAfter?: IJK[];
}

interface UseActionTrackerReturn {
  actions: Action[];
  trackAction: (type: Action['type'], data: any) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
}

export const useActionTracker = (
  cells: IJK[],
  setCells: React.Dispatch<React.SetStateAction<IJK[]>>
): UseActionTrackerReturn => {
  const [actions, setActions] = useState<Action[]>([]);
  const [undoStack, setUndoStack] = useState<IJK[][]>([]);
  const [redoStack, setRedoStack] = useState<IJK[][]>([]);
  const lastCellsRef = useRef<IJK[]>(cells);
  
  // Track action
  const trackAction = useCallback((type: Action['type'], data: any) => {
    const action: Action = {
      type,
      timestamp: Date.now(),
      data,
      stateBefore: lastCellsRef.current,
      stateAfter: cells,
    };
    
    setActions(prev => [...prev, action]);
    
    // Update undo stack (but not for undo/redo actions themselves)
    if (type !== 'UNDO' && type !== 'REDO') {
      setUndoStack(prev => [...prev, lastCellsRef.current]);
      setRedoStack([]); // Clear redo stack on new action
    }
    
    lastCellsRef.current = cells;
  }, [cells]);
  
  // Undo
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const previousState = undoStack[undoStack.length - 1];
    
    // Prevent undoing if it would result in zero cells
    if (previousState.length === 0) {
      console.log('⚠️ Cannot undo - at least one sphere is required');
      return;
    }
    
    const newUndoStack = undoStack.slice(0, -1);
    
    setRedoStack(prev => [...prev, cells]);
    setUndoStack(newUndoStack);
    setCells(previousState);
    
    trackAction('UNDO', { previousState });
  }, [undoStack, cells, setCells, trackAction]);
  
  // Redo
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const nextState = redoStack[redoStack.length - 1];
    
    // Prevent redoing if it would result in zero cells
    if (nextState.length === 0) {
      console.log('⚠️ Cannot redo - at least one sphere is required');
      return;
    }
    
    const newRedoStack = redoStack.slice(0, -1);
    
    setUndoStack(prev => [...prev, cells]);
    setRedoStack(newRedoStack);
    setCells(nextState);
    
    trackAction('REDO', { nextState });
  }, [redoStack, cells, setCells, trackAction]);
  
  // Clear history
  const clearHistory = useCallback(() => {
    setActions([]);
    setUndoStack([]);
    setRedoStack([]);
    lastCellsRef.current = cells;
  }, [cells]);
  
  return {
    actions,
    trackAction,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    clearHistory,
  };
};
