// src/components/LoadShapeModal.tsx
import React, { useEffect, useState } from "react";
import { ShapeFileService, ShapeListItem, ShapeFile } from "../services/ShapeFileService";

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (file: ShapeFile, picked?: ShapeListItem) => void;
};

type Mode = "public" | "local";

export const LoadShapeModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [mode, setMode] = useState<Mode>("public");
  const [list, setList] = useState<ShapeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svc = new ShapeFileService();

  useEffect(() => {
    if (!open || mode !== "public") return;
    setLoading(true); setError(null);
    svc.listPublic()
      .then(items => setList(items))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, mode]);

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

  const onLocalPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      setLoading(true); setError(null);
      const file = await svc.readLocalFile(f);
      onLoaded(file, { id: f.name, name: f.name, path: f.name, source: "local" });
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong>Load Shape</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{display:"flex", gap:12, margin:"8px 0"}}>
          <label><input type="radio" checked={mode==="public"} onChange={()=>setMode("public")} /> Public (default)</label>
          <label><input type="radio" checked={mode==="local"} onChange={()=>setMode("local")} /> Local upload</label>
        </div>

        {mode === "public" && (
          <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:280, overflow:"auto"}}>
            {loading && <div>Loading…</div>}
            {error && <div style={{color:"#c00"}}>Using local fallback - GitHub files not available yet</div>}
            {!loading && !error && list.map(item => (
              <div key={item.id} style={row}>
                <div>
                  <div style={{fontWeight:600}}>{item.name}</div>
                  <div style={{fontSize:12, color:"#667", marginTop:2}}>{item.cells ?? "?"} cells</div>
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
                    <div style={{fontSize:12, color:"#667", marginTop:2}}>4 cells</div>
                  </div>
                  <button 
                    className="btn" 
                    onClick={() => loadPublic({id: "tiny_4_local", name: "Tiny 4", cells: 4, path: "/data/containers/v1/samples/tiny_4.fcc.json", source: "public"})}
                  >
                    Load
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "local" && (
          <div style={{marginTop:8}}>
            <input type="file" accept=".json,application/json" onChange={onLocalPick} />
            <div style={{fontSize:12, color:"#667", marginTop:6}}>
              Select a JSON shape file (ab.container.v2, ijk-only).
            </div>
          </div>
        )}

        {/* Cancel button */}
        <div style={{display:"flex", justifyContent:"flex-end", gap:8, marginTop:16, paddingTop:12, borderTop:"1px solid #eee"}}>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const backdrop: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:50 };
const card: React.CSSProperties = { width:520, maxWidth:"95vw", background:"#fff", borderRadius:10, padding:12, boxShadow:"0 10px 24px rgba(0,0,0,.15)" };
const head: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 };
const row: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" };
const xbtn: React.CSSProperties = { border:"1px solid #ddd", width:28, height:28, borderRadius:6, background:"#f6f7f9", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" };
