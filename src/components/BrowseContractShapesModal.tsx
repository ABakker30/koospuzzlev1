// src/components/BrowseContractShapesModal.tsx
// Simple modal for loading koos.shape@1 format shapes only
// Used by Shape Editor (legacy format deprecated)

import React, { useEffect, useState } from "react";
import { listContractShapes, getContractShapeSignedUrl } from "../api/contracts";
import { supabase } from "../lib/supabase";
import AuthPanel from "./AuthPanel";

interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (shape: KoosShape) => void;
};

export const BrowseContractShapesModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [shapes, setShapes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Load shapes when modal opens
  useEffect(() => {
    if (!open) return;
    
    const loadShapes = async () => {
      try {
        // DEV MODE: Check auth but don't require it
        const { data: { user } } = await supabase.auth.getUser();
        setIsSignedIn(!!user);
        
        setLoading(true);
        setError(null);
        
        const contractShapes = await listContractShapes();
        setShapes(contractShapes);
        console.log(`💾 Loaded ${contractShapes.length} koos.shape@1 shapes from cloud`);
      } catch (e: any) {
        console.error('❌ Failed to load shapes:', e);
        setError(e.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };
    
    loadShapes();
  }, [open]);

  const handleShapeClick = async (shape: any) => {
    setLoading(true);
    setError(null);
    
    try {
      // Get signed URL using shape ID
      const url = await getContractShapeSignedUrl(shape.id);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download shape');
      
      const koosShape = await response.json() as KoosShape;
      
      // Validate format
      if (koosShape.schema !== 'koos.shape' || koosShape.version !== 1) {
        throw new Error('Invalid shape format. Expected koos.shape@1');
      }
      
      console.log(`✅ Loaded koos.shape@1: ${koosShape.id.substring(0, 24)}... (${koosShape.cells.length} cells)`);
      onLoaded(koosShape);
      onClose();
    } catch (err) {
      console.error('❌ Failed to load shape:', err);
      setError(`Failed to load shape: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Shapes (koos.shape@1)</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {!isSignedIn && (
            <div style={{ padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '6px', margin: '1rem' }}>
              <p style={{ marginBottom: '0.5rem', fontSize: '14px' }}>Sign in to access your cloud shapes:</p>
              <AuthPanel />
            </div>
          )}

          {error && (
            <div style={errorStyle}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading shapes...
            </div>
          )}

          {!loading && !error && shapes.length > 0 && (
            <div style={listStyle}>
              {shapes.map((shape) => (
                <div
                  key={shape.id}
                  style={listItemStyle}
                  onClick={() => handleShapeClick(shape)}
                >
                  <div style={{ fontWeight: 500 }}>
                    {shape.metadata?.name || `Shape ${shape.id.substring(0, 16)}...`}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#999', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {shape.id}.shape.json
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                    {shape.size || '?'} cells • {shape.lattice || 'fcc'} • {new Date(shape.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && shapes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No shapes saved yet. Create and save shapes in the Shape Editor!
            </div>
          )}

          {shapes.length > 0 && (
            <div style={{ padding: '0 1rem 1rem', fontSize: '12px', color: '#666' }}>
              💾 {shapes.length} shape{shapes.length !== 1 ? 's' : ''} available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  width: '90%',
  maxWidth: '600px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 1.5rem',
  borderBottom: '1px solid #eee'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  padding: '0.25rem 0.5rem',
  lineHeight: 1
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  minHeight: '300px'
};

const listStyle: React.CSSProperties = {
  padding: '0.5rem'
};

const listItemStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  cursor: 'pointer',
  borderRadius: '4px',
  transition: 'background-color 0.15s',
  border: '1px solid transparent'
};

const errorStyle: React.CSSProperties = {
  backgroundColor: '#fee',
  color: '#c33',
  padding: '0.75rem 1rem',
  margin: '1rem',
  borderRadius: '4px',
  fontSize: '0.875rem'
};
