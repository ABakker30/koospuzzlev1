// src/services/shapeFormatReader.ts
// Format detection and conversion for shape files (legacy vs koos.shape@1)

import type { ShapeFile } from './ShapeFileService';

/**
 * koos.shape@1 contract format
 */
export interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string; // sha256:...
  lattice: 'fcc';
  cells: [number, number, number][];
}

/**
 * Detect if the loaded JSON is a koos.shape@1 file
 */
function isKoosShape(data: any): data is KoosShape {
  return (
    data &&
    typeof data === 'object' &&
    data.schema === 'koos.shape' &&
    data.version === 1 &&
    data.lattice === 'fcc' &&
    Array.isArray(data.cells)
  );
}

/**
 * Convert koos.shape@1 to legacy ShapeFile format
 */
function convertKoosShapeToLegacy(shape: KoosShape): ShapeFile {
  return {
    schema: 'ab.container.v2',
    name: `Shape ${shape.id.substring(7, 15)}`, // Use first 8 chars of hash
    cid: shape.id, // Store koos.shape ID as CID
    cells: shape.cells,
    meta: {
      originalFormat: 'koos.shape@1',
      lattice: shape.lattice
    }
  };
}

/**
 * Read shape from any format and return unified ShapeFile
 * 
 * @param data - Raw JSON object from file
 * @param filename - Original filename (for logging)
 * @returns ShapeFile compatible with editor
 */
export function readShapeFormat(data: any, filename: string): ShapeFile {
  if (isKoosShape(data)) {
    console.log(`🔄 shapeFormatReader: Detected koos.shape@1 format for ${filename}`);
    console.log(`   id: ${data.id}, cells: ${data.cells.length}`);
    
    const converted = convertKoosShapeToLegacy(data);
    
    console.log(`✅ shapeFormatReader: Converted koos.shape@1 → legacy format`);
    return converted;
  }
  
  // Legacy format - pass through unchanged
  console.log(`📄 shapeFormatReader: Using legacy format for ${filename}`);
  return data as ShapeFile;
}

/**
 * Convert cells to koos.shape@1 format
 * 
 * @param cells - Array of [i, j, k] tuples
 * @returns KoosShape with computed ID
 */
export async function createKoosShape(cells: [number, number, number][]): Promise<KoosShape> {
  // Import canonicalization functions
  const { canonicalizeShape, computeShapeId } = await import('./shapeCanonical');
  
  // Canonicalize cells (sort and dedupe)
  const canonical = canonicalizeShape({
    schema: 'koos.shape',
    version: 1,
    lattice: 'fcc',
    cells
  });
  
  // Compute content-addressed ID
  const id = await computeShapeId(canonical);
  
  return {
    ...canonical,
    id
  };
}

/**
 * Check if a shape was loaded from koos.shape@1 format
 */
export function isNewFormat(shapeFile: ShapeFile): boolean {
  return shapeFile.meta?.originalFormat === 'koos.shape@1';
}
