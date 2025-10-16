// src/components/LoadShapeModal.tsx - Cloud Storage Only
import React, { useEffect, useState } from "react";
import { ShapeFile } from "../services/ShapeFileService";
import { listShapes, getShapeSignedUrl } from "../api/shapes";
import { listContractShapes, getContractShapeSignedUrl } from "../api/contracts";
import { readShapeFormat } from "../services/shapeFormatReader";
import { supabase } from "../lib/supabase";
import AuthPanel from "./AuthPanel";

type ShapeSource = 'legacy' | 'contracts';

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (file: ShapeFile) => void;
};

export const LoadShapeModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [cloudShapes, setCloudShapes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [source, setSource] = useState<ShapeSource>('legacy');

  // Check auth status and load cloud shapes
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
          const shapes = await listShapes();
          setCloudShapes(shapes);
          console.log(`💾 Loaded ${shapes.length} legacy shapes from cloud`);
        } else {
          const contractShapes = await listContractShapes();
          setCloudShapes(contractShapes);
          console.log(`💾 Loaded ${contractShapes.length} contract shapes from cloud`);
        }
      } catch (e: any) {
        console.error('❌ Failed to load shapes:', e);
        setError(e.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoad();
  }, [open, source]);

  if (!open) return null;

  const loadCloudShape = async (shape: any) => {
    try {
      setLoading(true);
      setError(null);
      
      let url: string;
      let filename: string;
      
      if (source === 'legacy') {
        // Legacy: Get signed URL from file_url field
        url = await getShapeSignedUrl(shape.file_url);
        filename = shape.name || 'shape';
      } else {
        // Contracts: Get signed URL using shape ID
        url = await getContractShapeSignedUrl(shape.id);
        filename = `${shape.id.substring(0, 16)}... (${shape.size || 0} cells)`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download shape');
      
      // Parse raw JSON and detect format
      const rawData = await response.json();
      
      // Convert to unified format (handles both legacy and koos.shape@1)
      const unifiedData = readShapeFormat(rawData, filename);
      
      onLoaded(unifiedData);
      onClose();
    } catch (e: any) {
      console.error('❌ Failed to load shape:', e);
      setError(e.message || 'Failed to load shape');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={head}>
          <strong style={{ color: '#1f2937' }}>Browse Shapes (Cloud Storage)</strong>
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
            koos.shape@1 Format
          </button>
        </div>

        {!isSignedIn && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
            <p style={{ marginBottom: '0.5rem', fontSize: '14px', color: '#1f2937' }}>Sign in to access your cloud shapes:</p>
            <AuthPanel />
          </div>
        )}

        <div style={{border:"1px solid #eee", borderRadius:6, padding:8, maxHeight:280, overflow:"auto"}}>
          {loading && <div style={{ color: '#1f2937' }}>Loading your shapes...</div>}
          {error && <div style={{color:"#c00", padding: '1rem'}}>{error}</div>}
          {!loading && !error && cloudShapes && cloudShapes.length > 0 && cloudShapes.map(shape => (
            <div key={shape.id} style={row}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {source === 'legacy' ? (
                  <>
                    <div style={{fontWeight:600, color: '#1f2937'}}>{shape.name}</div>
                    <div style={{fontSize:12, color:"#6b7280", marginTop:2}}>
                      {shape.metadata?.cellCount || '?'} cells • {new Date(shape.created_at).toLocaleDateString()}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{fontWeight:600, color: '#1f2937'}}>
                      {shape.metadata?.name || `Shape ${shape.id.substring(7, 15)}`}
                    </div>
                    <div style={{fontSize:12, color:"#6b7280", marginTop:2}}>
                      {shape.size || 0} cells • {shape.lattice || 'fcc'} • {new Date(shape.created_at).toLocaleDateString()}
                    </div>
                    {shape.metadata?.name && (
                      <div style={{fontSize:10, fontFamily: 'monospace', color:"#9ca3af", marginTop:2, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        {shape.id}
                      </div>
                    )}
                  </>
                )}
              </div>
              <button className="btn" onClick={() => loadCloudShape(shape)}>Load</button>
            </div>
          ))}
          {!loading && !error && isSignedIn && cloudShapes && cloudShapes.length === 0 && (
            <div style={{textAlign:"center", padding:20, color:"#9ca3af"}}>
              No shapes saved yet. Create and save your first shape!
            </div>
          )}
        </div>

        {isSignedIn && cloudShapes && cloudShapes.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#6b7280' }}>
            💾 {cloudShapes.length} {source === 'legacy' ? 'legacy' : 'contract'} shape{cloudShapes.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

const backdrop: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:50 };
const card: React.CSSProperties = { width:520, maxWidth:"95vw", background:"#ffffff", borderRadius:10, padding:12, boxShadow:"0 10px 24px rgba(0,0,0,.15)", color: "#1f2937" };
const head: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 };
const row: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 4px", borderBottom:"1px solid #f0f0f0" };
const xbtn: React.CSSProperties = { border:"1px solid #ddd", width:28, height:28, borderRadius:6, background:"#f6f7f9", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color: "#1f2937" };
