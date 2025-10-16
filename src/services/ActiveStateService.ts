// ActiveStateService.ts
// In-memory holder for active state handoff between functions
// No persistence, no transforms, just clean state passing

interface KoosStatePlacement {
  pieceId: string;
  anchorIJK: [number, number, number];
  orientationIndex: number;
}

interface ActiveState {
  schema: 'koos.state';
  version: 1;
  shapeRef: string;
  placements: KoosStatePlacement[];
}

interface LastKnownRefs {
  lastShapeRef: string | null;
  lastSolutionRef: string | null;
}

class ActiveStateService {
  private activeState: ActiveState | null = null;
  private lastKnownRefs: LastKnownRefs = {
    lastShapeRef: null,
    lastSolutionRef: null
  };

  /**
   * Get the current active state (in memory only)
   */
  getActiveState(): ActiveState | null {
    return this.activeState;
  }

  /**
   * Set the active state with validation
   * @throws Error if structure is invalid
   */
  setActiveState(newState: ActiveState): void {
    // Validate structure
    if (!newState || typeof newState !== 'object') {
      throw new Error('ActiveState must be an object');
    }

    if (newState.schema !== 'koos.state') {
      throw new Error('ActiveState schema must be "koos.state"');
    }

    if (newState.version !== 1) {
      throw new Error('ActiveState version must be 1');
    }

    if (typeof newState.shapeRef !== 'string' || !newState.shapeRef) {
      throw new Error('ActiveState shapeRef must be a non-empty string');
    }

    if (!Array.isArray(newState.placements)) {
      throw new Error('ActiveState placements must be an array');
    }

    // Validate each placement
    for (const placement of newState.placements) {
      if (!placement.pieceId || typeof placement.pieceId !== 'string') {
        throw new Error('Each placement must have a valid pieceId');
      }
      if (!Array.isArray(placement.anchorIJK) || placement.anchorIJK.length !== 3) {
        throw new Error('Each placement must have anchorIJK as [i, j, k]');
      }
      if (typeof placement.orientationIndex !== 'number') {
        throw new Error('Each placement must have a numeric orientationIndex');
      }
    }

    // Store valid state
    this.activeState = newState;
    
    // Update last known refs
    this.lastKnownRefs.lastShapeRef = newState.shapeRef;
    
    console.log('✅ ActiveState set:', {
      shapeRef: newState.shapeRef.substring(0, 24) + '...',
      placements: newState.placements.length
    });
  }

  /**
   * Clear the active state
   */
  clearActiveState(): void {
    this.activeState = null;
    console.log('🗑️ ActiveState cleared');
  }

  /**
   * Get the kind of the current state: empty / partial / full
   * Derived from placements count (full determined by caller context)
   */
  getStateKind(): 'empty' | 'partial' | 'unknown' {
    if (!this.activeState) return 'empty';
    if (this.activeState.placements.length === 0) return 'empty';
    // Caller determines if it's full by checking completion
    return 'partial';
  }

  /**
   * Get last known shape ref
   */
  getLastShapeRef(): string | null {
    return this.lastKnownRefs.lastShapeRef;
  }

  /**
   * Set last known shape ref
   */
  setLastShapeRef(ref: string | null): void {
    this.lastKnownRefs.lastShapeRef = ref;
  }

  /**
   * Get last known solution ref
   */
  getLastSolutionRef(): string | null {
    return this.lastKnownRefs.lastSolutionRef;
  }

  /**
   * Set last known solution ref
   */
  setLastSolutionRef(ref: string | null): void {
    this.lastKnownRefs.lastSolutionRef = ref;
  }

  /**
   * Create an empty active state with just a shape ref
   */
  createEmptyState(shapeRef: string): ActiveState {
    return {
      schema: 'koos.state',
      version: 1,
      shapeRef,
      placements: []
    };
  }
}

// Singleton instance
export const activeStateService = new ActiveStateService();

// Export types
export type { ActiveState, KoosStatePlacement, LastKnownRefs };
