import * as THREE from 'three';
import type { IJK } from '../api/contracts';

/**
 * Target types for gesture actions
 */
export type GestureTarget = 
  | 'ghost'           // Preview piece (can place)
  | 'placed'          // Placed piece (can select)
  | 'placed-selected' // Selected placed piece (can delete)
  | 'empty'           // Empty cell (can set anchor)
  | 'drawing'         // Drawing cell (edit mode)
  | 'container'       // Container cell
  | 'none';           // Background/nothing

/**
 * Result of raycast target detection
 */
export interface GestureTargetResult {
  target: GestureTarget;
  data?: {
    pieceUid?: string;
    cell?: IJK;
    instanceId?: number;
  };
}

/**
 * Detect what the user tapped on using raycasting
 * 
 * @param clientX - Mouse/touch X coordinate
 * @param clientY - Mouse/touch Y coordinate
 * @param camera - Three.js camera
 * @param canvas - Renderer's canvas element
 * @param refs - Object containing mesh refs
 * @returns Target type and associated data
 */
export function detectGestureTarget(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  refs: {
    previewMesh?: THREE.InstancedMesh | null;
    placedMeshes?: Map<string, THREE.InstancedMesh>;
    containerMesh?: THREE.InstancedMesh | null;
    drawingMesh?: THREE.InstancedMesh | null;
  },
  context: {
    selectedPieceUid?: string | null;
    hidePlacedPieces?: boolean;
    cells?: IJK[];
  }
): GestureTargetResult {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Convert screen coordinates to normalized device coordinates
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Priority 1: Check ghost preview (highest priority)
  if (refs.previewMesh) {
    const intersections = raycaster.intersectObject(refs.previewMesh);
    if (intersections.length > 0) {
      console.log('🎯 Target: ghost');
      return { target: 'ghost' };
    }
  }

  // Priority 2: Check placed pieces (if visible)
  if (refs.placedMeshes && !context.hidePlacedPieces) {
    for (const [uid, mesh] of refs.placedMeshes.entries()) {
      const intersections = raycaster.intersectObject(mesh);
      if (intersections.length > 0) {
        const isSelected = uid === context.selectedPieceUid;
        console.log('🎯 Target:', isSelected ? 'placed-selected' : 'placed', uid);
        return {
          target: isSelected ? 'placed-selected' : 'placed',
          data: { pieceUid: uid },
        };
      }
    }
  }

  // Priority 3: Check drawing cells (edit mode)
  if (refs.drawingMesh) {
    const intersections = raycaster.intersectObject(refs.drawingMesh);
    if (intersections.length > 0) {
      console.log('🎯 Target: drawing');
      return { target: 'drawing' };
    }
  }

  // Priority 4: Check container/empty cells
  if (refs.containerMesh) {
    const intersections = raycaster.intersectObject(refs.containerMesh);
    if (intersections.length > 0 && context.cells) {
      const intersection = intersections[0];
      const instanceId = intersection.instanceId;
      
      if (instanceId !== undefined && instanceId < context.cells.length) {
        const cell = context.cells[instanceId];
        console.log('🎯 Target: empty cell', cell);
        return {
          target: 'empty',
          data: { cell, instanceId },
        };
      }
    }
  }

  // Nothing hit
  console.log('🎯 Target: none');
  return { target: 'none' };
}

/**
 * Determine action from gesture type + target
 * Returns action name for logging/debugging
 */
export function getActionFromGesture(
  gestureType: 'tap' | 'double-tap' | 'long-press',
  target: GestureTarget
): string {
  const actionMap: Record<string, string> = {
    // TAP actions
    'tap-ghost': 'select-piece',
    'tap-placed': 'select-piece',
    'tap-placed-selected': 'select-piece',
    'tap-empty': 'set-anchor',
    'tap-container': 'deselect',
    
    // DOUBLE-TAP actions
    'double-tap-ghost': 'place-piece',
    'double-tap-placed-selected': 'delete-piece',
    
    // LONG-PRESS actions
    'long-press-ghost': 'place-piece',
    'long-press-placed-selected': 'delete-piece',
    'long-press-empty': 'draw-cell',
  };

  const key = `${gestureType}-${target}`;
  return actionMap[key] || 'none';
}
