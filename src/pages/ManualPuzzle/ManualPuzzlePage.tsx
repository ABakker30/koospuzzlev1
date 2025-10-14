// Manual Puzzle Page - MVP with Gold Orientations + Preview Ghost
// Uses same rendering pattern as Shape Editor with orientation cycling and preview

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ManualPuzzleTopBar } from './ManualPuzzleTopBar';
import { BrowseShapesModal } from './BrowseShapesModal';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { ijkToXyz } from '../../lib/ijk';
import type { IJK } from '../../types/shape';
import type { ContainerV3, VisibilitySettings } from '../../types/lattice';
import type { ShapeListItem } from '../../services/ShapeFileService';
import { GoldOrientationService, GoldOrientationController, type OrientationSpec } from '../../services/GoldOrientationService';
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

  // NEW: orientation + piece list + anchor
  const [pieces, setPieces] = useState<string[]>([]);
  const [activePiece, setActivePiece] = useState<string>('K');
  const [currentOrientation, setCurrentOrientation] = useState<OrientationSpec | null>(null);
  const [anchor, setAnchor] = useState<IJK | null>(null);

  // FCC transformation matrix - same as ShapeEditorPage
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];

  // Init orientation service/controller once
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        console.log('🔄 Loading orientation service...');
        const svc = new GoldOrientationService();
        await svc.load();
        
        const controller = new GoldOrientationController(svc);
        
        // Register listener BEFORE init so we catch the initial orientation
        unsubscribe = controller.onOrientationChanged((o) => {
          setCurrentOrientation(o); // {orientationId, ijkOffsets}
          console.log('manual:orientationChanged', o.orientationId, 'offsets:', o.ijkOffsets);
        });
        
        await controller.init(activePiece);

        orientationController.current = controller;
        const pieceList = svc.getPieces();
        setPieces(pieceList);
        console.log('✅ Orientation service loaded, pieces:', pieceList.length);
      } catch (error) {
        console.error('❌ Failed to load orientation service:', error);
      }
    })();

    return () => { if (unsubscribe) unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (guard modal & typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded || showBrowseModal) return;
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;

      if (e.key.toLowerCase() === 'r') {
        if (!anchor) return; // require an anchor first
        e.shiftKey ? orientationController.current?.previous()
                   : orientationController.current?.next();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loaded, showBrowseModal, anchor]);

  // Handle shape loaded (ContainerV3 → IJK[])
  const handleShapeLoaded = (newContainer: ContainerV3, _item?: ShapeListItem) => {
    console.log(`manual:shapeLoaded`, { 
      id: newContainer.id, 
      cells: newContainer.cells.length 
    });

    // Convert to IJK format
    const newCells: IJK[] = newContainer.cells.map(([i,j,k]) => ({ i, j, k }));
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

  // Visibility change
  const handleVisibilityChange = (updates: Partial<VisibilitySettings>) => {
    const newVisibility = { ...visibility, ...updates };
    setVisibility(newVisibility);
    console.log(`manual:visibility`, newVisibility);
  };

  // Reset view (SceneCanvas will handle camera reset if exposed later)
  const handleResetView = () => { 
    console.log('Reset view requested'); 
  };

  // Active Piece change
  const handleActivePieceChange = (id: string) => {
    setActivePiece(id);
    orientationController.current?.setPiece(id);
  };

  return (
    <div className="content-studio-page" style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      {/* Top Bar */}
      <ManualPuzzleTopBar
        onBrowseClick={() => setShowBrowseModal(true)}
        visibility={visibility}
        onVisibilityChange={handleVisibilityChange}
        onResetView={handleResetView}
        loaded={loaded}
        pieces={pieces}
        activePiece={activePiece}
        onActivePieceChange={handleActivePieceChange}
      />

      {/* Main Viewport - use SceneCanvas like ShapeEditor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <SceneCanvas
            cells={cells}
            view={view}
            visibility={visibility}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            onHoverCell={(ijk) => console.log('manual:hover', ijk)}
            onClickCell={(ijk) => { 
              setAnchor(ijk); 
              console.log('manual:anchorSet', ijk); 
            }}
            anchor={anchor}
            previewOffsets={currentOrientation?.ijkOffsets ?? null}
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
                <p>• Click a cell to set anchor</p>
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
