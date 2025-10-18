import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { IJK } from "../types/shape";
import { ijkToXyz } from "../lib/ijk";
import { BrowseContractShapesModal } from "../components/BrowseContractShapesModal";
import { InfoModal } from "../components/InfoModal";
import ShapeEditorCanvas from "../components/ShapeEditorCanvas";
import { computeViewTransforms, type ViewTransforms } from "../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../lib/quickhull-adapter";
import { uploadContractShape, contractShapeExists } from "../api/contracts";
import { createKoosShape } from "../services/shapeFormatReader";
import { useActiveState } from "../context/ActiveStateContext";
import "../styles/shape.css";

// koos.shape@1 format
interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}


function ShapeEditorPage() {
  const navigate = useNavigate();
  const { setActiveState, setLastShapeRef } = useActiveState();
  const [cells, setCells] = useState<IJK[]>([]);
  
  // Ref to always have latest cells value (prevents stale closure)
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  const [loaded, setLoaded] = useState(false);
  const [showLoad, setShowLoad] = useState(false); // no auto-open
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedShapeInfo, setSavedShapeInfo] = useState<{ name: string; id: string; cells: number } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [editInfoPosition, setEditInfoPosition] = useState({ x: 0, y: 0 });
  const [editInfoDragging, setEditInfoDragging] = useState(false);
  const [editInfoDragOffset, setEditInfoDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Undo system
  const [undoStack, setUndoStack] = useState<IJK[][]>([]);
  const canUndo = undoStack.length > 0;

  const onLoaded = (shape: KoosShape) => {
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
    setSavedShapeInfo({ name: shape.id, id: shape.id, cells: newCells.length });
    setHasUnsavedChanges(false);
    
    // Save to localStorage as last opened shape
    try {
      localStorage.setItem('lastOpenedShape', JSON.stringify({
        id: shape.id,
        lattice: shape.lattice,
        cells: shape.cells,
        timestamp: Date.now()
      }));
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

  // Load last opened shape on mount
  useEffect(() => {
    try {
      const lastShapeStr = localStorage.getItem('lastOpenedShape');
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
      }
    } catch (error) {
      console.error("❌ Failed to auto-load last shape:", error);
    }
  }, []); // Empty dependency array - only run on mount

  // Undo system functions
  const pushUndoState = (currentCells: IJK[]) => {
    setUndoStack(prev => {
      const newStack = [...prev, [...currentCells]]; // Deep copy
      return newStack.slice(-10); // Keep only last 10 states
    });
  };

  const handleUndo = () => {
    if (undoStack.length > 0) {
      // Mark as editing operation to prevent camera repositioning
      if ((window as any).setEditingFlag) {
        (window as any).setEditingFlag(true);
      }
      
      const previousState = undoStack[undoStack.length - 1];
      setCells([...previousState]); // Deep copy
      setUndoStack(prev => prev.slice(0, -1)); // Remove last state
    }
  };

  const handleCellsChange = (newCells: IJK[]) => {
    // Mark as editing operation to prevent camera repositioning
    if ((window as any).setEditingFlag) {
      (window as any).setEditingFlag(true);
    }
    
    // Push current state to undo stack before making changes
    // Use ref to get latest cells value (prevents stale closure)
    const currentCells = cellsRef.current;
    pushUndoState(currentCells);
    console.log(`📚 Undo: Pushed state with ${currentCells.length} cells, applying ${newCells.length} cells`);
    setCells(newCells);
    
    // Mark as unsaved when cells change
    setHasUnsavedChanges(true);
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
      
      // Clear unsaved changes flag after successful save
      setHasUnsavedChanges(false);
      
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

  // Check if mobile
  const isMobile = window.innerWidth <= 768;

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
      {/* Header with responsive layout */}
      <div style={{ 
        padding: isMobile ? ".5rem .75rem" : ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff" 
      }}>
        {/* Page Title & Menu */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem"
        }}>
          <div style={{
            fontSize: isMobile ? "1.25rem" : "1.5rem",
            fontWeight: "600",
            color: "#2196F3",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <span>🧩</span>
            <span>Shape Selector</span>
          </div>
          
          <button 
            className="btn" 
            onClick={() => setShowMenuModal(true)}
            style={{ 
              height: "2.5rem", 
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: isMobile ? "1.4em" : "1.5em" 
            }}
            title="Menu"
          >
            ☰
          </button>
        </div>
        {/* Desktop: Single line with all controls | Mobile: First line with Browse, Save, Cells, Home */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: isMobile && loaded ? "0.5rem" : "0"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {hasUnsavedChanges && cells.length % 4 === 0 && (
              <button className="btn primary" style={{ height: "2.5rem" }} onClick={onSave}>Save</button>
            )}
            
            {/* Desktop: Edit controls on same line */}
            {!isMobile && loaded && savedShapeInfo && (
              <>
                <button
                  className="btn"
                  onClick={() => {
                    const newEdit = !edit;
                    if (newEdit) {
                      setShowEditInfo(true);
                    }
                    setEdit(newEdit);
                  }}
                  style={{
                    height: "2.5rem",
                    backgroundColor: edit ? "#28a745" : "#dc3545",
                    color: "#fff",
                    border: "none",
                    fontWeight: "600",
                    marginLeft: ".5rem",
                    minWidth: "100px",
                    transition: "background-color 0.3s ease"
                  }}
                  title={edit ? "Click to view mode" : "Click to edit mode"}
                >
                  {edit ? "✏️ Editing" : "👁️ Viewing"}
                </button>

                {edit && (
                  <>
                    <button
                      className="btn"
                      onClick={() => setMode(mode === "add" ? "remove" : "add")}
                      style={{
                        height: "2.5rem",
                        backgroundColor: mode === "add" ? "#28a745" : "#dc3545",
                        color: "#fff",
                        border: "none",
                        fontWeight: "600",
                        minWidth: "120px",
                        transition: "background-color 0.3s ease"
                      }}
                      title={mode === "add" ? "Click to remove mode" : "Click to add mode"}
                    >
                      {mode === "add" ? "➕ Adding" : "➖ Removing"}
                    </button>

                    <button 
                      className="btn" 
                      onClick={handleUndo} 
                      disabled={!canUndo} 
                      title="Undo last action"
                      style={{
                        height: "2.5rem",
                        backgroundColor: canUndo ? "#6c757d" : "#e9ecef",
                        color: canUndo ? "#fff" : "#6c757d",
                        border: "none",
                        fontWeight: "600",
                        minWidth: "100px",
                        cursor: canUndo ? "pointer" : "not-allowed",
                        opacity: canUndo ? 1 : 0.6
                      }}
                    >
                      ↶ Undo
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile: Second line with edit controls */}
        {isMobile && loaded && savedShapeInfo && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem"
          }}>
            <button
              className="btn"
              onClick={() => {
                const newEdit = !edit;
                if (newEdit) {
                  setShowEditInfo(true);
                }
                setEdit(newEdit);
              }}
              style={{
                height: "2.5rem",
                backgroundColor: edit ? "#28a745" : "#dc3545",
                color: "#fff",
                border: "none",
                fontWeight: "600",
                minWidth: "100px",
                transition: "background-color 0.3s ease"
              }}
              title={edit ? "Click to view mode" : "Click to edit mode"}
            >
              {edit ? "✏️ Editing" : "👁️ Viewing"}
            </button>

            {edit && (
              <>
                <button
                  className="btn"
                  onClick={() => setMode(mode === "add" ? "remove" : "add")}
                  style={{
                    height: "2.5rem",
                    backgroundColor: mode === "add" ? "#28a745" : "#dc3545",
                    color: "#fff",
                    border: "none",
                    fontWeight: "600",
                    minWidth: "120px",
                    transition: "background-color 0.3s ease"
                  }}
                  title={mode === "add" ? "Click to remove mode" : "Click to add mode"}
                >
                  {mode === "add" ? "➕ Adding" : "➖ Removing"}
                </button>

                <button 
                  className="btn" 
                  onClick={handleUndo} 
                  disabled={!canUndo} 
                  title="Undo last action"
                  style={{
                    height: "2.5rem",
                    backgroundColor: canUndo ? "#6c757d" : "#e9ecef",
                    color: canUndo ? "#fff" : "#6c757d",
                    border: "none",
                    fontWeight: "600",
                    minWidth: "100px",
                    cursor: canUndo ? "pointer" : "not-allowed",
                    opacity: canUndo ? 1 : 0.6
                  }}
                >
                  ↶ Undo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view && (
          <ShapeEditorCanvas
            cells={cells}
            view={view}
            mode={mode}
            editEnabled={edit}
            onCellsChange={handleCellsChange}
            onSave={onSave}
          />
        )}
        
        {/* Cell Count Overlay */}
        {loaded && (
          <div style={{
            position: 'absolute',
            top: 20,
            left: 20,
            background: cells.length % 4 === 0 ? 'rgba(0, 150, 0, 0.9)' : 'rgba(220, 53, 69, 0.9)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Cells: {cells.length} {cells.length % 4 === 0 ? '✅' : '❌'}
          </div>
        )}
      </div>

      <BrowseContractShapesModal
        open={showLoad}
        onClose={()=>setShowLoad(false)}
        onLoaded={onLoaded}
      />

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Shape Editor Help"
      >
        <div style={{ lineHeight: '1.6' }}>
          <p style={{ marginTop: 0, padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #2196F3' }}>
            <strong>Every puzzle begins with a shape!</strong> Design your own unique container or load one from the library. 
            Once you've created (or modified) your shape, use it to manually solve puzzles or let the auto-solver find solutions for you. 
            The possibilities are endless—build something simple or challenge yourself with complex designs!
          </p>

          <h4>Getting Started</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Browse:</strong> Load a saved shape from the library</li>
            <li><strong>Save:</strong> Save your shape to the library</li>
          </ul>

          <h4>How to Edit</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>Check the <strong>Edit</strong> checkbox to start editing</li>
            <li>Choose <strong>Add</strong> (green) to add cells or <strong>Remove</strong> (red) to delete cells</li>
            <li>Hover your mouse to highlight where you can add or remove</li>
            <li><strong>Double-click</strong> or <strong>hold (½ second)</strong> to confirm</li>
            <li>Click <strong>Undo</strong> if you make a mistake</li>
          </ul>

          <h4>Building Rules</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>New cells must touch existing cells</li>
            <li>You can only add cells in positions shown in green</li>
          </ul>

          <h4>View Controls</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Rotate:</strong> Left-click and drag</li>
            <li><strong>Pan:</strong> Right-click and drag</li>
            <li><strong>Zoom:</strong> Mouse wheel or pinch</li>
          </ul>
        </div>
      </InfoModal>

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

      {/* Edit Info Modal */}
      {showEditInfo && (
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
            if (editInfoDragging) {
              setEditInfoPosition({
                x: e.clientX - editInfoDragOffset.x,
                y: e.clientY - editInfoDragOffset.y
              });
            }
          }}
          onMouseUp={() => setEditInfoDragging(false)}
        >
          <div style={{
            position: editInfoPosition.x === 0 && editInfoPosition.y === 0 ? 'relative' : 'fixed',
            left: editInfoPosition.x === 0 && editInfoPosition.y === 0 ? 'auto' : `${editInfoPosition.x}px`,
            top: editInfoPosition.y === 0 && editInfoPosition.y === 0 ? 'auto' : `${editInfoPosition.y}px`,
            background: '#fff',
            borderRadius: '12px',
            padding: '0',
            maxWidth: '550px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            cursor: editInfoDragging ? 'grabbing' : 'default',
            pointerEvents: 'auto'
          }}>
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
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
              onMouseDown={(e) => {
                setEditInfoDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setEditInfoDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '3rem' }}>✏️</div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', textAlign: 'center' }}>Shape Editing Tips</h2>
            </div>
            
            <div style={{ padding: '2rem' }}>
            
            <div style={{ lineHeight: '1.6', color: '#333', fontSize: '0.95rem' }}>
              <p style={{ marginTop: 0 }}>
                You can now add or remove cells from your shape using the <strong>Add</strong> and <strong>Remove</strong> buttons.
              </p>
              
              <div style={{ 
                background: '#fff3cd', 
                border: '1px solid #ffc107', 
                borderRadius: '8px', 
                padding: '1rem', 
                marginTop: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#856404' }}>⚠️ Important: Modulo 4 Requirement</div>
                <p style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>
                  Shapes can only be saved when the <strong>cell count is divisible by 4</strong> (e.g., 4, 8, 12, 16, 20, etc.).
                </p>
                <p style={{ margin: 0, color: '#856404' }}>
                  The <strong>Save</strong> button will only appear when you have unsaved changes AND your cell count is a multiple of 4.
                </p>
              </div>
              
              <p style={{ marginBottom: 0, fontSize: '0.875rem', color: '#666' }}>
                Current cells: <strong>{cells.length}</strong> {cells.length % 4 === 0 ? '✅ (can save)' : `❌ (need ${4 - (cells.length % 4)} more cell${4 - (cells.length % 4) > 1 ? 's' : ''})`}
              </p>
            </div>

              <button
                className="btn primary"
                onClick={() => setShowEditInfo(false)}
                style={{
                  width: '100%',
                  marginTop: '1.5rem',
                  background: '#2196F3',
                  color: '#fff',
                  padding: '0.75rem',
                  fontSize: '1rem'
                }}
              >
                Got it!
              </button>
            </div>
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
            if (isDragging) {
              setMenuPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
              });
            }
          }}
          onMouseUp={() => setIsDragging(false)}
        >
          <div 
            style={{
              position: menuPosition.x === 0 && menuPosition.y === 0 ? 'relative' : 'fixed',
              left: menuPosition.x === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.x}px`,
              top: menuPosition.y === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.y}px`,
              background: '#fff',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: isDragging ? 'grabbing' : 'default',
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
                setIsDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '2rem' }}>☰</div>
            </div>
            
            <div style={{ padding: '1rem 2rem 2rem 2rem' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>Menu</h2>
            
            {menuMessage && (
              <div style={{
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
                color: '#856404'
              }}>
                {menuMessage}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowLoad(true);
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
                <span>Select a Puzzle Shape</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/solutions');
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
                <span style={{ fontSize: '1.5rem' }}>📂</span>
                <span>Solution Viewer</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  const canUsePuzzle = savedShapeInfo && !hasUnsavedChanges && !edit;
                  if (canUsePuzzle) {
                    setShowMenuModal(false);
                    navigate('/manual');
                  } else {
                    let msg = '';
                    if (edit) {
                      msg = 'Please disable Edit mode first.';
                    } else if (hasUnsavedChanges) {
                      msg = 'Please save your changes first.';
                    } else {
                      msg = 'Please save your shape first.';
                    }
                    setMenuMessage(msg);
                    setTimeout(() => setMenuMessage(null), 4000);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#28a745' : '#e9ecef',
                  color: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#fff' : '#6c757d',
                  border: 'none',
                  justifyContent: 'flex-start',
                  cursor: (savedShapeInfo && !hasUnsavedChanges && !edit) ? 'pointer' : 'not-allowed'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🎮</span>
                <span>Manual Puzzle</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  const canUseSolver = savedShapeInfo && !hasUnsavedChanges && !edit;
                  if (canUseSolver) {
                    setShowMenuModal(false);
                    navigate('/autosolver');
                  } else {
                    let msg = '';
                    if (edit) {
                      msg = 'Please disable Edit mode first.';
                    } else if (hasUnsavedChanges) {
                      msg = 'Please save your changes first.';
                    } else {
                      msg = 'Please save your shape first.';
                    }
                    setMenuMessage(msg);
                    setTimeout(() => setMenuMessage(null), 4000);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#2196F3' : '#e9ecef',
                  color: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#fff' : '#6c757d',
                  border: 'none',
                  justifyContent: 'flex-start',
                  cursor: (savedShapeInfo && !hasUnsavedChanges && !edit) ? 'pointer' : 'not-allowed'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                <span>Automated Solver</span>
              </button>

              <button
                className="btn"
                onClick={() => {
                  const canUseStudio = savedShapeInfo && !hasUnsavedChanges && !edit;
                  if (canUseStudio) {
                    setShowMenuModal(false);
                    navigate('/studio');
                  } else {
                    let msg = '';
                    if (edit) {
                      msg = 'Please disable Edit mode first.';
                    } else if (hasUnsavedChanges) {
                      msg = 'Please save your changes first.';
                    } else {
                      msg = 'Please save your shape first.';
                    }
                    setMenuMessage(msg);
                    setTimeout(() => setMenuMessage(null), 4000);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#9c27b0' : '#e9ecef',
                  color: (savedShapeInfo && !hasUnsavedChanges && !edit) ? '#fff' : '#6c757d',
                  border: 'none',
                  justifyContent: 'flex-start',
                  cursor: (savedShapeInfo && !hasUnsavedChanges && !edit) ? 'pointer' : 'not-allowed'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🎥</span>
                <span>Content Studio</span>
              </button>

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
}

export default ShapeEditorPage;
