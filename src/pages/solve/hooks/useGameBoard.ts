import { useState, useEffect } from 'react';
import type { IJK } from '../../../types/shape';
import type { ViewTransforms } from '../../../services/ViewTransforms';
import { ijkToXyz } from '../../../lib/ijk';
import { computeViewTransforms } from '../../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';

const T_IJK_TO_XYZ = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

export function useGameBoard(puzzle?: any) {
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!puzzle) return;

    // Load container geometry from puzzle.geometry (same as Manual Solve)
    const containerCells: IJK[] = (puzzle as any).geometry || [];
    setCells(containerCells);

    try {
      const viewData = computeViewTransforms(
        containerCells,
        ijkToXyz,
        T_IJK_TO_XYZ,
        quickHullWithCoplanarMerge
      );
      setView(viewData);

      // Aim orbit controls at the puzzle center (same pattern as Manual Solve)
      setTimeout(() => {
        const center =
          (viewData as any).centroid_world ||
          (viewData as any).centroidWorld;
        if ((window as any).setOrbitTarget && center) {
          (window as any).setOrbitTarget(center);
        }
      }, 100);
    } catch (err) {
      console.error('❌ Failed to compute view transforms (game):', err);
    }

    setLoaded(true);
  }, [puzzle]);

  return {
    cells,
    view,
    loaded,
  };
}
