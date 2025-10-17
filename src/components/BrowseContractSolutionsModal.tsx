// src/components/BrowseContractSolutionsModal.tsx
// Simple modal for loading koos.state@1 format solutions only
// Used by Solution Viewer (legacy format deprecated)

import React, { useEffect, useState } from "react";
import { listContractSolutions, getContractSolutionSignedUrl } from "../api/contracts";
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
  const [solutions, setSolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Solutions</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
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
                  <div style={{ fontWeight: 500 }}>
                    {sol.metadata?.name || `${sol.id.substring(0, 16)}...`}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#999', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sol.id}.solution.json
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                    {sol.placements?.length || 0} pieces • {sol.is_full ? 'Full' : 'Partial'} • {new Date(sol.created_at).toLocaleDateString()}
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
