// src/components/BrowseContractSolutionsModal.tsx
// Simple modal for loading koos.state@1 format solutions only
// Used by Solution Viewer (legacy format deprecated)

import React, { useEffect, useState } from "react";
import { listContractSolutions, getContractSolutionSignedUrl, deleteContractSolution, updateContractSolutionMetadata } from "../api/contracts";
import { loadAllPieces } from "../engines/piecesLoader";
import type { PieceDB } from "../engines/dfs2";

interface KoosStatePlacement {
  pieceId: string;
  anchorIJK: [number, number, number];
  orientationIndex: number;
}

interface KoosState {
  schema: 'koos.state';
  version: 1;
  id: string;
  shapeRef: string;
  placements: KoosStatePlacement[];
}

// Legacy SolutionJSON format (what the viewer pipeline expects)
interface SolutionJSON {
  version: number;
  containerCidSha256: string;
  lattice: string;
  piecesUsed: Record<string, number>;
  placements: Array<{
    piece: string;
    ori: number;
    t: [number, number, number];
    cells_ijk: [number, number, number][];
  }>;
  sid_state_sha256: string;
  sid_route_sha256: string;
  sid_state_canon_sha256: string;
  mode: string;
  solver: {
    engine: string;
    seed: number;
    flags: Record<string, boolean>;
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onLoaded: (solution: SolutionJSON, filename: string, koosState?: KoosState) => void;
};

export const BrowseContractSolutionsModal: React.FC<Props> = ({ open, onClose, onLoaded }) => {
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);
  const [solutions, setSolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSolution, setEditingSolution] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ user_name: '', file_name: '', description: '' });

  // Load solutions when modal opens
  useEffect(() => {
    if (!open) return;
    
    const loadSolutions = async () => {
      try {
        // DEV MODE: No auth required
        
        setLoading(true);
        setError(null);
        
        const contractSolutions = await listContractSolutions();
        setSolutions(contractSolutions);
        console.log(`💾 Loaded ${contractSolutions.length} koos.state@1 solutions from cloud`);
      } catch (e: any) {
        console.error('❌ Failed to load solutions:', e);
        setError(e.message || 'Failed to load solutions');
      } finally {
        setLoading(false);
      }
    };
    
    loadSolutions();
  }, [open]);

  const handleSolutionClick = async (solution: any) => {
    setLoading(true);
    setError(null);
    
    try {
      // Get signed URL using solution ID
      const url = await getContractSolutionSignedUrl(solution.id);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download solution');
      
      const koosState = await response.json() as KoosState;
      
      // Validate format
      if (koosState.schema !== 'koos.state' || koosState.version !== 1) {
        throw new Error('Invalid solution format. Expected koos.state@1');
      }
      
      console.log(`✅ Loaded koos.state@1: ${koosState.id.substring(0, 24)}... (${koosState.placements.length} placements)`);
      
      // Convert to legacy format for viewer pipeline
      console.log('📦 Loading piece database for conversion...');
      const piecesDb = await loadAllPieces();
      console.log(`✅ Loaded ${piecesDb.size} pieces`);
      
      const legacySolution = convertKoosStateToLegacy(koosState, piecesDb);
      
      const filename = `${solution.id}.solution.json`;
      onLoaded(legacySolution, filename, koosState); // Pass original koos.state@1
      onClose();
    } catch (err) {
      console.error('❌ Failed to load solution:', err);
      setError(`Failed to load solution: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (solution: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Delete "${solution.file_name || solution.metadata?.name || solution.id.substring(0, 20)}"?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await deleteContractSolution(solution.id);
      setSolutions(prev => prev.filter(s => s.id !== solution.id));
      console.log('✅ Solution deleted:', solution.id);
    } catch (err) {
      console.error('❌ Failed to delete solution:', err);
      setError(`Failed to delete: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSolution) return;

    try {
      setLoading(true);
      await updateContractSolutionMetadata(editingSolution.id, editForm);
      setSolutions(prev => prev.map(s => s.id === editingSolution.id ? { ...s, ...editForm } : s));
      setEditingSolution(null);
      console.log('✅ Solution metadata updated');
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
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Puzzle Solutions</h3>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>

          {error && (
            <div style={errorStyle}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading solutions...
            </div>
          )}

          {!loading && !error && solutions.length > 0 && (
            <div style={listStyle}>
              {solutions.map((sol) => (
                <div
                  key={sol.id}
                  style={listItemStyle}
                  onClick={() => handleSolutionClick(sol)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {sol.file_name || sol.metadata?.name || `Solution_${sol.placements?.length || 0}pieces`}
                      </div>
                      {sol.user_name && (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                          by {sol.user_name}
                        </div>
                      )}
                      {sol.description && (
                        <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          {sol.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                        {sol.placements?.length || 0} pieces • {sol.is_full ? 'Full' : 'Partial'} • {new Date(sol.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingSolution(sol); setEditForm({ user_name: sol.user_name || '', file_name: sol.file_name || sol.metadata?.name || '', description: sol.description || '' }); }}
                        style={actionButtonStyle}
                        title="Edit metadata"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleDelete(sol, e)}
                        style={{ ...actionButtonStyle, color: '#dc2626' }}
                        title="Delete solution"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && solutions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No solutions saved yet. Solve puzzles and save solutions!
            </div>
          )}

          {solutions.length > 0 && (
            <div style={{ padding: '0 1rem 1rem', fontSize: '12px', color: '#666' }}>
              💾 {solutions.length} solution{solutions.length !== 1 ? 's' : ''} available
            </div>
          )}
        </div>

        {/* Edit Metadata Modal */}
        {editingSolution && (
          <div style={editModalBackdropStyle} onClick={() => setEditingSolution(null)}>
            <div style={editModalStyle} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 1rem 0' }}>Edit Solution Metadata</h3>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>File Name</label>
                <input
                  type="text"
                  value={editForm.file_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, file_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g., Solution_Pyramid_Full"
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
                  placeholder="About this solution..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingSolution(null)} style={cancelButtonStyle}>
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

// Convert koos.state@1 to legacy SolutionJSON format for viewer pipeline
function convertKoosStateToLegacy(state: KoosState, piecesDb: PieceDB): SolutionJSON {
  const placements = state.placements.map(placement => {
    const [i, j, k] = placement.anchorIJK;
    
    // Get the piece orientations from database
    const orientations = piecesDb.get(placement.pieceId);
    const orientation = orientations?.[placement.orientationIndex];
    
    // Compute cells_ijk by adding translation to each oriented cell
    const cells_ijk = orientation?.cells.map((cell) => [
      cell[0] + i,
      cell[1] + j,
      cell[2] + k
    ] as [number, number, number]) || [];
    
    if (!orientation) {
      console.warn(`⚠️ Missing orientation for piece ${placement.pieceId}, index ${placement.orientationIndex}`);
    }
    
    return {
      piece: placement.pieceId,
      ori: placement.orientationIndex,
      t: placement.anchorIJK,
      cells_ijk
    };
  });
  
  // Build piecesUsed count
  const piecesUsed: Record<string, number> = {};
  state.placements.forEach(p => {
    piecesUsed[p.pieceId] = (piecesUsed[p.pieceId] || 0) + 1;
  });
  
  return {
    version: 1,
    containerCidSha256: state.shapeRef,
    lattice: 'fcc',
    piecesUsed,
    placements,
    sid_state_sha256: state.id || '',
    sid_route_sha256: '',
    sid_state_canon_sha256: '',
    mode: 'koos.state@1',
    solver: {
      engine: 'unknown',
      seed: 0,
      flags: {}
    }
  };
}

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
  maxWidth: '700px',
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
