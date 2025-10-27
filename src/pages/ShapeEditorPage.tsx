import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { IJK } from "../types/shape";
import { ijkToXyz } from "../lib/ijk";
import { ShapeBrowserIntegration } from "../components/ShapeBrowserIntegration";
import ShapeEditorCanvas from "../components/ShapeEditorCanvas";
import { computeViewTransforms, type ViewTransforms } from "../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../lib/quickhull-adapter";
import { uploadContractShape, contractShapeExists } from "../api/contracts";
import { createKoosShape } from "../services/shapeFormatReader";
import { useActiveState } from "../context/ActiveStateContext";
import { InfoModal } from "../components/InfoModal";
import "../styles/shape.css";

// koos.shape@1 format
interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}

// localStorage keys for state persistence
const STORAGE_KEYS = {
  lastState: 'shape.lastState',
  lastEditMode: 'shape.lastEditMode',
  lastShapeRef: 'shape.lastShapeRef',
  headerScrollX: 'shape.headerScrollX'
};

function ShapeEditorPage() {
  const navigate = useNavigate();
  const { setActiveState } = useActiveState();
  const [cells, setCells] = useState<IJK[]>([]);
  
  // Ref to always have latest cells value (prevents stale closure)
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  const [loaded, setLoaded] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [view, setView] = useState<ViewTransforms | null>(null);

  // Undo history and unsaved state tracking
  const [history, setHistory] = useState<IJK[][]>([]);
  const [currentShapeId, setCurrentShapeId] = useState<string | null>(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  // UI modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedShapeInfo, setSavedShapeInfo] = useState<{ name: string; id: string; cells: number } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showGuardSheet, setShowGuardSheet] = useState(false);
  const [pendingLoadAction, setPendingLoadAction] = useState(false);

  // Refs for header scroll restoration
  const pillbarRef = useRef<HTMLDivElement>(null);

  // Preview handler for carousel browser (temporary render)
  const handlePreviewShape = async (shape: KoosShape) => {
    // Clear old geometry first
    setLoaded(false);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log("👁️ Preview shape:", shape.id.substring(0, 24), "...", shape.cells.length, "cells");
    const newCells = shape.cells.map(([i,j,k]) => ({ i, j, k }));
    setCells(newCells);
    
    // Apply view transforms if computed
    if ((shape as any).viewTransforms) {
      setView((shape as any).viewTransforms);
      console.log("✅ Applied orientation for preview");
    }
    
    // Re-enable rendering
    setLoaded(true);
  };

  // Full load handler when user confirms selection
  const onLoaded = (shape: KoosShape, shapeName?: string) => {
    console.log("📥 Loaded koos.shape@1:", shape.id.substring(0, 24), "...");
    const newCells = shape.cells.map(([i,j,k]) => ({ i, j, k }));
    console.log("📊 Converted cells:", newCells.length, "cells");
    
    // CONTRACT: Shape - On open, set activeState with empty placements
    setActiveState({
      schema: 'koos.state',
      version: 1,
      shapeRef: shape.id,
      placements: []
    });
    console.log("✅ Shape Editor: ActiveState set with shapeRef");
    
    // Mark as saved since we just loaded it from storage
    setSavedShapeInfo({ name: shapeName || shape.id, id: shape.id, cells: newCells.length });
    setCurrentShapeId(shape.id);
    setHasUnsavedEdits(false);
    
    // Reset undo history for new shape
    setHistory([]);
    
    // Save to localStorage as last opened shape
    try {
      localStorage.setItem('lastOpenedShape', JSON.stringify({
        id: shape.id,
        lattice: shape.lattice,
        cells: shape.cells,
        timestamp: Date.now()
      }));
      localStorage.setItem(STORAGE_KEYS.lastShapeRef, shape.id);
      localStorage.setItem(STORAGE_KEYS.lastState, 'view');
      console.log("💾 Saved last opened shape to localStorage");
    } catch (error) {
      console.error("❌ Failed to save to localStorage:", error);
    }
    
    // Reset camera initialization flag for new file load
    if ((window as any).resetCameraFlag) {
      (window as any).resetCameraFlag();
    }
    
    setCells(newCells);
    // Shape name handled by file object
    setLoaded(true);
    setEdit(false); // Default Edit checkbox to off
    setShowLoad(false);
    setShowGuardSheet(false);
    setPendingLoadAction(false);

    // Compute view transforms synchronously so the first draw is oriented
    // Create a simple FCC transform matrix
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],    // FCC basis vector 1: (0.5, 0.5, 0)
      [0.5, 0, 0.5, 0],    // FCC basis vector 2: (0.5, 0, 0.5)  
      [0, 0.5, 0.5, 0],    // FCC basis vector 3: (0, 0.5, 0.5)
      [0, 0, 0, 1]         // Homogeneous coordinate
    ];

    console.log("🔄 Computing view transforms...");
    try {
      const v = computeViewTransforms(newCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log("🎯 View transforms computed successfully:", v);
      
      // Set OrbitControls target to the center of the new shape
      setTimeout(() => {
        if ((window as any).setOrbitTarget && v) {
          // Calculate shape center in world coordinates
          const M = [
            [v.M_world[0][0], v.M_world[0][1], v.M_world[0][2], v.M_world[0][3]],
            [v.M_world[1][0], v.M_world[1][1], v.M_world[1][2], v.M_world[1][3]],
            [v.M_world[2][0], v.M_world[2][1], v.M_world[2][2], v.M_world[2][3]],
            [v.M_world[3][0], v.M_world[3][1], v.M_world[3][2], v.M_world[3][3]]
          ];
          
          // Compute bounding box center
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity; 
          let minZ = Infinity, maxZ = -Infinity;
          
          for (const cell of newCells) {
            // Transform IJK to world coordinates
            const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
            const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
            const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
            
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
          
          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2
          };
          
          (window as any).setOrbitTarget(center);
          console.log("🎯 OrbitControls target set to shape center:", center);
        }
      }, 100); // Small delay to ensure SceneCanvas is ready
    } catch (error) {
      console.error("❌ Failed to compute view transforms:", error);
    }
  };

  // Load last opened shape and restore state on mount
  useEffect(() => {
    try {
      const lastShapeStr = localStorage.getItem('lastOpenedShape');
      const lastState = localStorage.getItem(STORAGE_KEYS.lastState);
      const lastEditMode = localStorage.getItem(STORAGE_KEYS.lastEditMode);
      const headerScrollX = localStorage.getItem(STORAGE_KEYS.headerScrollX);
      
      if (lastShapeStr) {
        const lastShape = JSON.parse(lastShapeStr);
        console.log("🔄 Auto-loading last opened shape:", lastShape.id.substring(0, 24), "...");
        
        // Reconstruct the KoosShape object
        const shape: KoosShape = {
          schema: 'koos.shape',
          version: 1,
          id: lastShape.id,
          lattice: lastShape.lattice,
          cells: lastShape.cells
        };
        
        // Load it
        onLoaded(shape);
        
        // Restore edit mode if it was in edit state (but only if no unsaved edits)
        if (lastState === 'edit') {
          // We can safely restore edit mode since we just loaded from storage
          setTimeout(() => {
            setEdit(true);
            if (lastEditMode) {
              setMode(lastEditMode as 'add' | 'remove');
            }
          }, 100);
        }
      }
      
      // Restore header scroll position
      if (headerScrollX && pillbarRef.current) {
        setTimeout(() => {
          if (pillbarRef.current) {
            pillbarRef.current.scrollLeft = parseFloat(headerScrollX);
          }
        }, 200);
      }
    } catch (error) {
      console.error("❌ Failed to auto-load last shape:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount
  
  // Persist state on changes
  useEffect(() => {
    if (!loaded) return;
    
    try {
      const state = edit ? 'edit' : 'view';
      localStorage.setItem(STORAGE_KEYS.lastState, state);
      
      if (edit) {
        localStorage.setItem(STORAGE_KEYS.lastEditMode, mode);
      }
    } catch (error) {
      console.error("❌ Failed to persist state:", error);
    }
  }, [edit, mode, loaded]);
  
  // Persist header scroll position (debounced)
  useEffect(() => {
    if (!pillbarRef.current) return;
    
    let timeoutId: number;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (pillbarRef.current) {
          try {
            localStorage.setItem(STORAGE_KEYS.headerScrollX, pillbarRef.current.scrollLeft.toString());
          } catch (error) {
            // Ignore storage errors
          }
        }
      }, 300);
    };
    
    const element = pillbarRef.current;
    element.addEventListener('scroll', handleScroll);
    return () => {
      element.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  const handleCellsChange = (newCells: IJK[]) => {
    // Mark as editing operation to prevent camera repositioning
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
    
    // Add current state to history before changing
    if (cells.length > 0) {
      setHistory(prev => [...prev, cells]);
    }
    
    setCells(newCells);
    setHasUnsavedEdits(true);
  };
  
  // Undo handler
  const handleUndo = () => {
    if (history.length === 0) return;
    
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCells(previousState);
    
    // Mark as editing operation
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
  };
  
  // Handle Load Shape button click
  const handleLoadShapeClick = () => {
    // If in edit mode with unsaved changes, show guard sheet
    if (edit && hasUnsavedEdits) {
      setPendingLoadAction(true);
      setShowGuardSheet(true);
    } else {
      setShowLoad(true);
    }
  };
  
  // Handle guard sheet actions
  const handleSaveAndLoad = async () => {
    // Save first, then load
    await handleSaveConfirm();
    if (!saveError) {
      setShowGuardSheet(false);
      setPendingLoadAction(false);
      setShowLoad(true);
    }
  };
  
  const handleLoadWithoutSaving = () => {
    setShowGuardSheet(false);
    setPendingLoadAction(false);
    setShowLoad(true);
    setHasUnsavedEdits(false);
    setHistory([]);
  };
  
  const handleCancelGuard = () => {
    setShowGuardSheet(false);
    setPendingLoadAction(false);
  };

  // Open save modal
  const onSave = () => {
    setShapeName(`Shape_${cells.length}cells`);
    setSaveError(null);
    setShowSaveModal(true);
  };
  
  // Handle actual save
  const handleSaveConfirm = async () => {
    if (!shapeName.trim()) {
      setSaveError('Please enter a shape name');
      return;
    }
    
    try {
      console.log('💾 Saving in koos.shape@1 format...');
      
      const cellArray: [number, number, number][] = cells.map(c => [c.i, c.j, c.k]);
      const koosShape = await createKoosShape(cellArray);
      
      // Check if shape already exists
      const exists = await contractShapeExists(koosShape.id);
      if (exists) {
        console.log('⚠️ Shape already exists with ID:', koosShape.id);
        setSaveError(`⚠️ This shape already exists!\n\nShape IDs are content-addressed (based on cell positions). This exact shape configuration is already saved in the database.`);
        return;
      }
      
      await uploadContractShape({
        id: koosShape.id,
        lattice: koosShape.lattice,
        cells: koosShape.cells,
        size: koosShape.cells.length,
        name: shapeName.trim()
      });
      
      // CONTRACT: Shape - On save, reset activeState with new shapeRef and empty placements
      setActiveState({
        schema: 'koos.state',
        version: 1,
        shapeRef: koosShape.id,
        placements: []
      });
      console.log('✅ Shape Editor: ActiveState reset with new shapeRef after save');
      
      // Mark as saved
      setCurrentShapeId(koosShape.id);
      setHasUnsavedEdits(false);
      setHistory([]);
      
      // Show success modal
      setSavedShapeInfo({
        name: shapeName.trim(),
        id: koosShape.id,
        cells: koosShape.cells.length
      });
      setShowSaveModal(false);
      setShowSuccessModal(true);
      
      console.log('💾 koos.shape@1 saved:', koosShape.id, 'Name:', shapeName);
    } catch (error: any) {
      console.error('❌ Save failed:', error);
      setSaveError(`Failed to save: ${error.message}`);
    }
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
      bottom: 0,
      background: '#000'
    }}>
      {/* Compact Header */}
      <div className="shape-header">
        {/* Left: Home (fixed) */}
        <div className="header-left">
          <button
            className="pill pill--chrome"
            onClick={() => navigate('/')}
            title="Home"
          >
            ⌂
          </button>
        </div>

        {/* Center: Scrolling action pills */}
        <div className="header-center" ref={pillbarRef}>
          {/* Load Shape - Always Available */}
          <button
            className="pill pill--ghost"
            onClick={handleLoadShapeClick}
            title="Load or change the active shape"
          >
            Load Shape
          </button>

          {loaded && (
            <>
            {/* Edit Mode Toggle */}
            {!edit && (
              <button
                className="pill pill--primary"
                onClick={() => setEdit(true)}
                title="Edit this shape"
              >
                Edit
              </button>
            )}

            {/* Edit Mode Controls */}
            {edit && (
              <>
                <button
                  className="pill pill--primary"
                  onClick={() => setEdit(false)}
                  title="Exit edit mode"
                >
                  Done
                </button>
                <button
                  className={`pill ${mode === "add" ? "pill--primary" : "pill--ghost"}`}
                  onClick={() => setMode("add")}
                  title="Add cells"
                >
                  Add
                </button>
                <button
                  className={`pill ${mode === "remove" ? "pill--primary" : "pill--ghost"}`}
                  onClick={() => setMode("remove")}
                  title="Remove cells"
                >
                  Remove
                </button>
                <button
                  className="pill pill--ghost"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  title={history.length === 0 ? "No history to undo" : `Undo (${history.length} steps available)`}
                >
                  Undo
                </button>
                <button
                  className="pill pill--primary"
                  onClick={onSave}
                  disabled={cells.length % 4 !== 0}
                  title={cells.length % 4 === 0 ? "Save shape" : `Need ${4 - (cells.length % 4)} more cells`}
                >
                  Save
                </button>
              </>
            )}

            {/* Solve Buttons (View Mode Only) */}
            {!edit && (
              <>
                <button
                  className="pill pill--ghost"
                  onClick={() => navigate('/manual')}
                  title="Solve Manually"
                >
                  Manual
                </button>
                <button
                  className="pill pill--ghost"
                  onClick={() => navigate('/autosolver')}
                  title="Solve Automatically"
                >
                  Auto
                </button>
              </>
            )}
          </>
        )}
        </div>

        {/* Right: Info (fixed) */}
        <div className="header-right">
          <button
            className="pill pill--chrome"
            onClick={() => setShowInfoModal(true)}
            title="About this page"
          >
            ℹ
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="canvas-wrap" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!loaded && (
          /* Empty State */
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <button
              onClick={() => setShowLoad(true)}
              style={{
                maxWidth: '400px',
                width: '90%',
                padding: '1.25rem 2rem',
                fontSize: '1.25rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(90deg, #2f6ff4 0%, #1f4fb5 100%)',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(47,111,244,0.25)',
              }}
            >
              Choose your puzzle shape
            </button>
            <p style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '0.9rem',
              margin: 0
            }}>
              Load a shape file to begin.
            </p>
          </div>
        )}

        {loaded && view && (
          <>
            <ShapeEditorCanvas
              cells={cells}
              view={view}
              mode={mode}
              editEnabled={edit}
              onCellsChange={handleCellsChange}
              onSave={onSave}
            />
            
            {/* On-canvas Cell Count Overlay */}
            <div className={`cells-chip ${cells.length % 4 === 0 ? 'is-valid' : ''}`}>
              Cells: {cells.length}
              {edit && cells.length % 4 === 0 && <span style={{ color: 'rgba(34,197,94,0.9)', marginLeft: '6px' }}>✓ Ready to save</span>}
              {edit && cells.length % 4 !== 0 && <span style={{ color: 'rgba(255,200,100,0.9)', marginLeft: '6px' }}>(Incomplete)</span>}
            </div>
          </>
        )}
      </div>

      <ShapeBrowserIntegration
        isOpen={showLoad}
        onClose={()=>setShowLoad(false)}
        onSelectShape={onLoaded}
        onLoadPreview={handlePreviewShape}
      />

      {/* Save Shape Modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.75rem' }}>💾 Save Shape</h2>
              <button
                onClick={() => setShowSaveModal(false)}
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

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Shape Info:</div>
                <div><strong>Cells:</strong> {cells.length}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.5rem' }}>
                  Shape IDs are content-addressed (based on cell positions)
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Shape Name:
              </label>
              <input
                type="text"
                value={shapeName}
                onChange={(e) => setShapeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveConfirm();
                }}
                placeholder="Enter shape name..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              />

              {saveError && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: '#ffebee',
                  border: '1px solid #ef5350',
                  borderRadius: '6px',
                  color: '#c62828',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap'
                }}>
                  {saveError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => setShowSaveModal(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontSize: '1rem'
                }}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={handleSaveConfirm}
                style={{
                  flex: 1,
                  background: '#2196F3',
                  color: '#fff',
                  padding: '0.75rem',
                  fontSize: '1rem'
                }}
              >
                Save Shape
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && savedShapeInfo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.75rem' }}>Shape Saved!</h2>
            
            <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: '#2196F3', fontSize: '1.1rem' }}>{savedShapeInfo.name}</strong>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
                <strong>Cells:</strong> {savedShapeInfo.cells}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', wordBreak: 'break-all' }}>
                <strong>ID:</strong> {savedShapeInfo.id.substring(0, 24)}...
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1.5rem' }}>
              Your shape is now available in the library for use in Manual Puzzle and Auto Solver!
            </div>

            <button
              className="btn primary"
              onClick={() => setShowSuccessModal(false)}
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

      {/* Guard Sheet Modal */}
      {showGuardSheet && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.75rem' }}>Unsaved Changes</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              You have unsaved edits to your shape. What would you like to do?
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {cells.length % 4 === 0 && (
                <button
                  className="btn primary"
                  onClick={handleSaveAndLoad}
                  style={{
                    width: '100%',
                    background: '#2196F3',
                    color: '#fff',
                    padding: '0.75rem',
                    fontSize: '1rem'
                  }}
                >
                  Save & Load New Shape
                </button>
              )}
              <button
                className="btn"
                onClick={handleLoadWithoutSaving}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem'
                }}
              >
                Load Without Saving
              </button>
              <button
                className="btn"
                onClick={handleCancelGuard}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfoModal}
        title="About this page"
        onClose={() => setShowInfoModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0 }}><strong>Load Shape</strong> — open or change a shape file</p>
          <p style={{ margin: 0 }}><strong>Edit</strong> — add/remove cells, undo, save</p>
          <p style={{ margin: 0 }}><strong>Solve</strong> — choose manual or automatic solving</p>
          <p style={{ margin: 0 }}><strong>Cells</strong> — live count; save works when count is a multiple of 4</p>
          <p style={{ margin: 0 }}><strong>Load Shape is always available</strong></p>
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            💡 <strong>Tip:</strong> If you have unsaved edits, you'll be prompted before loading a new shape.
          </div>
        </div>
      </InfoModal>
    </div>
  );
}

export default ShapeEditorPage;
