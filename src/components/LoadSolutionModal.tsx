// src/components/LoadSolutionModal.tsx
import React, { useEffect, useState } from "react";
import { listSolutionFiles, loadSolutionJson } from "../pages/solution-viewer/io/solutionIO";
import type { SolutionJSON } from "../pages/solution-viewer/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (solution: SolutionJSON, filename: string) => void;
};

interface SolutionListItem {
  id: string;
  name: string;
  path: string;
  pieces?: number;
}

export const LoadSolutionModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [list, setList] = useState<SolutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          pieces: undefined // We don't know piece count until we load
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

  const loadSolution = async (item: SolutionListItem) => {
    try {
      setLoading(true); 
      setError(null);
      console.log(`🚀 LoadSolutionModal: Loading solution: ${item.path}`);
      const solution = await loadSolutionJson(item.path);
      onLoaded(solution, item.path);
    } catch (e: any) {
      setError(e?.message || String(e));
      console.error("❌ LoadSolutionModal: Failed to load solution:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong>Load Solution</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

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
              <button className="btn" onClick={() => loadSolution(item)}>Load</button>
            </div>
          ))}
          {!loading && !error && list.length === 0 && <div>No solution files found.</div>}
        </div>
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
