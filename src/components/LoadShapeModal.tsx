// src/components/LoadShapeModal.tsx
import React, { useEffect, useState } from "react";
import { ShapeFileService, ShapeListItem, ShapeFile } from "../services/ShapeFileService";

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (file: ShapeFile, picked?: ShapeListItem) => void;
};

type Mode = "public" | "local";

const LOCAL_FILES_KEY = "koos_local_shapes";

export const LoadShapeModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [mode, setMode] = useState<Mode>("public");
  const [list, setList] = useState<ShapeListItem[]>([]);
  const [localList, setLocalList] = useState<ShapeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const svc = new ShapeFileService();

  // Load local files from localStorage
  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(LOCAL_FILES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setLocalList(parsed);
        console.log(`📁 Loaded ${parsed.length} local files from storage`);
      }
    } catch (e) {
      console.error("Failed to load local files:", e);
    }
  }, [open]);

  // Load public shapes list when modal opens
  useEffect(() => {
    if (!open) return;
    console.log("🔄 LoadShapeModal: Starting to load public shapes");
    setLoading(true); setError(null);
    svc.listPublic()
      .then(items => {
        console.log(`🎯 LoadShapeModal: Received ${items.length} items:`, items);
        setList(items);
      })
      .catch(e => {
        console.error("❌ LoadShapeModal: Error loading shapes:", e);
        setError(String(e));
      })
      .finally(() => {
        console.log("✅ LoadShapeModal: Loading finished");
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  const loadPublic = async (item: ShapeListItem) => {
    try {
      setLoading(true); setError(null);
      const file = await svc.readPublic(item.path);
      onLoaded(file, item);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadLocal = async (item: any) => {
    try {
      setLoading(true); setError(null);
      // File data is stored with the item in localStorage
      if (item.fileData) {
        onLoaded(item.fileData, item);
      } else {
        throw new Error("File data not found");
      }
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    // Trigger file picker when switching to local mode
    if (newMode === "local" && localList.length === 0) {
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  };

  const onLocalPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;  // User canceled file picker
    try {
      setLoading(true); setError(null);
      const file = await svc.readLocalFile(f);
      
      // Save to localStorage for future access
      const newItem: ShapeListItem = {
        id: f.name,
        name: file.name || f.name.replace('.fcc.json', '').replace('.json', ''),
        cells: file.cells.length,
        path: f.name,  // We'll store the file data in localStorage
        source: "local"
      };
      
      // Store file data with the item
      const itemWithData = { ...newItem, fileData: file };
      const updatedList = [itemWithData, ...localList.filter(item => item.id !== f.name)];
      localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(updatedList));
      setLocalList(updatedList);
      
      onLoaded(file, newItem);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      // Reset the file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong>Browse Shapes</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{display:"flex", gap:12, margin:"8px 0"}}>
          <label><input type="radio" checked={mode==="public"} onChange={()=>handleModeChange("public")} /> Public</label>
          <label><input type="radio" checked={mode==="local"} onChange={()=>handleModeChange("local")} /> Local</label>
        </div>

        {mode === "public" && (
          <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:280, overflow:"auto"}}>
            {(() => {
              console.log(`🐛 Modal state: loading=${loading}, error=${error}, list.length=${list.length}`);
              return null;
            })()}
            {loading && <div>Loading…</div>}
            {error && <div style={{color:"#c00"}}>Using local fallback - GitHub files not available yet</div>}
            {!loading && !error && list.map(item => (
              <div key={item.id} style={row}>
                <div>
                  <div style={{fontWeight:600}}>{item.name}</div>
                </div>
                <button className="btn" onClick={() => loadPublic(item)}>Load</button>
              </div>
            ))}
            {!loading && !error && list.length===0 && <div>No public shapes found.</div>}
            {error && (
              <div style={{marginTop:8}}>
                <div style={{fontSize:12, color:"#667", marginBottom:8}}>
                  Fallback: Using local sample shape
                </div>
                <div style={row}>
                  <div>
                    <div style={{fontWeight:600}}>Tiny 4 (Local)</div>
                  </div>
                  <button 
                    className="btn" 
                    onClick={() => loadPublic({id: "tiny_4_local", name: "Tiny 4", path: "/data/containers/v1/samples/tiny_4.fcc.json", source: "public"})}
                  >
                    Load
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "local" && (
          <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:280, overflow:"auto"}}>
            {loading && <div>Loading…</div>}
            {localList.length > 0 ? (
              localList.map(item => (
                <div key={item.id} style={row}>
                  <div>
                    <div style={{fontWeight:600}}>{item.name}</div>
                    <div style={{fontSize:12, color:"#667", marginTop:2}}>{item.cells ?? "?"} cells</div>
                  </div>
                  <button className="btn" onClick={() => loadLocal(item)}>Load</button>
                </div>
              ))
            ) : (
              <div style={{textAlign:"center", padding:20, color:"#999"}}>
                No local files uploaded yet.
              </div>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".json,application/json" 
          onChange={onLocalPick}
          style={{display: "none"}}
        />

      </div>
    </div>
  );
};

const backdrop: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:50 };
const card: React.CSSProperties = { width:520, maxWidth:"95vw", background:"#fff", borderRadius:10, padding:12, boxShadow:"0 10px 24px rgba(0,0,0,.15)" };
const head: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 };
const row: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" };
const xbtn: React.CSSProperties = { border:"1px solid #ddd", width:28, height:28, borderRadius:6, background:"#f6f7f9", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" };
