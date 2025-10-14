// Manual Puzzle Page - MVP with Gold Orientations + Preview Ghost
// Uses same rendering pattern as Shape Editor with orientation cycling and preview

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ManualPuzzleTopBar } from './ManualPuzzleTopBar';
import { BrowseShapesModal } from './BrowseShapesModal';
import { ViewPiecesModal } from './ViewPiecesModal';
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
  
  // Fixed container appearance settings
  const containerOpacity = 0.45; // 45%
  const containerColor = '#ffffff'; // White
  const containerRoughness = 0.35; // 65% reflectiveness (1.0 - 0.65 = 0.35 roughness)
  
  // Fixed visibility (no controls)
  const visibility: VisibilitySettings = {
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 1.0 }
  };

  // NEW: orientation + piece list + anchor + fits
  const [pieces, setPieces] = useState<string[]>([]);
  const [activePiece, setActivePiece] = useState<string>('K');
  const [anchor, setAnchor] = useState<IJK | null>(null);
  const [fits, setFits] = useState<FitPlacement[]>([]);
  const [fitIndex, setFitIndex] = useState<number>(0);
  
  // Piece availability modes
  type Mode = 'oneOfEach' | 'unlimited' | 'single';
  const [mode, setMode] = useState<Mode>('unlimited');
  const [placedCountByPieceId, setPlacedCountByPieceId] = useState<Record<string, number>>({});
  
  // Board state: placed pieces
  type PlacedPiece = FitPlacement & {
    uid: string;
    placedAt: number;
  };
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const [showViewPieces, setShowViewPieces] = useState<boolean>(false);
  const [lastViewedPiece, setLastViewedPiece] = useState<string | undefined>(undefined);
  
  // Undo/Redo stacks
  type Action = 
    | { type: 'place'; piece: PlacedPiece }
    | { type: 'delete'; piece: PlacedPiece };
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  
  // Derived: current fit to preview
  const currentFit = fits.length > 0 ? fits[fitIndex] : null;

  // Check if puzzle is complete (all container cells occupied)
  useEffect(() => {
    if (cells.length === 0) {
      setIsComplete(false);
      return;
    }
    
    // Count occupied cells from placed pieces
    const occupiedCells = new Set<string>();
    for (const piece of placed.values()) {
      for (const cell of piece.cells) {
        occupiedCells.add(`${cell.i},${cell.j},${cell.k}`);
      }
    }
    
    // Puzzle is complete when all container cells are occupied
    const complete = occupiedCells.size === cells.length;
    
    if (complete && !isComplete) {
      console.log(`🎉 Puzzle Complete! All ${cells.length} container cells occupied.`);
      setIsComplete(true);
      setShowSaveDialog(true); // Show save dialog when complete
    } else if (!complete && isComplete) {
      setIsComplete(false);
      setShowSaveDialog(false);
    }
  }, [placed, cells, isComplete]);

  // RefsFCC transformation matrix - same as ShapeEditorPage
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

  // Handlers for SceneCanvas click/tap actions
  const handleCycleOrientation = () => {
    if (!anchor || fits.length === 0) return;
    setFitIndex((prev) => (prev + 1) % fits.length);
  };

  const handlePlacePiece = () => {
    if (!currentFit) return;
    handleConfirmFit();
  };

  // Keyboard shortcuts (guard modal & typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded || showBrowseModal || showViewPieces) return;
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
  }, [loaded, showBrowseModal, showViewPieces, anchor, fits, fitIndex, currentFit, selectedUid, undoStack, redoStack]);

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


  // Confirm fit (place piece)
  const handleConfirmFit = () => {
    if (!currentFit) return;
    
    // Mark as editing to prevent camera reset
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
    
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
    
    // Update piece count
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [currentFit.pieceId]: (prev[currentFit.pieceId] ?? 0) + 1
    }));
    
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

  // Save solution to file
  const handleSaveSolution = async () => {
    if (!isComplete || placed.size === 0) return;
    
    try {
      // Build piecesUsed count
      const piecesUsed: Record<string, number> = {};
      for (const piece of placed.values()) {
        piecesUsed[piece.pieceId] = (piecesUsed[piece.pieceId] || 0) + 1;
      }
      
      // Build placements array
      const placements = Array.from(placed.values()).map(piece => ({
        piece: piece.pieceId,
        ori: 0, // We don't track orientation index in manual mode
        t: [0, 0, 0] as [number, number, number], // Translation (not used in manual mode)
        cells_ijk: piece.cells.map(c => [c.i, c.j, c.k] as [number, number, number])
      }));
      
      // Create solution JSON
      const solution = {
        version: 1,
        containerCidSha256: "manual-puzzle-" + Date.now(),
        lattice: "FCC",
        piecesUsed,
        placements,
        sid_state_sha256: "manual-" + Date.now(),
        sid_route_sha256: "manual-" + Date.now(),
        sid_state_canon_sha256: "manual-" + Date.now(),
        mode: "manual",
        solver: {
          engine: "manual",
          seed: 0,
          flags: {}
        }
      };
      
      // Convert to JSON string
      const jsonString = JSON.stringify(solution, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `manual-solution-${timestamp}.json`;
      
      // Use File System Access API
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Solution JSON',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      console.log('✅ Solution saved:', filename);
      setShowSaveDialog(false);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('❌ Failed to save solution:', err);
        alert('Failed to save solution: ' + err.message);
      }
    }
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
    
    // Update piece count
    const newCount = Math.max(0, (placedCountByPieceId[piece.pieceId] ?? 0) - 1);
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: newCount
    }));
    
    // Special rule for Single Piece: if we just removed the last instance, clear activePiece
    if (mode === 'single' && piece.pieceId === activePiece && newCount === 0) {
      setActivePiece(''); // prompt re-pick
    }
    
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
      // Decrement count
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] ?? 0) - 1)
      }));
      console.log('↶ Undo place:', action.piece.uid);
    } else {
      // Undo delete = place
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(action.piece.uid, action.piece);
        return next;
      });
      // Increment count
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] ?? 0) + 1
      }));
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
      // Increment count
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] ?? 0) + 1
      }));
      console.log('↷ Redo place:', action.piece.uid);
    } else {
      // Redo delete
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      // Decrement count
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] ?? 0) - 1)
      }));
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
        onViewPieces={() => {
          setShowViewPieces(true);
          console.log('manual:viewPiecesOpen');
        }}
        loaded={loaded}
        activePiece={activePiece}
        mode={mode}
        onModeChange={(m) => { 
          setMode(m); 
          console.log('manual:modeChanged', { mode: m }); 
        }}
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
              containerOpacity={containerOpacity}
              containerColor={containerColor}
              containerRoughness={containerRoughness}
              puzzleMode={mode}
              onCycleOrientation={handleCycleOrientation}
              onPlacePiece={handlePlacePiece}
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
                fontFamily: 'monospace',
                pointerEvents: 'none'
              }}>
                <div><strong>Piece:</strong> {activePiece}</div>
                <div><strong>Fits:</strong> {fits.length > 0 ? `${fitIndex + 1} / ${fits.length}` : '0'}</div>
                <div><strong>Mode:</strong> {
                  mode === 'oneOfEach' ? 'One-of-Each' :
                  mode === 'single' && activePiece ? `Single Piece (${activePiece})` :
                  mode === 'single' ? 'Single Piece' :
                  'Unlimited'
                }</div>
                {currentFit && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#aaa' }}>
                    {/* Show different hints for desktop vs mobile */}
                    {!('ontouchstart' in window) && (
                      <>
                        <strong>Enter</strong> or double-click to place<br/>
                        <strong>R / Shift+R</strong> or click to cycle
                      </>
                    )}
                    {('ontouchstart' in window) && (
                      <>
                        Double tap to place<br/>
                        Single tap to rotate
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Completion Notification */}
            {isComplete && showSaveDialog && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 200, 0, 0.95)',
                color: 'white',
                padding: '24px 32px',
                borderRadius: '12px',
                fontSize: '24px',
                fontWeight: 'bold',
                textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                zIndex: 1000
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                <div>Puzzle Complete!</div>
                <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '8px', marginBottom: '16px', opacity: 0.9 }}>
                  All {cells.length} container cells filled
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={handleSaveSolution}
                    style={{
                      padding: '10px 20px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      background: 'white',
                      color: '#00c800',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                  >
                    💾 Save Solution
                  </button>
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    style={{
                      padding: '10px 20px',
                      fontSize: '16px',
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: '1px solid white',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                  >
                    Later
                  </button>
                </div>
              </div>
            )}
            
            {/* Progress indicator */}
            {!isComplete && cells.length > 0 && (() => {
              // Count occupied cells
              const occupiedCells = new Set<string>();
              for (const piece of placed.values()) {
                for (const cell of piece.cells) {
                  occupiedCells.add(`${cell.i},${cell.j},${cell.k}`);
                }
              }
              return (
                <div style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  background: 'rgba(0, 0, 0, 0.75)',
                  color: 'white',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  pointerEvents: 'none'
                }}>
                  <strong>{occupiedCells.size}</strong> / {cells.length} cells filled
                </div>
              );
            })()}
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
                Click <strong>Browse</strong> to load a container and start solving
              </p>
              <div style={{ fontSize: "0.875rem", color: "#9ca3af", textAlign: 'left', display: 'inline-block' }}>
                <p>• Load a shape to begin</p>
                {!('ontouchstart' in window) ? (
                  <>
                    <p>• Click to cycle orientations (<kbd>R</kbd> / <kbd>Shift+R</kbd>)</p>
                    <p>• Double-click to place (<kbd>Enter</kbd>)</p>
                    <p>• Click a cell to set anchor</p>
                    <p>• Drag to orbit, scroll to zoom</p>
                  </>
                ) : (
                  <>
                    <p>• Single tap to cycle orientations</p>
                    <p>• Double tap to place piece</p>
                    <p>• Tap a cell to set anchor</p>
                    <p>• Drag to orbit, pinch to zoom</p>
                  </>
                )}
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

      {/* View Pieces Modal */}
      <ViewPiecesModal
        open={showViewPieces}
        onClose={() => {
          setShowViewPieces(false);
          console.log('manual:viewPiecesClose');
        }}
        onSelect={(pieceId) => {
          setActivePiece(pieceId);
          orientationController.current?.setPiece(pieceId);
          setFits([]);
          setFitIndex(0);
          setAnchor(null);
          setLastViewedPiece(pieceId);
          setShowViewPieces(false);
          console.log('manual:pieceSelected', { pieceId, source: 'viewPieces' });
        }}
        piecesAll={pieces}
        mode={mode}
        placedCountByPieceId={placedCountByPieceId}
        lastViewedPiece={lastViewedPiece}
      />
    </div>
  );
};

export default ManualPuzzlePage;
