// src/components/LoadSolutionModal.tsx
import React, { useEffect, useState } from "react";
import { listSolutionFiles, loadSolutionJson } from "../pages/solution-viewer/io/solutionIO";
import type { SolutionJSON } from "../pages/solution-viewer/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (solution: SolutionJSON, filename: string) => void;
};

type Mode = "public" | "local";

interface SolutionListItem {
  id: string;
  name: string;
  path: string;
  pieces?: number;
  source?: "public" | "local";
  solutionData?: SolutionJSON;
}

const LOCAL_SOLUTIONS_KEY = "koos_local_solutions";

export const LoadSolutionModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [mode, setMode] = useState<Mode>("public");
  const [list, setList] = useState<SolutionListItem[]>([]);
  const [localList, setLocalList] = useState<SolutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load local solutions from localStorage
  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(LOCAL_SOLUTIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setLocalList(parsed);
        console.log(`📁 Loaded ${parsed.length} local solutions from storage`);
      }
    } catch (e) {
      console.error("Failed to load local solutions:", e);
    }
  }, [open]);

  // Load public solutions list when modal opens
  useEffect(() => {
    if (!open) return;
    console.log("🔄 LoadSolutionModal: Starting to load solution files");
    setLoading(true); 
    setError(null);
    
    listSolutionFiles()
      .then(files => {
        console.log(`🎯 LoadSolutionModal: Received ${files.length} files:`, files);
        const items: SolutionListItem[] = files.map(filename => ({
          id: filename,
          name: filename.replace('.json', ''),
          path: filename,
          pieces: undefined, // We don't know piece count until we load
          source: "public"
        }));
        setList(items);
      })
      .catch(e => {
        console.error("❌ LoadSolutionModal: Error loading solution files:", e);
        setError(String(e));
      })
      .finally(() => {
        console.log("✅ LoadSolutionModal: Loading finished");
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  const loadPublic = async (item: SolutionListItem) => {
    try {
      setLoading(true); 
      setError(null);
      console.log(`🚀 LoadSolutionModal: Loading public solution: ${item.path}`);
      const solution = await loadSolutionJson(item.path);
      onLoaded(solution, item.path);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error("❌ LoadSolutionModal: Failed to load solution:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadLocal = async (item: SolutionListItem) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🚀 LoadSolutionModal: Loading local solution: ${item.name}`);
      
      // Solution data is stored with the item in localStorage
      if (item.solutionData) {
        onLoaded(item.solutionData, item.name);
      } else {
        throw new Error("Solution data not found");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error("❌ LoadSolutionModal: Failed to load local solution:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    // Trigger file picker immediately when switching to local mode
    if (newMode === "local") {
      setTimeout(() => fileInputRef.current?.click(), 100);
    }
  };

  const onLocalPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;  // User canceled file picker
    
    try {
      setLoading(true);
      setError(null);
      
      // Read file as text
      const text = await f.text();
      const solution: SolutionJSON = JSON.parse(text);
      
      // Create item for storage
      const newItem: SolutionListItem = {
        id: f.name,
        name: f.name.replace('.json', ''),
        path: f.name,
        pieces: solution.placements?.length || 0,
        source: "local",
        solutionData: solution
      };
      
      // Store in localStorage
      const updatedList = [newItem, ...localList.filter(item => item.id !== f.name)];
      localStorage.setItem(LOCAL_SOLUTIONS_KEY, JSON.stringify(updatedList));
      setLocalList(updatedList);
      
      // Load immediately
      onLoaded(solution, f.name);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error("❌ LoadSolutionModal: Failed to read local file:", e);
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
          <strong>Load Solution</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        <div style={{display:"flex", gap:12, margin:"8px 0"}}>
          <label><input type="radio" checked={mode==="public"} onChange={()=>handleModeChange("public")} /> Public</label>
          <label><input type="radio" checked={mode==="local"} onChange={()=>handleModeChange("local")} /> Local</label>
        </div>

        {mode === "public" && (
          <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:400, overflow:"auto"}}>
            {(() => {
              console.log(`🐛 Modal state: loading=${loading}, error=${error}, list.length=${list.length}`);
              return null;
            })()}
            {loading && <div>Loading solution files…</div>}
            {error && <div style={{color:"#c00"}}>Error loading files: {error}</div>}
            {!loading && !error && list.map(item => (
              <div key={item.id} style={row}>
                <div>
                  <div style={{fontWeight:600}}>{item.name}</div>
                  <div style={{fontSize:12, color:"#667", marginTop:2}}>
                    {item.pieces ? `${item.pieces} pieces` : "Solution file"}
                  </div>
                </div>
                <button className="btn" onClick={() => loadPublic(item)}>Load</button>
              </div>
            ))}
            {!loading && !error && list.length === 0 && <div>No solution files found.</div>}
          </div>
        )}

        {mode === "local" && (
          <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:400, overflow:"auto"}}>
            {loading && <div>Loading…</div>}
            {localList.length > 0 ? (
              localList.map(item => (
                <div key={item.id} style={row}>
                  <div>
                    <div style={{fontWeight:600}}>{item.name}</div>
                    <div style={{fontSize:12, color:"#667", marginTop:2}}>
                      {item.pieces ? `${item.pieces} pieces` : "Solution file"}
                    </div>
                  </div>
                  <button className="btn" onClick={() => loadLocal(item)}>Load</button>
                </div>
              ))
            ) : (
              <div style={{textAlign:"center", padding:20, color:"#999"}}>
                No local solutions uploaded yet.
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

const backdrop: React.CSSProperties = { 
  position:"fixed", 
  inset:0, 
  background:"rgba(0,0,0,.35)", 
  display:"grid", 
  placeItems:"center", 
  zIndex:50 
};

const card: React.CSSProperties = { 
  width:520, 
  maxWidth:"95vw", 
  background:"#fff", 
  borderRadius:10, 
  padding:12, 
  boxShadow:"0 10px 24px rgba(0,0,0,.15)" 
};

const head: React.CSSProperties = { 
  display:"flex", 
  justifyContent:"space-between", 
  alignItems:"center", 
  marginBottom:8 
};

const row: React.CSSProperties = { 
  display:"flex", 
  justifyContent:"space-between", 
  alignItems:"center", 
  padding:"8px 4px", 
  borderBottom:"1px solid #f0f0f0" 
};

const xbtn: React.CSSProperties = { 
  border:"1px solid #ddd", 
  width:28, 
  height:28, 
  borderRadius:6, 
  background:"#f6f7f9", 
  cursor:"pointer", 
  display:"flex", 
  alignItems:"center", 
  justifyContent:"center" 
};
