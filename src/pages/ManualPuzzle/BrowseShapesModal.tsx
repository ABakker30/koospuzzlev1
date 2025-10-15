// Browse Shapes Modal for Manual Puzzle
// Cloud Storage Only

import React, { useState, useEffect } from 'react';
import type { ContainerV3 } from '../../types/lattice';
import type { ShapeListItem } from '../../services/ShapeFileService';
import { listShapes, getShapeSignedUrl } from '../../api/shapes';
import { supabase } from '../../lib/supabase';
import AuthPanel from '../../components/AuthPanel';

interface BrowseShapesModalProps {
  open: boolean;
  onClose: () => void;
  onLoaded: (container: ContainerV3, item?: ShapeListItem) => void;
}

export const BrowseShapesModal: React.FC<BrowseShapesModalProps> = ({
  open,
  onClose,
  onLoaded
}) => {
  const [cloudShapes, setCloudShapes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    if (!open) return;
    
    const checkAuthAndLoad = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setIsSignedIn(!!user);
        
        if (!user) {
          setError('Please sign in to load shapes from cloud');
          return;
        }
        
        setLoading(true);
        setError(null);
        const shapes = await listShapes();
        setCloudShapes(shapes);
        console.log(`💾 Loaded ${shapes.length} shapes from cloud`);
      } catch (e: any) {
        console.error('❌ Failed to load shapes:', e);
        setError(e.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoad();
  }, [open]);

  const handleCloudShapeClick = async (shape: any) => {
    setLoading(true);
    setError(null);
    
    try {
      // Get signed URL and fetch the file
      const url = await getShapeSignedUrl(shape.file_url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download shape');
      
      const shapeFile = await response.json();
      
      // Convert to ContainerV3
      const container: ContainerV3 = {
        id: shape.id,
        name: shape.name,
        cells: shapeFile.cells as [number, number, number][]
      };
      
      console.log(`✅ Loaded shape: ${container.name} (${container.cells.length} cells)`);
      onLoaded(container);
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
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Shapes (Cloud Storage)</h3>
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
              Loading your shapes...
            </div>
          )}

          {!loading && !error && cloudShapes && cloudShapes.length > 0 && (
            <div style={listStyle}>
              {cloudShapes.map((shape) => (
                <div
                  key={shape.id}
                  style={listItemStyle}
                  onClick={() => handleCloudShapeClick(shape)}
                >
                  <div style={{ fontWeight: 500 }}>{shape.name}</div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                    {shape.metadata?.cellCount || '?'} cells • {new Date(shape.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && isSignedIn && cloudShapes && cloudShapes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No shapes saved yet. Upload shapes from the batch upload page!
            </div>
          )}

          {isSignedIn && cloudShapes && cloudShapes.length > 0 && (
            <div style={{ padding: '0 1rem 1rem', fontSize: '12px', color: '#666' }}>
              💾 {cloudShapes.length} shape{cloudShapes.length !== 1 ? 's' : ''} in your cloud storage
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
  transition: 'background-color 0.15s'
};

const errorStyle: React.CSSProperties = {
  backgroundColor: '#fee',
  color: '#c33',
  padding: '0.75rem 1rem',
  margin: '1rem',
  borderRadius: '4px',
  fontSize: '0.875rem'
};
