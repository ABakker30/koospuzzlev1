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

  // Undo system
  const [undoStack, setUndoStack] = useState<IJK[][]>([]);
  const canUndo = undoStack.length > 0;

  const canSave = loaded && cells.length > 0;


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
  };

  const onSave = async () => {
    if (!canSave) return;
    
    // DEV MODE: No sign-in required
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) {
    //   alert('Please sign in to save shapes to cloud');
    //   return;
    // }
    
    try {
      // Always save in koos.shape@1 format
      console.log('💾 Saving in koos.shape@1 format...');
      
      const cellArray: [number, number, number][] = cells.map(c => [c.i, c.j, c.k]);
      const koosShape = await createKoosShape(cellArray);
      
      // Check if shape already exists (shape IDs must be unique)
      const exists = await contractShapeExists(koosShape.id);
      if (exists) {
        console.log('⚠️ Shape already exists with ID:', koosShape.id);
        alert(`⚠️ This shape already exists!\n\nID: ${koosShape.id.substring(0, 24)}...\n\nShape IDs are content-addressed (based on cell positions). This exact shape configuration is already saved in the database.`);
        return;
      }
      
      // Prompt for shape name
      const shapeName = prompt('Enter shape name:', `Shape_${cells.length}cells`);
      if (!shapeName) return; // User cancelled
      
      await uploadContractShape({
        id: koosShape.id,
        lattice: koosShape.lattice,
        cells: koosShape.cells,
        size: koosShape.cells.length,
        name: shapeName
      });
      
      // CONTRACT: Shape - On save, reset activeState with new shapeRef and empty placements
      setActiveState({
        schema: 'koos.state',
        version: 1,
        shapeRef: koosShape.id,
        placements: []
      });
      console.log('✅ Shape Editor: ActiveState reset with new shapeRef after save');
      
      alert(`✅ Shape "${shapeName}" saved in koos.shape@1 format!\nID: ${koosShape.id.substring(0, 24)}...`);
      console.log('💾 koos.shape@1 saved:', koosShape.id, 'Name:', shapeName);
    } catch (error: any) {
      console.error('❌ Save failed:', error);
      alert(`Failed to save: ${error.message}`);
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
        {/* Desktop: Single line with all controls | Mobile: First line with Browse, Save, Cells, Home */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: isMobile && loaded ? "0.5rem" : "0"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button className="btn" style={{ height: "2.5rem" }} onClick={()=>setShowLoad(true)}>Browse</button>
            <button className="btn primary" style={{ height: "2.5rem" }} onClick={onSave} disabled={!canSave}>Save</button>
            
            {/* Desktop: Edit controls on same line */}
            {!isMobile && loaded && (
              <>
                <label style={{ display:"inline-flex", alignItems:"center", gap:6, opacity: loaded ? 1 : .5, marginLeft: ".5rem" }}>
                  <input type="checkbox" checked={edit} onChange={e=>setEdit(e.target.checked)} disabled={!loaded} />
                  Edit
                </label>

                {edit && (
                  <>
                    <div className="segmented" role="group" aria-label="Add or Remove">
                      <button 
                        type="button" 
                        className={mode==="add" ? "active" : ""} 
                        aria-pressed={mode==="add"} 
                        onClick={()=>setMode("add")}
                        style={{
                          backgroundColor: mode==="add" ? "#00ff00" : "",
                          color: mode==="add" ? "#000" : "",
                          border: mode==="add" ? "1px solid #00cc00" : ""
                        }}
                      >
                        Add
                      </button>
                      <button 
                        type="button" 
                        className={mode==="remove" ? "active" : ""} 
                        aria-pressed={mode==="remove"} 
                        onClick={()=>setMode("remove")}
                        style={{
                          backgroundColor: mode==="remove" ? "#ff0000" : "",
                          color: mode==="remove" ? "#fff" : "",
                          border: mode==="remove" ? "1px solid #cc0000" : ""
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <button className="btn" onClick={handleUndo} disabled={!canUndo} title="Undo last action">
                      ↶ Undo
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div className="muted">Cells: {cells.length}</div>
            <button 
              className="btn" 
              onClick={() => setShowInfo(true)}
              style={{ 
                height: "2.5rem", 
                width: "2.5rem", 
                minWidth: "2.5rem", 
                padding: "0", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                fontFamily: "monospace", 
                fontSize: "1.2em" 
              }}
              title="Help & Information"
            >
              ℹ
            </button>
            <button 
              className="btn" 
              onClick={() => navigate('/')}
              style={{ 
                height: "2.5rem", 
                width: "2.5rem", 
                minWidth: "2.5rem", 
                padding: "0", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                fontFamily: "monospace", 
                fontSize: "1.4em" 
              }}
              title="Home"
            >
              ⌂
            </button>
          </div>
        </div>

        {/* Mobile: Second line with edit controls */}
        {isMobile && loaded && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem"
          }}>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6, opacity: loaded ? 1 : .5 }}>
              <input type="checkbox" checked={edit} onChange={e=>setEdit(e.target.checked)} disabled={!loaded} />
              Edit
            </label>

            {edit && (
              <>
                <div className="segmented" role="group" aria-label="Add or Remove">
                  <button 
                    type="button" 
                    className={mode==="add" ? "active" : ""} 
                    aria-pressed={mode==="add"} 
                    onClick={()=>setMode("add")}
                    style={{
                      backgroundColor: mode==="add" ? "#00ff00" : "",
                      color: mode==="add" ? "#000" : "",
                      border: mode==="add" ? "1px solid #00cc00" : ""
                    }}
                  >
                    Add
                  </button>
                  <button 
                    type="button" 
                    className={mode==="remove" ? "active" : ""} 
                    aria-pressed={mode==="remove"} 
                    onClick={()=>setMode("remove")}
                    style={{
                      backgroundColor: mode==="remove" ? "#ff0000" : "",
                      color: mode==="remove" ? "#fff" : "",
                      border: mode==="remove" ? "1px solid #cc0000" : ""
                    }}
                  >
                    Remove
                  </button>
                </div>

                <button className="btn" onClick={handleUndo} disabled={!canUndo} title="Undo last action">
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
    </div>
  );
}

export default ShapeEditorPage;
