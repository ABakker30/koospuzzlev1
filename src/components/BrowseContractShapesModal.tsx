// src/components/BrowseContractShapesModal.tsx
// Simple modal for loading koos.shape@1 format shapes only
// Used by Shape Editor (legacy format deprecated)

import React, { useEffect, useState } from "react";
import { listContractShapes, getContractShapeSignedUrl, deleteContractShape, updateContractShapeMetadata } from "../api/contracts";

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
  onLoaded: (shape: KoosShape, shapeName?: string) => void;
};

export const BrowseContractShapesModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);
  const [shapes, setShapes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingShape, setEditingShape] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ user_name: '', file_name: '', description: '' });

  // Load shapes when modal opens
  useEffect(() => {
    if (!open) return;
    
    const loadShapes = async () => {
      try {
        // DEV MODE: No auth required
        
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
      
      // Extract shape name from metadata
      const shapeName = shape.metadata?.name || `Shape_${koosShape.cells.length}cells`;
      console.log(`📝 Shape name: ${shapeName}`);
      
      onLoaded(koosShape, shapeName);
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
      setShapes(prev => prev.filter(s => s.id !== shape.id));
      console.log('✅ Shape deleted:', shape.id);
    } catch (err) {
      console.error('❌ Failed to delete shape:', err);
      setError(`Failed to delete: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingShape) return;

    try {
      setLoading(true);
      await updateContractShapeMetadata(editingShape.id, editForm);
      setShapes(prev => prev.map(s => s.id === editingShape.id ? { ...s, ...editForm } : s));
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
    <div 
      style={backdropStyle} 
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setMouseDownOnBackdrop(true);
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop) {
          onClose();
        }
        setMouseDownOnBackdrop(false);
      }}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Puzzle Shapes</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>

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
                        onClick={(e) => { e.stopPropagation(); setEditingShape(shape); setEditForm({ user_name: shape.user_name || '', file_name: shape.file_name || shape.metadata?.name || '', description: shape.description || '' }); }}
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
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }}
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
  backgroundColor: 'transparent',
  pointerEvents: 'none',
  zIndex: 2000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  width: '90%',
  maxWidth: '600px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'all',
  border: '1px solid #d1d5db',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
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
  zIndex: 2100
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
