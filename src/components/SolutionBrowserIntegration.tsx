// Integration wrapper for ShapeBrowserModal with Content Studio (Solutions)
// Connects the carousel browser to the existing Three.js canvas

import React, { useState, useEffect } from 'react';
import { ShapeBrowserModal } from './ShapeBrowserModal';
import { 
  listContractSolutions, 
  getContractSolutionSignedUrl, 
  deleteContractSolution, 
  updateContractSolutionMetadata 
} from '../api/contracts';
import type { SolutionJSON } from '../pages/solution-viewer/types';
import { loadAllPieces } from '../engines/piecesLoader';
import type { PieceDB } from '../engines/dfs2';

// koos.state@1 format (what API returns)
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

interface SolutionBrowserIntegrationProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSolution: (solution: SolutionJSON, filename: string) => void;
  onLoadPreview: (solution: SolutionJSON) => Promise<void>;
}

export const SolutionBrowserIntegration: React.FC<SolutionBrowserIntegrationProps> = ({
  isOpen,
  onClose,
  onSelectSolution,
  onLoadPreview
}) => {
  const [solutionFiles, setSolutionFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load solution list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadSolutionList = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 SolutionBrowserIntegration: Loading SOLUTIONS only...');
        const contractSolutions = await listContractSolutions();
        console.log(`📊 Received ${contractSolutions.length} records from contracts_solutions table`);
        
        if (contractSolutions.length > 0) {
          console.log('📄 First record sample:', {
            id: contractSolutions[0].id?.substring(0, 12),
            file_name: contractSolutions[0].file_name,
            pieces_count: contractSolutions[0].pieces_count,
            size: contractSolutions[0].size,
            created_at: contractSolutions[0].created_at
          });
        }
        
        // Transform to ShapeFile format with metadata
        const files = contractSolutions.map((solution: any) => ({
          filename: solution.file_name || solution.metadata?.name || `Solution_${solution.id.substring(0, 8)}.json`,
          path: solution.id, // Use ID as path
          pieceCount: solution.pieces_count,
          cellCount: solution.size,
          fileSize: solution.file_size,
          dateModified: new Date(solution.created_at),
          description: solution.description || solution.metadata?.description,
          tags: solution.metadata?.tags,
          _rawSolution: solution // Store raw solution data
        }));
        
        setSolutionFiles(files);
        console.log(`💾 Loaded ${files.length} solutions for browser`);
      } catch (err: any) {
        console.error('❌ Failed to load solutions:', err);
        setError(err.message || 'Failed to load solutions');
      } finally {
        setLoading(false);
      }
    };

    loadSolutionList();
  }, [isOpen]);

  // Convert koos.state@1 to SolutionJSON format for viewer pipeline
  const convertKoosStateToSolutionJSON = (state: KoosState, piecesDb: PieceDB): SolutionJSON => {
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
  };

  // Load solution for preview in carousel
  const handleLoadSolution = async (file: any) => {
    try {
      // Get signed URL and download
      const url = await getContractSolutionSignedUrl(file.path);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to download solution');
      }
      
      const data = await response.json();
      let solutionJSON: SolutionJSON;
      
      // Detect format and convert if needed
      if (data.schema === 'koos.state' && data.version === 1) {
        // koos.state@1 format - needs conversion
        console.log(`📦 Detected koos.state@1 format, loading pieces database...`);
        const koosState = data as KoosState;
        const piecesDb = await loadAllPieces();
        console.log(`✅ Loaded ${piecesDb.size} pieces`);
        solutionJSON = convertKoosStateToSolutionJSON(koosState, piecesDb);
        console.log(`✅ Converted to SolutionJSON format`);
      } else if (data.version === 1 && data.placements && Array.isArray(data.placements)) {
        // Legacy SolutionJSON format - already has cells_ijk
        console.log(`📦 Detected legacy SolutionJSON format`);
        solutionJSON = data as SolutionJSON;
        
        // Validate that cells_ijk exists
        if (solutionJSON.placements.length > 0 && !solutionJSON.placements[0].cells_ijk) {
          throw new Error('Invalid SolutionJSON format: missing cells_ijk');
        }
      } else {
        throw new Error('Unknown solution format. Expected koos.state@1 or SolutionJSON');
      }
      
      console.log(`📦 Preview solution: ${file.filename} (${solutionJSON.placements.length} pieces)`);
      
      // Call preview handler (renders in main canvas with orientation)
      await onLoadPreview(solutionJSON);
      
      // Update file metadata if we discovered new info
      if (file.pieceCount === undefined) {
        setSolutionFiles(prev => prev.map(f => 
          f.path === file.path 
            ? { ...f, _loadedSolution: solutionJSON, pieceCount: solutionJSON.placements.length }
            : f
        ));
      }
    } catch (err) {
      console.error('❌ Failed to load solution preview:', err);
      throw err; // Let modal handle the error
    }
  };

  // User confirmed selection
  const handleSelectSolution = async (file: any) => {
    try {
      // Load the solution if not already loaded
      let solutionJSON: SolutionJSON;
      
      if (file._loadedSolution) {
        solutionJSON = file._loadedSolution;
      } else {
        const url = await getContractSolutionSignedUrl(file.path);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download solution');
        
        const data = await response.json();
        
        // Detect format and convert if needed
        if (data.schema === 'koos.state' && data.version === 1) {
          // koos.state@1 format - needs conversion
          console.log(`📦 Detected koos.state@1 format, loading pieces database...`);
          const koosState = data as KoosState;
          const piecesDb = await loadAllPieces();
          solutionJSON = convertKoosStateToSolutionJSON(koosState, piecesDb);
        } else if (data.version === 1 && data.placements && Array.isArray(data.placements)) {
          // Legacy SolutionJSON format - already has cells_ijk
          console.log(`📦 Detected legacy SolutionJSON format`);
          solutionJSON = data as SolutionJSON;
        } else {
          throw new Error('Unknown solution format');
        }
      }
      
      const filename = file.filename.replace('.json', '');
      console.log(`✅ User selected solution: ${filename}`);
      
      onSelectSolution(solutionJSON, filename);
    } catch (err) {
      console.error('❌ Failed to select solution:', err);
      alert(`Failed to load solution: ${(err as Error).message}`);
    }
  };

  // Delete solution
  const handleDelete = async (file: any) => {
    try {
      await deleteContractSolution(file.path);
      
      // Remove from local list
      setSolutionFiles(prev => prev.filter(f => f.path !== file.path));
      
      console.log(`✅ Deleted solution: ${file.filename}`);
    } catch (err) {
      console.error('❌ Failed to delete solution:', err);
      throw err;
    }
  };

  // Rename solution
  const handleRename = async (file: any, newName: string) => {
    try {
      await updateContractSolutionMetadata(file.path, {
        file_name: newName
      });
      
      // Update local list
      setSolutionFiles(prev => prev.map(f => 
        f.path === file.path 
          ? { ...f, filename: newName }
          : f
      ));
      
      console.log(`✅ Renamed solution to: ${newName}`);
    } catch (err) {
      console.error('❌ Failed to rename solution:', err);
      throw err;
    }
  };

  // Update metadata (description, tags)
  const handleUpdateMetadata = async (file: any, metadata: any) => {
    try {
      const updates: any = {};
      
      if (metadata.description !== undefined) {
        updates.description = metadata.description;
      }
      
      if (metadata.tags !== undefined) {
        // Store tags in metadata field as JSON
        updates.metadata = {
          ...file._rawSolution?.metadata,
          tags: metadata.tags
        };
      }
      
      await updateContractSolutionMetadata(file.path, updates);
      
      // Update local list
      setSolutionFiles(prev => prev.map(f => 
        f.path === file.path 
          ? { ...f, description: metadata.description, tags: metadata.tags }
          : f
      ));
      
      console.log(`✅ Updated metadata for: ${file.filename}`);
    } catch (err) {
      console.error('❌ Failed to update metadata:', err);
      throw err;
    }
  };

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fee',
        color: '#c33',
        padding: '1rem 2rem',
        borderRadius: '8px',
        zIndex: 10000
      }}>
        <p>Error loading solutions: {error}</p>
        <button onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
      </div>
    );
  }

  if (loading && solutionFiles.length === 0) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#fff',
        fontSize: '1.2rem',
        zIndex: 10000
      }}>
        Loading solutions...
      </div>
    );
  }

  return (
    <ShapeBrowserModal
      isOpen={isOpen && solutionFiles.length > 0}
      files={solutionFiles}
      initialIndex={0}
      title="Browse Solutions"
      onSelect={handleSelectSolution}
      onClose={onClose}
      onLoadShape={handleLoadSolution}
      onDelete={handleDelete}
      onRename={handleRename}
      onUpdateMetadata={handleUpdateMetadata}
    />
  );
};
