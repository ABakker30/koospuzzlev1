// Manual Puzzle Page - MVP with Gold Orientations + Preview Ghost
// Uses same rendering pattern as Shape Editor with orientation cycling and preview

// koos.shape@1 format
interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveState } from '../../context/ActiveStateContext';
import { ManualPuzzleTopBar } from './ManualPuzzleTopBar';
import { BrowseContractShapesModal } from '../../components/BrowseContractShapesModal';
import { ViewPiecesModal } from './ViewPiecesModal';
import { InfoModal } from '../../components/InfoModal';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { ijkToXyz } from '../../lib/ijk';
import type { IJK } from '../../types/shape';
import type { VisibilitySettings } from '../../types/lattice';
import { GoldOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeFits, ijkToKey, type FitPlacement } from '../../services/FitFinder';
import { createKoosSolution } from '../../services/solutionCanonical';
import { uploadContractSolution } from '../../api/contracts';
import { supabase } from '../../lib/supabase';
import '../../styles/shape.css';

export const ManualPuzzlePage: React.FC = () => {
  const navigate = useNavigate();
  const { activeState, setActiveState } = useActiveState();
  const orientationController = useRef<GoldOrientationController | null>(null);

  // State - using ShapeEditor pattern
  const [cells, setCells] = useState<IJK[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [view, setView] = useState<ViewTransforms | null>(null);
  
  // Track shape for solution saving
  const [shapeRef, setShapeRef] = useState<string | null>(null);
  const [shapeName, setShapeName] = useState<string | null>(null);
  
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
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);
  const [menuModalPosition, setMenuModalPosition] = useState({ x: 0, y: 0 });
  const [isMenuDragging, setIsMenuDragging] = useState(false);
  const [menuDragOffset, setMenuDragOffset] = useState({ x: 0, y: 0 });
  const [lastViewedPiece, setLastViewedPiece] = useState<string | undefined>(undefined);
  
  // Undo/Redo stacks
  type Action = 
    | { type: 'place'; piece: PlacedPiece }
    | { type: 'delete'; piece: PlacedPiece };
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  
  // Drawing mode state
  const [drawingCells, setDrawingCells] = useState<IJK[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  
  // Hide placed pieces state
  const [hidePlacedPieces, setHidePlacedPieces] = useState<boolean>(false);
  
  // Solution saved modal state
  const [showSolutionSavedModal, setShowSolutionSavedModal] = useState(false);
  const [solutionStats, setSolutionStats] = useState<{
    solutionName: string;
    alreadyExists: boolean;
    totalSolutions: number;
    userStats: Array<{ username: string; count: number }>;
  } | null>(null);
  
  // Modal drag state
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  // Celebration popup state
  const [showCelebration, setShowCelebration] = useState(false);
  
  // Reveal slider state (for completed puzzle) - show pieces based on placement order
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Interaction state removed - SceneCanvas handles everything now
  
  // Derived: current fit to preview
  const currentFit = fits.length > 0 ? fits[fitIndex] : null;
  
  // Derived: filter placed pieces based on reveal slider
  const visiblePlacedPieces = React.useMemo(() => {
    if (!isComplete || revealMax === 0) {
      // Not complete or no reveal - show all placed pieces
      const result = Array.from(placed.values());
      console.log('👀 visiblePlacedPieces (all):', { count: result.length, uids: result.map(p => p.uid) });
      return result;
    }
    
    // Sort pieces by placement order (placedAt timestamp)
    const sorted = Array.from(placed.values()).sort((a, b) => a.placedAt - b.placedAt);
    
    // Return only first K pieces
    const result = sorted.slice(0, revealK);
    console.log('👀 visiblePlacedPieces (reveal):', { count: result.length, revealK, total: sorted.length });
    return result;
  }, [placed, isComplete, revealK, revealMax]);

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
      setShowCelebration(true);
      // Auto-hide celebration after 3 seconds
      setTimeout(() => setShowCelebration(false), 3000);
      
      // Set up reveal slider
      setRevealMax(placed.size);
      setRevealK(placed.size); // Show all by default
    } else if (!complete && isComplete) {
      setIsComplete(false);
      setShowSaveDialog(false);
      setRevealMax(0);
      setRevealK(0);
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

  // CONTRACT: Puzzle - Auto-load shape from activeState on mount
  useEffect(() => {
    if (!activeState || loaded) return; // Skip if no state or already loaded
    
    console.log("🧩 Manual Puzzle: ActiveState available", {
      shapeRef: activeState.shapeRef.substring(0, 24) + '...',
      placements: activeState.placements.length
    });
    
    // Fetch and load shape automatically
    const autoLoadShape = async () => {
      try {
        console.log("🔄 Manual Puzzle: Auto-loading shape from activeState...");
        
        // Import the API to fetch shape
        const { supabase } = await import('../../lib/supabase');
        
        // Get signed URL for shape
        const { data: urlData, error: urlError } = await supabase.storage
          .from('shapes')
          .createSignedUrl(`${activeState.shapeRef}.shape.json`, 300);
        
        if (urlError) throw urlError;
        
        // Fetch shape
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('Failed to fetch shape');
        
        const shape = await response.json() as KoosShape;
        
        // Validate format
        if (shape.schema !== 'koos.shape' || shape.version !== 1) {
          throw new Error('Invalid shape format');
        }
        
        console.log("✅ Manual Puzzle: Auto-loaded shape from activeState");
        
        // Load the shape
        handleShapeLoaded(shape);
        
        // TODO: Restore placements from activeState if any
        // This would require converting activeState.placements back to placed pieces
        
      } catch (error) {
        console.error("❌ Manual Puzzle: Failed to auto-load shape:", error);
        // Don't show error to user - they can still browse manually
      }
    };
    
    autoLoadShape();
  }, [activeState, loaded]); // Re-run if activeState changes

  // Helper: Delete a piece
  const deletePiece = (uid: string) => {
    const piece = placed.get(uid);
    if (!piece) return;
    
    console.log('🗑️ DELETE PIECE CALLED:', { uid, pieceId: piece.pieceId, stack: new Error().stack });
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1)
    }));
    setSelectedUid(null);
  };

  // Helper: Clear ghost piece
  const clearGhost = () => {
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  };

  // Helper: Save state and navigate home
  const handleHomeClick = () => {
    // Save current state if shape is loaded (with or without pieces)
    if (shapeRef) {
      const placements = Array.from(placed.values()).map(piece => {
        // Get orientation index from orientationId (format: "K-00", "K-01", etc.)
        const orientationIndex = parseInt(piece.orientationId.split('-')[1], 10);
        
        // Use the first cell as anchor
        const anchorCell = piece.cells[0];
        
        return {
          pieceId: piece.pieceId,
          anchorIJK: [anchorCell.i, anchorCell.j, anchorCell.k] as [number, number, number],
          orientationIndex
        };
      });
      
      setActiveState({
        schema: 'koos.state',
        version: 1,
        shapeRef: shapeRef,
        placements
      });
      
      console.log('💾 Saved puzzle state:', { shapeRef, placements: placements.length });
    }
    
    // Navigate home
    window.location.href = '/';
  };

  // No longer needed - using behavior table instead

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

  // Handle shape loaded (koos.shape@1 only)
  const handleShapeLoaded = async (shape: KoosShape) => {
    console.log(`manual:shapeLoaded`, { 
      id: shape.id, 
      cells: shape.cells.length 
    });

    // Convert to IJK format
    const newCells: IJK[] = shape.cells.map(([i,j,k]) => ({ i, j, k }));
    setCells(newCells);
    setLoaded(true);
    setShowBrowseModal(false);
    
    // Store shape name and ref (already content-addressed)
    setShapeName(`Shape_${shape.cells.length}cells`);
    setShapeRef(shape.id);
    console.log(`✅ ShapeRef: ${shape.id.substring(0, 24)}...`);
    
    // Reset board state
    setPlaced(new Map());
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
    setSelectedUid(null);
    setUndoStack([]);
    setRedoStack([]);
    setPlacedCountByPieceId({});
    setDrawingCells([]);
    setNotification(null);
    setIsComplete(false);
    setShowSaveDialog(false);
    console.log('🔄 Board reset for new shape');
    
    // Reset camera initialization flag so SceneCanvas re-positions camera for new shape
    if ((window as any).resetCameraFlag) {
      (window as any).resetCameraFlag();
      console.log('📷 Manual Puzzle: Camera reset flag called');
    }
    
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
    
    // Check mode constraints
    const currentCount = placedCountByPieceId[currentFit.pieceId] ?? 0;
    
    if (mode === 'oneOfEach' && currentCount >= 1) {
      console.warn('⚠️ Cannot place: One-of-Each mode - piece already placed');
      alert(`One-of-Each mode: "${currentFit.pieceId}" is already placed. Delete it first to place another orientation.`);
      return;
    }
    
    if (mode === 'single' && currentFit.pieceId !== activePiece) {
      console.warn('⚠️ Cannot place: Single Piece mode - wrong piece');
      alert(`Single Piece mode: Can only place "${activePiece}"`);
      return;
    }
    
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
      mode,
      count: currentCount + 1,
    });
    
    // Clear preview
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  };

  // Auto-save solution with stats (like AutoSolver)
  const autoSaveSolution = async () => {
    if (!isComplete || placed.size === 0 || !shapeRef || !shapeName) {
      console.error('❌ Cannot auto-save: missing required data');
      return;
    }
    
    try {
      console.log('💾 Auto-saving manual solution...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const username = user?.email || 'Unknown User';
      
      // Convert placed pieces to koos.state@1 placements
      const placements = Array.from(placed.values()).map(piece => {
        const oriMatch = piece.orientationId.match(/ori_(\d+)/);
        const orientationIndex = oriMatch ? parseInt(oriMatch[1], 10) : 0;
        
        const cellArray = piece.cells;
        const minI = Math.min(...cellArray.map(c => c.i));
        const minJ = Math.min(...cellArray.map(c => c.j));
        const minK = Math.min(...cellArray.map(c => c.k));
        
        return {
          pieceId: piece.pieceId.toUpperCase(),
          anchorIJK: [minI, minJ, minK] as [number, number, number],
          orientationIndex
        };
      });
      
      // Create koos.state@1 solution with computed ID
      const koosSolution = await createKoosSolution(shapeRef, placements);
      
      // Check if solution already exists
      const { data: existingCheck } = await supabase
        .from('contracts_solutions')
        .select('id')
        .eq('id', koosSolution.id)
        .maybeSingle();
      
      let alreadyExists = false;
      let solutionName = '';
      
      if (existingCheck) {
        console.log('ℹ️ Solution already exists in database');
        alreadyExists = true;
        solutionName = 'Duplicate Solution';
      } else {
        // Query all solutions for this shape
        const { data: allSolutions } = await supabase
          .from('contracts_solutions')
          .select('id, metadata')
          .eq('shape_id', shapeRef);
        
        // Count solutions
        const solutionCount = (allSolutions || []).length + 1;
        solutionName = `${shapeName} Solution ${solutionCount}`;
        
        // Upload with metadata
        await uploadContractSolution({
          id: koosSolution.id,
          shapeRef: koosSolution.shapeRef,
          placements: koosSolution.placements,
          isFull: true,
          name: solutionName,
          metadata: {
            username,
            foundAt: new Date().toISOString(),
            shapeName,
            source: 'manual'
          }
        });
        
        console.log(`✅ Solution saved: "${solutionName}" by ${username}`);
        
        // Update activeState
        setActiveState({
          schema: 'koos.state',
          version: 1,
          shapeRef: koosSolution.shapeRef,
          placements: koosSolution.placements
        });
      }
      
      // Query stats for this shape grouped by user
      const { data: shapeSolutions } = await supabase
        .from('contracts_solutions')
        .select('metadata')
        .eq('shape_id', shapeRef);
      
      // Group by username
      const userCounts = new Map<string, number>();
      (shapeSolutions || []).forEach(sol => {
        const user = sol.metadata?.username || 'Unknown User';
        userCounts.set(user, (userCounts.get(user) || 0) + 1);
      });
      
      const userStats = Array.from(userCounts.entries())
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count);
      
      // Show stats modal
      setSolutionStats({
        solutionName,
        alreadyExists,
        totalSolutions: (shapeSolutions || []).length,
        userStats
      });
      setShowSolutionSavedModal(true);
      setShowSaveDialog(false);
      
    } catch (err: any) {
      console.error('❌ Failed to auto-save solution:', err);
      alert('Failed to save solution: ' + err.message);
    }
  };
  
  // Legacy save function (kept for manual save button if needed)
  const handleSaveSolution = async () => {
    autoSaveSolution();
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
    
    // Check mode constraints before undoing a delete (which re-places a piece)
    if (action.type === 'delete') {
      const currentCount = placedCountByPieceId[action.piece.pieceId] ?? 0;
      if (mode === 'oneOfEach' && currentCount >= 1) {
        console.warn('⚠️ Cannot undo: One-of-Each mode - piece already placed');
        alert(`One-of-Each mode: Cannot undo delete - "${action.piece.pieceId}" is already placed.`);
        return;
      }
    }
    
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      // Undo place: remove the piece
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
      // Undo delete: restore the piece
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
    
    // Check mode constraints before redoing a place
    if (action.type === 'place') {
      const currentCount = placedCountByPieceId[action.piece.pieceId] ?? 0;
      if (mode === 'oneOfEach' && currentCount >= 1) {
        console.warn('⚠️ Cannot redo: One-of-Each mode - piece already placed');
        alert(`One-of-Each mode: Cannot redo place - "${action.piece.pieceId}" is already placed.`);
        return;
      }
    }
    
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

  // Check if two cells are FCC-adjacent (connected in the puzzle)
  const areFCCAdjacent = (cell1: IJK, cell2: IJK): boolean => {
    const di = Math.abs(cell1.i - cell2.i);
    const dj = Math.abs(cell1.j - cell2.j);
    const dk = Math.abs(cell1.k - cell2.k);
    
    // FCC lattice: cells are adjacent if 1 OR 2 coordinates differ by exactly 1
    // This includes both cube-edge neighbors (1 coord) and face-diagonal neighbors (2 coords)
    const diffs = [di, dj, dk].filter(d => d === 1);
    const totalDiff = di + dj + dk;
    
    // Adjacent if: (1 or 2 coords differ by 1) AND (no coord differs by more than 1)
    const isAdjacent = (diffs.length === 1 || diffs.length === 2) && totalDiff === diffs.length;
    
    console.log(`🔍 FCC Adjacency Check:`, {
      cell1: `(${cell1.i}, ${cell1.j}, ${cell1.k})`,
      cell2: `(${cell2.i}, ${cell2.j}, ${cell2.k})`,
      deltas: { di, dj, dk },
      diffsOf1: diffs.length,
      totalDiff,
      isAdjacent
    });
    
    return isAdjacent;
  };

  // Show brief notification
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 2000); // 2 seconds
  };

  // Handle drawing a cell (double-click/long-press)
  const handleDrawCell = (cell: IJK) => {
    console.log('🎨 handleDrawCell called:', {
      cell: `(${cell.i}, ${cell.j}, ${cell.k})`,
      currentDrawing: drawingCells.map(c => `(${c.i}, ${c.j}, ${c.k})`),
      drawingCount: drawingCells.length
    });
    
    // If this is the first cell in drawing mode, clear any ghost piece
    if (drawingCells.length === 0) {
      console.log('🎨 Starting drawing mode - clearing ghost piece');
      setAnchor(null);
      setFits([]);
      setFitIndex(0);
    }
    
    // Check if cell is occupied
    const cellKey = ijkToKey(cell);
    const occupiedSet = new Set<string>();
    for (const piece of placed.values()) {
      for (const c of piece.cells) {
        occupiedSet.add(ijkToKey(c));
      }
    }
    
    // Check if already in drawing
    if (drawingCells.some(c => ijkToKey(c) === cellKey)) {
      console.log('🎨 ❌ Cell already in drawing');
      return;
    }
    
    // If not first cell, check FCC adjacency
    if (drawingCells.length > 0) {
      console.log('🎨 Checking adjacency against existing cells...');
      const isAdjacent = drawingCells.some(c => areFCCAdjacent(c, cell));
      if (!isAdjacent) {
        console.log('🎨 ❌ Cell not FCC-adjacent to any drawn cell');
        return;
      }
      console.log('🎨 ✅ Cell is adjacent!');
    }
    
    const newDrawing = [...drawingCells, cell];
    console.log(`🎨 ✅ Drawing cell ${newDrawing.length}/4:`, cell);
    setDrawingCells(newDrawing);
    
    // If 4 cells drawn, identify and place piece
    if (newDrawing.length === 4) {
      identifyAndPlacePiece(newDrawing);
    }
  };

  // Identify piece from drawn cells and place it
  const identifyAndPlacePiece = async (drawnCells: IJK[]) => {
    // Create service instance and load data
    const svc = new GoldOrientationService();
    try {
      await svc.load();
    } catch (err) {
      console.error('🎨 Failed to load orientations:', err);
      setDrawingCells([]);
      return;
    }
    
    // Try to match drawn shape against all pieces and orientations
    let bestMatch: { pieceId: string; orientationId: string; cells: IJK[] } | null = null;
    
    for (const pieceId of pieces) {
      // Get orientations from the service
      const orientations = svc.getOrientations(pieceId);
      if (!orientations || orientations.length === 0) continue;
      
      for (let oriIdx = 0; oriIdx < orientations.length; oriIdx++) {
        const ori = orientations[oriIdx];
        
        // Try to match by checking if drawn cells match this orientation's relative positions
        // Normalize both shapes to origin (subtract minimum coordinates)
        const normalizedDrawn = normalizeCells(drawnCells);
        const normalizedOri = normalizeCells(ori.ijkOffsets);
        
        if (cellsMatch(normalizedDrawn, normalizedOri)) {
          bestMatch = {
            pieceId,
            orientationId: ori.orientationId,
            cells: drawnCells
          };
          break;
        }
      }
      if (bestMatch) break;
    }
    
    if (!bestMatch) {
      console.error('🎨 Could not identify drawn piece (should not happen!)');
      setDrawingCells([]);
      return;
    }
    
    // Check mode constraints
    const currentCount = placedCountByPieceId[bestMatch.pieceId] ?? 0;
    if (mode === 'oneOfEach' && currentCount >= 1) {
      alert(`One-of-Each mode: \"${bestMatch.pieceId}\" is already placed.`);
      setDrawingCells([]);
      return;
    }
    if (mode === 'single' && bestMatch.pieceId !== activePiece) {
      alert(`Single Piece mode: Can only place \"${activePiece}\"`);
      setDrawingCells([]);
      return;
    }
    
    // Place the piece
    const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const placedPiece: PlacedPiece = {
      pieceId: bestMatch.pieceId,
      orientationId: bestMatch.orientationId,
      anchorSphereIndex: 0, // Default for drawn pieces
      cells: bestMatch.cells,
      uid,
      placedAt: Date.now(),
    };
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.set(uid, placedPiece);
      return next;
    });
    
    setUndoStack(prev => [...prev, { type: 'place', piece: placedPiece }]);
    setRedoStack([]);
    
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [bestMatch!.pieceId]: (prev[bestMatch!.pieceId] ?? 0) + 1
    }));
    
    // Ensure nothing is selected after placing drawn piece
    setSelectedUid(null);
    
    console.log(`✅ Drawn piece placed: ${bestMatch.pieceId}`, { uid, cells: bestMatch.cells });
    showNotification(`Piece ${bestMatch.pieceId} added!`);
    console.log('🎨 Clearing drawing cells after placement');
    setDrawingCells([]);
  };

  // Normalize cells to origin (subtract minimum coordinates)
  const normalizeCells = (cells: IJK[]): IJK[] => {
    const minI = Math.min(...cells.map(c => c.i));
    const minJ = Math.min(...cells.map(c => c.j));
    const minK = Math.min(...cells.map(c => c.k));
    return cells.map(c => ({ i: c.i - minI, j: c.j - minJ, k: c.k - minK }));
  };

  // Check if two normalized cell sets match
  const cellsMatch = (cells1: IJK[], cells2: IJK[]): boolean => {
    if (cells1.length !== cells2.length) return false;
    const set1 = new Set(cells1.map(ijkToKey));
    const set2 = new Set(cells2.map(ijkToKey));
    for (const key of set1) {
      if (!set2.has(key)) return false;
    }
    return true;
  };

  // Handle cell click → compute fits OR add to drawing
  const handleCellClick = (clickedCell: IJK, isDrawAction = false) => {
    console.log('📍 handleCellClick:', { isDrawAction, drawingCellsCount: drawingCells.length, cell: clickedCell });
    
    // If drawing mode and this is a draw action
    if (isDrawAction && drawingCells.length < 4) {
      console.log('🎨 Calling handleDrawCell');
      handleDrawCell(clickedCell);
      return;
    }
    
    // Single click while drawing = cancel
    if (drawingCells.length > 0 && !isDrawAction) {
      console.log('🎨 Drawing cancelled by single click');
      setDrawingCells([]);
      return;
    }
    
    // Check if cell is occupied
    const clickedKey = ijkToKey(clickedCell);
    const occupiedSet = new Set<string>();
    for (const piece of placed.values()) {
      for (const cell of piece.cells) {
        occupiedSet.add(ijkToKey(cell));
      }
    }
    
    if (occupiedSet.has(clickedKey)) {
      // Clicked occupied cell: deselect piece, clear ghost
      setSelectedUid(null);
      clearGhost();
      return;
    }
    
    // Clicked empty cell: deselect piece, place/move ghost anchor
    setSelectedUid(null);
    setAnchor(clickedCell);
    
    // Get orientations for current piece
    const controller = orientationController.current;
    if (!controller) {
      clearGhost();
      return;
    }
    
    const orientations = controller.getOrientations();
    if (orientations.length === 0) {
      clearGhost();
      return;
    }
    
    // Build container set (all valid positions)
    const containerSet = new Set(cells.map(ijkToKey));
    
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
  };

  // NEW: Behavior table - clean mapping of (target, type) → action
  const handleInteraction = (
    target: 'ghost' | 'cell' | 'piece' | 'background',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => {
    console.log('🎯 Interaction:', target, type, data);

    // GHOST interactions
    if (target === 'ghost') {
      if (type === 'single') {
        // Rotate ghost
        if (anchor && fits.length > 0) {
          setFitIndex((prev) => (prev + 1) % fits.length);
        }
      } else if (type === 'double' || type === 'long') {
        // Place piece
        if (currentFit) {
          handleConfirmFit();
          // Clear selection after placement to avoid leaving piece selected
          setSelectedUid(null);
        }
      }
      return;
    }

    // CELL interactions
    if (target === 'cell') {
      const clickedCell = data as IJK;
      
      if (type === 'single') {
        // Single-click: move ghost or place new ghost
        handleCellClick(clickedCell);
      } else if (type === 'double') {
        // Double-click on cell = draw mode (clear ghost first if active)
        if (anchor) {
          console.log('🎨 Clearing ghost before starting draw mode');
          clearGhost();
        }
        handleCellClick(clickedCell, true);
      }
      return;
    }

    // PIECE interactions
    if (target === 'piece') {
      const uid = data as string;
      
      if (type === 'single') {
        // If ghost active, clear it (one action only)
        if (anchor) {
          clearGhost();
          return;
        }
        // Toggle selection
        setSelectedUid(uid === selectedUid ? null : uid);
      } else if (type === 'double' || type === 'long') {
        // Delete if selected
        if (uid === selectedUid) {
          deletePiece(uid);
        }
      }
      return;
    }

    // BACKGROUND interactions
    if (target === 'background') {
      if (type === 'single') {
        // Clear ghost and deselect
        clearGhost();
        setSelectedUid(null);
      }
      return;
    }
  };

  return (
    <div className="content-studio-page" style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      {/* Top Bar */}
      <ManualPuzzleTopBar
        onHomeClick={handleHomeClick}
        onBackToShape={() => navigate('/shape')}
        onViewPieces={() => {
          setShowViewPieces(true);
          console.log('manual:viewPiecesOpen');
        }}
        onInfoClick={() => setShowInfo(true)}
        onUndo={() => {
          if (undoStack.length > 0) {
            const action = undoStack[undoStack.length - 1];
            setUndoStack(prev => prev.slice(0, -1));
            setRedoStack(prev => [...prev, action]);
            if (action.type === 'place') {
              deletePiece(action.piece.uid);
            } else if (action.type === 'delete') {
              // Restore deleted piece
              setPlaced(prev => new Map(prev).set(action.piece.uid, action.piece));
              setPlacedCountByPieceId(prev => ({
                ...prev,
                [action.piece.pieceId]: (prev[action.piece.pieceId] || 0) + 1
              }));
            }
          }
        }}
        loaded={loaded}
        isComplete={isComplete}
        activePiece={activePiece}
        mode={mode}
        onModeChange={(m) => { 
          setMode(m); 
          console.log('manual:modeChanged', { mode: m }); 
        }}
        hidePlacedPieces={hidePlacedPieces}
        onHidePlacedPiecesChange={setHidePlacedPieces}
        canUndo={undoStack.length > 0}
      />

      {/* Main Viewport - use SceneCanvas like ShapeEditor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <SceneCanvas
              cells={cells}
              view={view}
              visibility={visibility}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              onHoverCell={(ijk) => console.log('manual:hover', ijk)}
              onClickCell={undefined}
              anchor={anchor}
              previewOffsets={currentFit?.cells ?? null}
              placedPieces={visiblePlacedPieces}
              selectedPieceUid={selectedUid}
              onSelectPiece={(uid) => setSelectedUid(uid)}
              containerOpacity={containerOpacity}
              containerColor={containerColor}
              containerRoughness={containerRoughness}
              puzzleMode={mode}
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={undefined}
              drawingCells={drawingCells}
              onDrawCell={undefined}
              hidePlacedPieces={hidePlacedPieces}
              onInteraction={handleInteraction}
            />
            
            {/* HUD Chip - Single clean progress indicator */}
            {loaded && cells.length > 0 && (
              <div className="hud-chip">
                Pieces placed: {placed.size} / {Math.floor(cells.length / 4)}
              </div>
            )}
            
            {/* Notification */}
            {notification && (
              <div style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 150, 0, 0.9)',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 1000
              }}>
                {notification}
              </div>
            )}
            
            {/* Drawing Mode Indicator */}
            {drawingCells.length > 0 && (
              <div style={{
                position: 'absolute',
                top: 70,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255, 200, 0, 0.9)',
                color: '#000',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 1000
              }}>
                🎨 Drawing {drawingCells.length}/4 cells - Single click to cancel
              </div>
            )}
            
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
      </div>

      {/* Browse Shapes Modal */}
      <BrowseContractShapesModal
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

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Manual Puzzle - User Guide"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
          {/* Overview */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>🧩 How to Play</h3>
            <p style={{ margin: 0, lineHeight: '1.5' }}>
              Build 3D puzzles by placing pieces into the container shape. Click on empty container cells to see where pieces fit, cycle through orientations, and place them with Enter.
            </p>
          </div>

          {/* Top Bar Controls */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>🎛️ Top Bar Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ margin: 0 }}>• <strong>Mode Dropdown</strong> – Choose puzzle difficulty:</p>
              <p style={{ margin: '0 0 0 1.5rem', fontSize: '0.9rem', color: '#666' }}>
                <strong>Unlimited:</strong> Use each piece multiple times<br/>
                <strong>One of each:</strong> Use each piece only once (realistic)<br/>
                <strong>Single piece:</strong> Only place one type of piece
              </p>
              <p style={{ margin: 0 }}>• <strong>Select Piece ({activePiece})</strong> – Choose which piece to place (shortcut: K)</p>
              <p style={{ margin: 0 }}>• <strong>Hide Placed</strong> – Toggle to see inner container cells</p>
              <p style={{ margin: 0 }}>• <strong>Undo</strong> – Remove last placed piece (Ctrl+Z)</p>
              <p style={{ margin: 0 }}>• <strong>Back to Shape</strong> – Return to load different shapes</p>
            </div>
          </div>

          {/* Placing Pieces */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>🎯 Placing Pieces (Standard Mode)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ margin: 0 }}><strong>1.</strong> Click on an empty container cell (green preview appears)</p>
              <p style={{ margin: 0 }}><strong>2.</strong> Press <strong>R</strong> to cycle through orientations (Shift+R to reverse)</p>
              <p style={{ margin: 0 }}><strong>3.</strong> Press <strong>Enter</strong> to place the piece (or double-click)</p>
              <p style={{ margin: 0 }}><strong>4.</strong> Click on a placed piece to select it (press Delete to remove)</p>
            </div>
          </div>

          {/* Draw Mode */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>🎨 Draw Mode</h3>
            <p style={{ margin: '0 0 0.5rem 0', lineHeight: '1.5' }}>
              Create custom piece placements by drawing directly on the container:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ margin: 0 }}><strong>1.</strong> Double-click on an empty cell to start drawing</p>
              <p style={{ margin: 0 }}><strong>2.</strong> Double-click adjacent cells to add them (up to 4 cells total)</p>
              <p style={{ margin: 0 }}><strong>3.</strong> After 4 cells, the system auto-detects the piece type and places it</p>
              <p style={{ margin: 0 }}><strong>4.</strong> Single-click anywhere to cancel drawing mode</p>
            </div>
            <div style={{ 
              marginTop: '0.5rem',
              padding: '0.5rem',
              background: '#fff3cd',
              borderLeft: '3px solid #ffc107',
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#856404'
            }}>
              💡 Cells must be FCC-adjacent (touching faces or edges in the lattice)
            </div>
          </div>

          {/* Managing Placed Pieces */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>✂️ Managing Placed Pieces</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ margin: 0 }}><strong>Select:</strong> Single-click on a placed piece (highlights in blue)</p>
              <p style={{ margin: 0 }}><strong>Deselect:</strong> Click the same piece again, click background, or press Esc</p>
              <p style={{ margin: 0 }}><strong>Delete:</strong> Select the piece, then press Delete key or double-click it</p>
              <p style={{ margin: 0 }}><strong>Undo:</strong> Use the Undo button or Ctrl+Z to remove the last placed piece</p>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#2196F3' }}>⌨️ Keyboard Shortcuts</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.3rem 1rem', fontSize: '0.9rem' }}>
              <strong>K</strong><span>Open piece selector</span>
              <strong>R</strong><span>Cycle orientation (Shift+R: reverse)</span>
              <strong>Enter</strong><span>Place piece at current anchor</span>
              <strong>Delete</strong><span>Remove selected piece</span>
              <strong>Esc</strong><span>Clear selection/anchor</span>
              <strong>Ctrl+Z</strong><span>Undo last action</span>
              <strong>Ctrl+Shift+Z</strong><span>Redo (or Ctrl+Y)</span>
            </div>
          </div>

          {/* Auto-Save */}
          <div style={{ 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.9rem'
          }}>
            <p style={{ margin: 0 }}>✅ <strong>Complete solutions save automatically!</strong></p>
            <p style={{ margin: '0.5rem 0 0 0', color: '#1e40af' }}>
              When all container cells are filled, your solution is saved to the database. View and visualize it in Content Studio.
            </p>
          </div>
        </div>
      </InfoModal>

      {/* Celebration Popup */}
      {showCelebration && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 3000,
          animation: 'bounce 0.5s ease-out',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            padding: '2rem 3rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            textAlign: 'center',
            color: '#fff'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
              🎉🎊✨
            </div>
            <h2 style={{ 
              margin: '0 0 0.5rem 0', 
              fontSize: '2.5rem',
              fontWeight: 'bold',
              textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
            }}>
              Puzzle Solved!
            </h2>
            <p style={{ 
              margin: 0, 
              fontSize: '1.25rem',
              opacity: 0.95
            }}>
              Amazing work! 🌟
            </p>
          </div>
        </div>
      )}

      {/* Solution Saved Stats Modal */}
      {showSolutionSavedModal && solutionStats && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            pointerEvents: isDragging ? 'none' : 'auto'
          }}
        >
          <div 
            style={{
              position: modalPosition ? 'fixed' : 'relative',
              left: modalPosition?.x || 'auto',
              top: modalPosition?.y || 'auto',
              transform: modalPosition ? 'none' : 'none',
              background: '#fff',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              pointerEvents: 'auto'
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                setIsDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                setDragStart({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && dragStart) {
                setModalPosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', cursor: 'default' }}>
              <h2 style={{ margin: 0, fontSize: '1.75rem' }}>
                {solutionStats.alreadyExists ? '⚠️ Duplicate Solution' : '✅ Solution Saved!'}
              </h2>
              <button
                onClick={() => setShowSolutionSavedModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {!solutionStats.alreadyExists && (
              <p style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#2196F3' }}>
                {solutionStats.solutionName}
              </p>
            )}

            {solutionStats.alreadyExists && (
              <p style={{ margin: '0 0 1.5rem 0', color: '#ff9800' }}>
                This solution already exists in the database.
              </p>
            )}

            <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>
                📊 Solutions for {shapeName}
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                Total: {solutionStats.totalSolutions}
              </p>
              
              <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: '0.95rem' }}>By User:</p>
                {solutionStats.userStats.map((stat, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    background: '#fff',
                    marginBottom: '0.25rem',
                    borderRadius: '4px'
                  }}>
                    <span>{stat.username}</span>
                    <span style={{ fontWeight: 'bold', color: '#2196F3' }}>{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="btn"
              onClick={() => setShowSolutionSavedModal(false)}
              style={{
                width: '100%',
                background: '#2196F3',
                color: '#fff',
                padding: '0.75rem',
                fontSize: '1rem'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Menu Modal */}
      {showMenuModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onMouseMove={(e) => {
            if (isMenuDragging) {
              setMenuModalPosition({
                x: e.clientX - menuDragOffset.x,
                y: e.clientY - menuDragOffset.y
              });
            }
          }}
          onMouseUp={() => setIsMenuDragging(false)}
        >
          <div 
            style={{
              position: menuModalPosition.x === 0 && menuModalPosition.y === 0 ? 'relative' : 'fixed',
              left: menuModalPosition.x === 0 && menuModalPosition.y === 0 ? 'auto' : `${menuModalPosition.x}px`,
              top: menuModalPosition.y === 0 && menuModalPosition.y === 0 ? 'auto' : `${menuModalPosition.y}px`,
              background: '#fff',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: isMenuDragging ? 'grabbing' : 'default',
              pointerEvents: 'auto'
            }}
          >
            {/* Draggable Header */}
            <div 
              style={{
                padding: '1rem 2rem',
                cursor: 'grab',
                userSelect: 'none',
                borderBottom: '1px solid #dee2e6',
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={(e) => {
                setIsMenuDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setMenuDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '2rem' }}>☰</div>
            </div>
            
            <div style={{ padding: '1rem 2rem 2rem 2rem' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>Menu</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/shape');
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🧩</span>
                <span>Shape Selector</span>
              </button>
              
              {isComplete && (
                <button
                  className="btn"
                  onClick={() => {
                    setShowMenuModal(false);
                    navigate('/studio');
                  }}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: '#9c27b0',
                    color: '#fff',
                    border: 'none',
                    justifyContent: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>🎥</span>
                  <span>Content Studio</span>
                </button>
              )}

              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowInfo(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>💡</span>
                <span>Help & Information</span>
              </button>

              <button
                className="btn"
                onClick={() => setShowMenuModal(false)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  background: 'transparent',
                  color: '#6c757d',
                  border: '1px solid #dee2e6'
                }}
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualPuzzlePage;
