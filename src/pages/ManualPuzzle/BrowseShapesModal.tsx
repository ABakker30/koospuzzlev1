// Browse Shapes Modal for Manual Puzzle
// Dual-Format Support: Legacy & koos.shape@1

import React, { useState, useEffect } from 'react';
import type { ContainerV3 } from '../../types/lattice';
import type { ShapeListItem } from '../../services/ShapeFileService';
import { listShapes, getShapeSignedUrl } from '../../api/shapes';
import { listContractShapes, getContractShapeSignedUrl, deleteContractShape, updateContractShapeMetadata } from '../../api/contracts';
import { supabase } from '../../lib/supabase';
import AuthPanel from '../../components/AuthPanel';
import { isNewFormat } from '../../services/shapeFormatReader';

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
  const [source, setSource] = useState<'legacy' | 'contracts'>('contracts'); // Default to new format
  const [editingShape, setEditingShape] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ user_name: '', file_name: '', description: '' });

  useEffect(() => {
    if (!open) return;
    
    const checkAuthAndLoad = async () => {
      try {
        // DEV MODE: Check auth but don't require it
        const { data: { user } } = await supabase.auth.getUser();
        setIsSignedIn(!!user);
        
        setLoading(true);
        setError(null);
        
        // Load from selected source
        const shapes = source === 'contracts' 
          ? await listContractShapes()
          : await listShapes();
        
        setCloudShapes(shapes);
        console.log(`💾 Loaded ${shapes.length} ${source} shapes from cloud (dev mode)`);
      } catch (e: any) {
        console.error('❌ Failed to load shapes:', e);
        setError(e.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoad();
  }, [open, source]);

  const handleCloudShapeClick = async (shape: any) => {
    setLoading(true);
    setError(null);
    
    try {
      let url: string;
      let shapeName: string;
      
      if (source === 'legacy') {
        // Legacy: Get signed URL from file_url field
        url = await getShapeSignedUrl(shape.file_url);
        shapeName = shape.name || 'Untitled Shape';
      } else {
        // Contracts: Get signed URL using shape ID
        url = await getContractShapeSignedUrl(shape.id);
        shapeName = shape.metadata?.name || `Shape ${shape.id.substring(0, 16)}...`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download shape');
      
      const shapeFile = await response.json();
      
      // Format detection and conversion
      let cells: [number, number, number][];
      
      if (isNewFormat(shapeFile)) {
        // koos.shape@1 format
        console.log(`✅ Detected koos.shape@1 format for ${shapeName}`);
        cells = shapeFile.cells as [number, number, number][];
      } else {
        // Legacy format
        console.log(`📄 Using legacy format for ${shapeName}`);
        cells = shapeFile.cells as [number, number, number][];
      }
      
      // Convert to ContainerV3
      const container: ContainerV3 = {
        id: shape.id,
        name: shapeName,
        cells
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

  const handleDelete = async (shape: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Delete "${shape.file_name || shape.metadata?.name || shape.id.substring(0, 20)}"?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await deleteContractShape(shape.id);
      
      // Remove from local state
      setCloudShapes(prev => prev.filter(s => s.id !== shape.id));
      console.log('✅ Shape deleted:', shape.id);
    } catch (err) {
      console.error('❌ Failed to delete shape:', err);
      setError(`Failed to delete: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (shape: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingShape(shape);
    setEditForm({
      user_name: shape.user_name || '',
      file_name: shape.file_name || shape.metadata?.name || '',
      description: shape.description || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingShape) return;

    try {
      setLoading(true);
      await updateContractShapeMetadata(editingShape.id, editForm);
      
      // Update local state
      setCloudShapes(prev => prev.map(s => 
        s.id === editingShape.id 
          ? { ...s, ...editForm }
          : s
      ));
      
      setEditingShape(null);
      console.log('✅ Shape metadata updated');
    } catch (err) {
      console.error('❌ Failed to update metadata:', err);
      setError(`Failed to update: ${(err as Error).message}`);
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
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Puzzle Shapes</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Format Tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 1.5rem', borderBottom: '1px solid #eee' }}>
          <button
            onClick={() => setSource('legacy')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: source === 'legacy' ? '2px solid #6366f1' : '2px solid transparent',
              color: source === 'legacy' ? '#6366f1' : '#666',
              fontWeight: source === 'legacy' ? 600 : 400
            }}
          >
            Legacy Format
          </button>
          <button
            onClick={() => setSource('contracts')}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: source === 'contracts' ? '2px solid #6366f1' : '2px solid transparent',
              color: source === 'contracts' ? '#6366f1' : '#666',
              fontWeight: source === 'contracts' ? 600 : 400
            }}
          >
            koos.shape@1 Format
          </button>
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
                  {source === 'legacy' ? (
                    <>
                      <div style={{ fontWeight: 500 }}>{shape.name || 'Untitled Shape'}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                        {shape.metadata?.cellCount || '?'} cells • {new Date(shape.created_at).toLocaleDateString()}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>
                            {shape.file_name || shape.metadata?.name || `Shape_${shape.size}cells`}
                          </div>
                          {shape.user_name && (
                            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                              by {shape.user_name}
                            </div>
                          )}
                          {shape.description && (
                            <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                              {shape.description}
                            </div>
                          )}
                          <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                            {shape.size || '?'} cells • {shape.lattice || 'fcc'} • {new Date(shape.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
                          <button
                            onClick={(e) => handleEdit(shape, e)}
                            style={actionButtonStyle}
                            title="Edit metadata"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => handleDelete(shape, e)}
                            style={{ ...actionButtonStyle, color: '#dc2626' }}
                            title="Delete shape"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </>
                  )}
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
              💾 {cloudShapes.length} {source === 'legacy' ? 'legacy' : 'contract'} shape{cloudShapes.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Edit Metadata Modal */}
        {editingShape && (
          <div style={editModalBackdropStyle} onClick={() => setEditingShape(null)}>
            <div style={editModalStyle} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 1rem 0' }}>Edit Shape Metadata</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>File Name</label>
                <input
                  type="text"
                  value={editForm.file_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, file_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g., Shape_20cells_pyramid"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>Creator/Owner Name</label>
                <input
                  type="text"
                  value={editForm.user_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, user_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g., John Doe"
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  placeholder="About this shape..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingShape(null)} style={cancelButtonStyle}>
                  Cancel
                </button>
                <button onClick={handleSaveEdit} style={saveButtonStyle}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
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

const actionButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: '4px',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
  fontSize: '1rem',
  transition: 'all 0.15s',
  color: '#666'
};

const editModalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100
};

const editModalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  padding: '1.5rem',
  width: '90%',
  maxWidth: '500px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.875rem',
  fontFamily: 'inherit'
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500
};

const saveButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: '4px',
  background: '#6366f1',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500
};
