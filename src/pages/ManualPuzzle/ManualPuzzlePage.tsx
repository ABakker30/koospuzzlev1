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
import { GoldOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeFits, ijkToKey, type FitPlacement } from '../../services/FitFinder';
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

  // NEW: orientation + piece list + anchor + fits
  const [pieces, setPieces] = useState<string[]>([]);
  const [activePiece, setActivePiece] = useState<string>('K');
  const [anchor, setAnchor] = useState<IJK | null>(null);
  const [fits, setFits] = useState<FitPlacement[]>([]);
  const [fitIndex, setFitIndex] = useState<number>(0);
  
  // Board state: placed pieces
  type PlacedPiece = FitPlacement & {
    uid: string;
    placedAt: number;
  };
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  
  // Undo/Redo stacks
  type Action = 
    | { type: 'place'; piece: PlacedPiece }
    | { type: 'delete'; piece: PlacedPiece };
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  
  // Derived: current fit to preview
  const currentFit = fits.length > 0 ? fits[fitIndex] : null;

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

      // R/Shift+R: Cycle fits
      if (e.key.toLowerCase() === 'r') {
        if (!anchor || fits.length === 0) return; // require valid fits first
        
        // Cycle through fits (wrap around)
        if (e.shiftKey) {
          setFitIndex((prev) => (prev - 1 + fits.length) % fits.length);
        } else {
          setFitIndex((prev) => (prev + 1) % fits.length);
        }
        console.log('manual:fitCycle', { index: fitIndex, total: fits.length });
        e.preventDefault();
      }

      // Enter: Confirm placement
      if (e.key === 'Enter') {
        if (currentFit) {
          handleConfirmFit();
          e.preventDefault();
        }
      }

      // Esc: Cancel preview
      if (e.key === 'Escape') {
        if (anchor) {
          handleCancelPreview();
          e.preventDefault();
        }
      }

      // Delete: Remove selected piece
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedUid) {
          handleDeleteSelected();
          e.preventDefault();
        }
      }

      // Ctrl+Z / Cmd+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        handleUndo();
        e.preventDefault();
      }

      // Ctrl+Shift+Z / Ctrl+Y / Cmd+Shift+Z: Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || 
          (e.ctrlKey && e.key === 'y')) {
        handleRedo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loaded, showBrowseModal, anchor, fits, fitIndex, currentFit, selectedUid, undoStack, redoStack]);

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
    setShowBrowseModal(false);
    
    // Reset board state
    setPlaced(new Map());
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
    console.log('🔄 Board reset for new shape');
    
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
    
    // Clear fits when piece changes
    setFits([]);
    setFitIndex(0);
    setAnchor(null);
  };

  // Confirm fit (place piece)
  const handleConfirmFit = () => {
    if (!currentFit) return;
    
    // Generate unique ID for this placement
    const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const placedPiece: PlacedPiece = {
      ...currentFit,
      uid,
      placedAt: Date.now(),
    };
    
    // Add to placed pieces
    setPlaced(prev => {
      const next = new Map(prev);
      next.set(uid, placedPiece);
      return next;
    });
    
    // Push to undo stack
    setUndoStack(prev => [...prev, { type: 'place', piece: placedPiece }]);
    setRedoStack([]); // Clear redo stack on new action
    
    console.log('✅ Piece placed:', {
      uid,
      pieceId: currentFit.pieceId,
      orientationId: currentFit.orientationId,
      cells: currentFit.cells,
    });
    
    // Clear preview
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  };

  // Delete selected piece
  const handleDeleteSelected = () => {
    if (!selectedUid) return;
    const piece = placed.get(selectedUid);
    if (!piece) return;
    
    // Remove from placed
    setPlaced(prev => {
      const next = new Map(prev);
      next.delete(selectedUid);
      return next;
    });
    
    // Push to undo stack
    setUndoStack(prev => [...prev, { type: 'delete', piece }]);
    setRedoStack([]); // Clear redo stack
    
    console.log('🗑️ Piece deleted:', selectedUid);
    setSelectedUid(null);
  };

  // Undo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      // Undo place = delete
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      console.log('↶ Undo place:', action.piece.uid);
    } else {
      // Undo delete = place
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(action.piece.uid, action.piece);
        return next;
      });
      console.log('↶ Undo delete:', action.piece.uid);
    }
  };

  // Redo
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      // Redo place
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(action.piece.uid, action.piece);
        return next;
      });
      console.log('↷ Redo place:', action.piece.uid);
    } else {
      // Redo delete
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      console.log('↷ Redo delete:', action.piece.uid);
    }
  };

  // Cancel preview
  const handleCancelPreview = () => {
    console.log('manual:cancelPreview');
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  };

  // Handle cell click → compute fits
  const handleCellClick = (clickedCell: IJK) => {
    setAnchor(clickedCell);
    
    // Get orientations for current piece
    const controller = orientationController.current;
    if (!controller) {
      console.warn('⚠️ Orientation controller not ready');
      return;
    }
    
    const orientations = controller.getOrientations();
    if (orientations.length === 0) {
      console.warn('⚠️ No orientations available for piece', activePiece);
      return;
    }
    
    // Build container set (all valid positions)
    const containerSet = new Set(cells.map(ijkToKey));
    
    // Occupied set (from placed pieces)
    const occupiedSet = new Set<string>();
    for (const piece of placed.values()) {
      for (const cell of piece.cells) {
        occupiedSet.add(ijkToKey(cell));
      }
    }
    
    // Compute valid fits
    const validFits = computeFits({
      containerCells: containerSet,
      occupiedCells: occupiedSet,
      anchor: clickedCell,
      pieceId: activePiece,
      orientations,
    });
    
    setFits(validFits);
    setFitIndex(0);
    
    if (validFits.length > 0) {
      console.log(`manual:fitComputed`, { pieceId: activePiece, anchor: clickedCell, count: validFits.length });
    } else {
      console.log(`manual:noFit`, { pieceId: activePiece, anchor: clickedCell });
    }
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
          <>
            <SceneCanvas
              cells={cells}
              view={view}
              visibility={visibility}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              onHoverCell={(ijk) => console.log('manual:hover', ijk)}
              onClickCell={handleCellClick}
              anchor={anchor}
              previewOffsets={currentFit?.cells ?? null}
              placedPieces={Array.from(placed.values())}
              selectedPieceUid={selectedUid}
              onSelectPiece={(uid) => setSelectedUid(uid)}
            />
            
            {/* HUD Overlay */}
            {anchor && (
              <div style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                background: 'rgba(0, 0, 0, 0.75)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'system-ui, sans-serif',
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                <div style={{ marginBottom: '6px' }}>
                  <strong>Piece:</strong> {activePiece}
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <strong>Anchor:</strong> ({anchor.i}, {anchor.j}, {anchor.k})
                </div>
                <div>
                  <strong>Fits:</strong> {fits.length > 0 ? `${fitIndex + 1}/${fits.length}` : 'No fit at this anchor'}
                </div>
                {fits.length > 0 && (
                  <div style={{ 
                    marginTop: '8px', 
                    paddingTop: '8px', 
                    borderTop: '1px solid rgba(255,255,255,0.3)',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.7)'
                  }}>
                    Press R to cycle • Enter to place • Esc to cancel
                  </div>
                )}
              </div>
            )}
          </>
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
