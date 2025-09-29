import React, { useMemo, useState } from "react";
import type { IJK } from "../types/shape";
import { keyOf, ijkToXyz } from "../lib/ijk";
import { LoadShapeModal } from "../components/LoadShapeModal";
import SceneCanvas from "../components/SceneCanvas";
import type { ShapeFile } from "../services/ShapeFileService";
import { computeViewTransforms, type ViewTransforms } from "../services/ViewTransforms";
import { quickHullWithCoplanarMerge } from "../lib/quickhull-adapter";
import "../styles/shape.css";

type EditMode = "add" | "remove";

function ShapeEditorPage() {
  const [cells, setCells] = useState<IJK[]>([]);
  const [shapeName, setShapeName] = useState("New Shape");

  const [loaded, setLoaded] = useState(false);
  const [showLoad, setShowLoad] = useState(false); // no auto-open
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [view, setView] = useState<ViewTransforms | null>(null);

  // Undo system
  const [undoStack, setUndoStack] = useState<IJK[][]>([]);
  const canUndo = undoStack.length > 0;

  const hash = useMemo(() => new Set(cells.map(keyOf)), [cells]);
  const canSave = loaded && cells.length > 0;


  const onLoaded = (file: ShapeFile) => {
    console.log("📥 onLoaded called with file:", file);
    const newCells = file.cells.map(([i,j,k]) => ({ i, j, k }));
    console.log("📊 Converted cells:", newCells.length, "cells");
    
    setCells(newCells);
    setShapeName(file.name || "Loaded Shape");
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
    // Push current state to undo stack before making changes
    pushUndoState(cells);
    setCells(newCells);
  };

  const onSave = () => {
    if (!canSave) return;
    // Call the save function from SceneCanvas
    if ((window as any).saveCurrentShape) {
      (window as any).saveCurrentShape();
    } else {
      alert("Save function not available. Please try again.");
    }
  };

  return (
    <div className="shape-page">
      {/* Single header line */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        padding: ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff" 
      }}>
        <div className="actions">
          <button className="btn" onClick={()=>setShowLoad(true)}>Browse</button>

          <label style={{ display:"inline-flex", alignItems:"center", gap:6, opacity: loaded ? 1 : .5 }}>
            <input type="checkbox" checked={edit} onChange={e=>setEdit(e.target.checked)} disabled={!loaded} />
            Edit
          </label>

          {loaded && edit && (
            <div className="segmented" role="group" aria-label="Add or Remove">
              <button type="button" className={mode==="add" ? "active" : ""} aria-pressed={mode==="add"} onClick={()=>setMode("add")}>Add</button>
              <button type="button" className={mode==="remove" ? "active" : ""} aria-pressed={mode==="remove"} onClick={()=>setMode("remove")}>Remove</button>
            </div>
          )}

          {loaded && edit && (
            <button className="btn" onClick={handleUndo} disabled={!canUndo} title="Undo last action">
              ↶ Undo
            </button>
          )}

          <button className="btn primary" onClick={onSave} disabled={!canSave}>Save</button>
        </div>


        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          <div className="muted">Cells: {cells.length}</div>
          <button className="btn primary">Login</button>
        </div>
      </div>

      {/* Full-width/height viewport */}
      <main className="viewport">
        {loaded && view ? (
          <SceneCanvas
            cells={cells}
            view={view}
            editMode={edit}
            mode={mode}
            onCellsChange={handleCellsChange}
          />
        ) : null}
      </main>

      <LoadShapeModal
        open={showLoad}
        onClose={()=>setShowLoad(false)}
        onLoaded={onLoaded}
      />
    </div>
  );
}

export default ShapeEditorPage;
