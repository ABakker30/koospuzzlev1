// formatReader.ts
// Detects and converts both legacy and koos.state@1 solution formats
// to the unified SolutionJSON format expected by the viewer pipeline

import type { SolutionJSON } from '../types';
import { loadAllPieces } from '../../../engines/piecesLoader';
import type { PieceDB } from '../../../engines/dfs2';

/**
 * koos.state@1 contract format
 */
interface KoosState {
  schema: 'koos.state';
  version: 1;
  id?: string;
  shapeRef: string;
  placements: Array<{
    pieceId: string;
    anchorIJK: [number, number, number];
    orientationIndex: number;
  }>;
}

/**
 * Detect if the loaded JSON is a koos.state@1 file
 */
function isKoosState(data: any): data is KoosState {
  return (
    data &&
    typeof data === 'object' &&
    data.schema === 'koos.state' &&
    data.version === 1 &&
    Array.isArray(data.placements)
  );
}

/**
 * Convert koos.state@1 to legacy SolutionJSON format
 * 
 * Key transformations:
 * - pieceId → piece
 * - anchorIJK → t (translation)
 * - orientationIndex → ori
 * - Reconstruct cells_ijk using piece database and orientation
 */
async function convertKoosStateToLegacy(state: KoosState, piecesDb: PieceDB): Promise<SolutionJSON> {
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
    containerCidSha256: state.shapeRef, // Use shapeRef as container ID
    lattice: 'fcc', // koos.state assumes FCC
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

/**
 * Read solution from any format and return unified SolutionJSON
 * 
 * @param data - Raw JSON object from file
 * @param filename - Original filename (for logging)
 * @returns SolutionJSON compatible with viewer pipeline
 */
export async function readSolutionFormat(data: any, filename: string): Promise<SolutionJSON> {
  if (isKoosState(data)) {
    console.log(`🔄 formatReader: Detected koos.state@1 format for ${filename}`);
    console.log(`   shapeRef: ${data.shapeRef}, placements: ${data.placements.length}`);
    
    // Load piece database to get oriented cells
    console.log('📦 Loading piece database...');
    const piecesDb = await loadAllPieces();
    console.log(`✅ Loaded ${piecesDb.size} pieces`);
    
    const converted = await convertKoosStateToLegacy(data, piecesDb);
    
    console.log(`✅ formatReader: Converted koos.state@1 → legacy format`);
    return converted;
  }
  
  // Legacy format - pass through unchanged
  console.log(`📄 formatReader: Using legacy format for ${filename}`);
  return data as SolutionJSON;
}
