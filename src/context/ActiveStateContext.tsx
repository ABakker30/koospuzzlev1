// ActiveStateContext.tsx
// React context for accessing active state service throughout the app
// Provides hooks for pages to interact with the in-memory state

import React, { createContext, useContext, useState, useCallback } from 'react';
import { activeStateService, type ActiveState } from '../services/ActiveStateService';

interface ActiveStateContextType {
  activeState: ActiveState | null;
  setActiveState: (state: ActiveState) => void;
  clearActiveState: () => void;
  getStateKind: () => 'empty' | 'partial' | 'unknown';
  lastShapeRef: string | null;
  lastSolutionRef: string | null;
  setLastShapeRef: (ref: string | null) => void;
  setLastSolutionRef: (ref: string | null) => void;
}

const ActiveStateContext = createContext<ActiveStateContextType | undefined>(undefined);

export const ActiveStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Track state in React for re-renders
  const [activeState, setActiveStateReact] = useState<ActiveState | null>(
    activeStateService.getActiveState()
  );
  const [lastShapeRef, setLastShapeRefReact] = useState<string | null>(
    activeStateService.getLastShapeRef()
  );
  const [lastSolutionRef, setLastSolutionRefReact] = useState<string | null>(
    activeStateService.getLastSolutionRef()
  );

  // Wrapped setter that updates both service and React state
  const setActiveState = useCallback((state: ActiveState) => {
    try {
      activeStateService.setActiveState(state);
      setActiveStateReact(state);
      setLastShapeRefReact(state.shapeRef);
    } catch (error) {
      console.error('❌ Failed to set active state:', error);
      throw error;
    }
  }, []);

  // Wrapped clear that updates both service and React state
  const clearActiveState = useCallback(() => {
    activeStateService.clearActiveState();
    setActiveStateReact(null);
  }, []);

  // Get state kind
  const getStateKind = useCallback(() => {
    return activeStateService.getStateKind();
  }, [activeState]); // Re-compute when activeState changes

  // Last shape ref setter
  const setLastShapeRef = useCallback((ref: string | null) => {
    activeStateService.setLastShapeRef(ref);
    setLastShapeRefReact(ref);
  }, []);

  // Last solution ref setter
  const setLastSolutionRef = useCallback((ref: string | null) => {
    activeStateService.setLastSolutionRef(ref);
    setLastSolutionRefReact(ref);
  }, []);

  const value: ActiveStateContextType = {
    activeState,
    setActiveState,
    clearActiveState,
    getStateKind,
    lastShapeRef,
    lastSolutionRef,
    setLastShapeRef,
    setLastSolutionRef
  };

  return (
    <ActiveStateContext.Provider value={value}>
      {children}
    </ActiveStateContext.Provider>
  );
};

/**
 * Hook to access active state context
 * @throws Error if used outside ActiveStateProvider
 */
export const useActiveState = (): ActiveStateContextType => {
  const context = useContext(ActiveStateContext);
  if (context === undefined) {
    throw new Error('useActiveState must be used within ActiveStateProvider');
  }
  return context;
};

/**
 * Hook for pages that require a shape ref
 * Returns null if no shapeRef is available
 */
export const useRequireShapeRef = (): string | null => {
  const { activeState } = useActiveState();
  return activeState?.shapeRef || null;
};

/**
 * Hook to check if active state has placements (partial or full)
 */
export const useHasPlacements = (): boolean => {
  const { activeState } = useActiveState();
  return (activeState?.placements?.length || 0) > 0;
};
