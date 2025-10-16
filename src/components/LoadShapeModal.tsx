// src/components/LoadShapeModal.tsx - Cloud Storage Only
import React, { useEffect, useState } from "react";
import { ShapeFile } from "../services/ShapeFileService";
import { listShapes, getShapeSignedUrl } from "../api/shapes";
import { supabase } from "../lib/supabase";
import AuthPanel from "./AuthPanel";

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
        const shapes = await listShapes();
        setCloudShapes(shapes);
        console.log(`💾 Loaded ${shapes.length} shapes from cloud (dev mode)`);
      } catch (e: any) {
        console.error('❌ Failed to load shapes:', e);
        setError(e.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoad();
  }, [open]);

  if (!open) return null;

  const loadCloudShape = async (shape: any) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get signed URL and fetch the file
      const url = await getShapeSignedUrl(shape.file_url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download shape');
      
      const file: ShapeFile = await response.json();
      onLoaded(file);
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
              <div>
                <div style={{fontWeight:600, color: '#1f2937'}}>{shape.name}</div>
                <div style={{fontSize:12, color:"#6b7280", marginTop:2}}>
                  {shape.metadata?.cellCount || '?'} cells • {new Date(shape.created_at).toLocaleDateString()}
                </div>
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
            💾 {cloudShapes.length} shape{cloudShapes.length !== 1 ? 's' : ''} in your cloud storage
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
