import React, { useMemo, useState } from "react";
import type { IJK } from "../types/shape";
import { keyOf } from "../lib/ijk";
import { LoadShapeModal } from "../components/LoadShapeModal";
import type { ShapeFile } from "../services/ShapeFileService";
import "../styles/shape.css";

type EditMode = "add" | "remove";

function ShapeEditorPage() {
  const [cells, setCells] = useState<IJK[]>([]);
  const [shapeName, setShapeName] = useState("New Shape");

  const [loaded, setLoaded] = useState(false);      // NEW: gate editing until load
  const [showLoad, setShowLoad] = useState(true);   // open modal immediately
  const [edit, setEdit] = useState(false);          // starts disabled until load
  const [mode, setMode] = useState<EditMode>("add");

  const hash = useMemo(() => new Set(cells.map(keyOf)), [cells]);
  const canSave = loaded && cells.length > 0;

  const onBrowse = () => setShowLoad(true);

  const onLoaded = (file: ShapeFile) => {
    // Convert ijk list to in-memory model
    setCells(file.cells.map(([i,j,k]) => ({ i, j, k })));
    setShapeName(file.name || "Loaded Shape");
    setLoaded(true);
    setEdit(true);          // allow editing after load
    setShowLoad(false);
    // TODO: run orientation pipeline and first-fit in SceneCanvas when attached
  };

  const onSave = () => {
    if (!canSave) return;
    // TODO: canonicalize ijk-only, compute cid, save via service.saveLocal(name/cid)
    alert("Saved (stub)");
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
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <button className="btn" onClick={onBrowse} aria-label="Browse shapes">Browse</button>

          <label style={{ display:"inline-flex", alignItems:"center", gap:6, opacity: loaded ? 1 : .5 }}>
            <input type="checkbox" checked={edit} onChange={e => setEdit(e.target.checked)} disabled={!loaded} />
            Edit
          </label>

          {loaded && edit && (
            <button 
              type="button" 
              className="btn" 
              onClick={() => setMode(mode === "add" ? "remove" : "add")}
              style={{
                backgroundColor: mode === "add" ? "#4CAF50" : "#f44336",
                color: "white",
                border: "none"
              }}
            >
              {mode === "add" ? "Add" : "Remove"}
            </button>
          )}

          <button className="btn primary" onClick={onSave} disabled={!canSave} aria-label="Save shape">Save</button>
        </div>


        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          <div className="muted">Cells: {cells.length}</div>
          <button className="btn" title="Settings">⚙️</button>
          <button className="btn primary">Login</button>
        </div>
      </div>

      {/* Full-width/height viewport */}
      <main className="viewport">
        {/* SceneCanvas mounts here later; for now keep placeholder */}
        <div style={{display:"grid",placeItems:"center", color:"#9aa3ad", fontSize:14}}>
          {!loaded ? "(Load a shape to begin)" : "(3D canvas placeholder — editing enabled)"}
        </div>
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
