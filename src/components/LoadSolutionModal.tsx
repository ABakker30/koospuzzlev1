// src/components/LoadSolutionModal.tsx - Cloud Storage Only
import React, { useEffect, useState } from "react";
import type { SolutionJSON } from "../pages/solution-viewer/types";
import { listSolutions, getSolutionSignedUrl } from "../api/solutions";
import { listContractSolutions, getContractSolutionSignedUrl } from "../api/contracts";
import { supabase } from "../lib/supabase";
import AuthPanel from "./AuthPanel";
import { readSolutionFormat } from "../pages/solution-viewer/io/formatReader";

type SolutionSource = 'legacy' | 'contracts';

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (solution: SolutionJSON, filename: string) => void;
};

export const LoadSolutionModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [cloudSolutions, setCloudSolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [source, setSource] = useState<SolutionSource>('legacy');

  // Check auth status and load cloud solutions
  // DEV MODE: Works without authentication
  useEffect(() => {
    if (!open) return;
    
    const checkAuthAndLoad = async () => {
      try {
        // DEV MODE: Check auth but don't require it
        const { data: { user } } = await supabase.auth.getUser();
        setIsSignedIn(!!user);
        
        setLoading(true);
        setError(null);
        
        if (source === 'legacy') {
          const solutions = await listSolutions();
          setCloudSolutions(solutions);
          console.log(`💾 Loaded ${solutions.length} legacy solutions from cloud`);
        } else {
          const contractSolutions = await listContractSolutions();
          setCloudSolutions(contractSolutions);
          console.log(`💾 Loaded ${contractSolutions.length} contract solutions from cloud`);
        }
      } catch (e: any) {
        console.error('❌ Failed to load solutions:', e);
        setError(e.message || 'Failed to load solutions');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoad();
  }, [open, source]);

  if (!open) return null;

  const loadCloudSolution = async (solution: any) => {
    try {
      setLoading(true);
      setError(null);
      
      let url: string;
      let filename: string;
      
      if (source === 'legacy') {
        // Legacy: Get signed URL from file_url field
        url = await getSolutionSignedUrl(solution.file_url);
        filename = solution.name || 'solution';
      } else {
        // Contracts: Get signed URL using solution ID
        url = await getContractSolutionSignedUrl(solution.id);
        filename = `${solution.id.substring(0, 16)}... (${solution.placements?.length || 0} pieces)`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download solution');
      
      // Parse raw JSON and detect format
      const rawData = await response.json();
      
      // Convert to unified format (handles both legacy and koos.state@1)
      const unifiedData = await readSolutionFormat(rawData, filename);
      
      onLoaded(unifiedData, filename);
      onClose();
    } catch (e: any) {
      console.error('❌ Failed to load solution:', e);
      setError(e.message || 'Failed to load solution');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong>Load Solution (Cloud Storage)</strong>
          <button onClick={onClose} style={xbtn}>×</button>
        </div>

        {/* Source toggle */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', padding: '0.5rem', backgroundColor: '#f6f7f9', borderRadius: '6px' }}>
          <button
            className="btn"
            onClick={() => setSource('legacy')}
            style={{
              flex: 1,
              backgroundColor: source === 'legacy' ? '#4f46e5' : '#fff',
              color: source === 'legacy' ? '#fff' : '#333',
              border: source === 'legacy' ? 'none' : '1px solid #ddd',
              fontWeight: source === 'legacy' ? 600 : 400
            }}
          >
            Legacy Format
          </button>
          <button
            className="btn"
            onClick={() => setSource('contracts')}
            style={{
              flex: 1,
              backgroundColor: source === 'contracts' ? '#4f46e5' : '#fff',
              color: source === 'contracts' ? '#fff' : '#333',
              border: source === 'contracts' ? 'none' : '1px solid #ddd',
              fontWeight: source === 'contracts' ? 600 : 400
            }}
          >
            koos.state@1 Format
          </button>
        </div>

        {!isSignedIn && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
            <p style={{ marginBottom: '0.5rem', fontSize: '14px' }}>Sign in to access your cloud solutions:</p>
            <AuthPanel />
          </div>
        )}

        <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:400, overflow:"auto"}}>
          {loading && <div>Loading your solutions...</div>}
          {error && <div style={{color:"#c00", padding: '1rem'}}>{error}</div>}
          {!loading && !error && cloudSolutions.length > 0 && cloudSolutions.map(sol => (
            <div key={sol.id} style={row}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {source === 'legacy' ? (
                  <>
                    <div style={{fontWeight:600}}>{sol.name || 'Untitled Solution'}</div>
                    <div style={{fontSize:11, fontFamily: 'monospace', color:"#999", marginTop:2, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                      {sol.file_url.split('/').pop() || sol.file_url}
                    </div>
                    <div style={{fontSize:12, color:"#667", marginTop:4}}>
                      {sol.metrics?.pieceCount || '?'} pieces • {new Date(sol.created_at).toLocaleDateString()}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{fontWeight:600}}>
                      {sol.metadata?.name || `${sol.id.substring(0, 16)}...`}
                    </div>
                    <div style={{fontSize:11, fontFamily: 'monospace', color:"#999", marginTop:2, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                      {sol.id}.solution.json
                    </div>
                    <div style={{fontSize:12, color:"#667", marginTop:4}}>
                      {sol.placements?.length || 0} pieces • {sol.is_full ? 'Full' : 'Partial'} • {new Date(sol.created_at).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>
              <button className="btn" onClick={() => loadCloudSolution(sol)}>Load</button>
            </div>
          ))}
          {!loading && !error && cloudSolutions && cloudSolutions.length === 0 && (
            <div style={{textAlign:"center", padding:20, color:"#999"}}>
              No solutions saved yet. Solve puzzles in Manual Puzzle mode or upload from batch upload page!
            </div>
          )}
        </div>

        {cloudSolutions && cloudSolutions.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666' }}>
            💾 {cloudSolutions.length} {source === 'legacy' ? 'legacy' : 'contract'} solution{cloudSolutions.length !== 1 ? 's' : ''}
          </div>
        )}
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
