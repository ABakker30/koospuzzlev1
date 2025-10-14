// Manual Puzzle Page - MVP
// Uses same rendering pattern as Shape Editor

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ManualPuzzleTopBar } from './ManualPuzzleTopBar';
import { BrowseShapesModal } from './BrowseShapesModal';
import SceneCanvas from '../../components/SceneCanvas';
import { FakeOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { ijkToXyz } from '../../lib/ijk';
import type { IJK } from '../../types/shape';
import type { ContainerV3, VisibilitySettings, Orientation } from '../../types/lattice';
import type { ShapeListItem } from '../../services/ShapeFileService';
import '../../styles/shape.css';

export const ManualPuzzlePage: React.FC = () => {
  const navigate = useNavigate();
  const orientationController = useRef<GoldOrientationController | null>(null);

  // State - using ShapeEditor pattern
  const [cells, setCells] = useState<IJK[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [visibility, setVisibility] = useState<VisibilitySettings>({
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 1.0 }
  });
  const [currentOrientation, setCurrentOrientation] = useState<Orientation | null>(null);

  // FCC transformation matrix - same as ShapeEditorPage
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];

  // Initialize orientation controller
  useEffect(() => {
    const service = new FakeOrientationService();
    const controller = new GoldOrientationController(service);
    controller.setPiece('piece-mvp');
    
    const unsubscribe = controller.onOrientationChanged((orientation) => {
      setCurrentOrientation(orientation);
      console.log(`manual:orientationChanged`, {
        pieceId: 'piece-mvp',
        orientationId: orientation.orientationId,
        index: controller.getCurrentIndex()
      });
    });
    
    orientationController.current = controller;
    return () => unsubscribe();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded) return;

      // R / Shift+R: Cycle orientation
      if (e.key === 'r' || e.key === 'R') {
        if (e.shiftKey) {
          orientationController.current?.previous();
        } else {
          orientationController.current?.next();
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loaded]);

  // Handle shape loaded - match ShapeEditorPage pattern
  const handleShapeLoaded = (newContainer: ContainerV3, _item?: ShapeListItem) => {
    console.log(`manual:shapeLoaded`, { 
      id: newContainer.id, 
      cells: newContainer.cells.length 
    });

    // Convert to IJK format
    const newCells = newContainer.cells.map(([i,j,k]) => ({ i, j, k }));
    setCells(newCells);
    setLoaded(true);

    // Compute view transforms - same as ShapeEditorPage
    try {
      const v = computeViewTransforms(newCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log('✅ View transforms computed');
    } catch (error) {
      console.error('❌ Failed to compute view transforms:', error);
    }
  };

  // Handle visibility change
  const handleVisibilityChange = (updates: Partial<VisibilitySettings>) => {
    const newVisibility = { ...visibility, ...updates };
    setVisibility(newVisibility);
    console.log(`manual:visibility`, newVisibility);
  };

  // Handle reset view
  const handleResetView = () => {
    // For now, just log - SceneCanvas will handle camera
    console.log('Reset view requested');
  };

  return (
    <div className="content-studio-page" style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* Top Bar */}
      <ManualPuzzleTopBar
        onBrowseClick={() => setShowBrowseModal(true)}
        visibility={visibility}
        onVisibilityChange={handleVisibilityChange}
        onResetView={handleResetView}
        loaded={loaded}
      />

      {/* Main Viewport - use SceneCanvas like ShapeEditor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <SceneCanvas
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
          />
        ) : (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <div style={{ textAlign: "center", maxWidth: '400px', padding: '2rem' }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#111827", marginBottom: "1rem" }}>
                Manual Puzzle
              </h2>
              <p style={{ color: "#6b7280", marginBottom: "1rem" }}>
                Click <strong>Browse Shapes</strong> to load a container and start solving
              </p>
              <div style={{ fontSize: "0.875rem", color: "#9ca3af", textAlign: 'left', display: 'inline-block' }}>
                <p>• Load a shape to begin</p>
                <p>• Press <kbd>R</kbd> / <kbd>Shift+R</kbd> to cycle orientations</p>
                <p>• Drag to orbit, scroll to zoom</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Browse Shapes Modal */}
      <BrowseShapesModal
        open={showBrowseModal}
        onClose={() => setShowBrowseModal(false)}
        onLoaded={handleShapeLoaded}
      />
    </div>
  );
};

export default ManualPuzzlePage;
