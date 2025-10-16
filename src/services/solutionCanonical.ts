// src/services/solutionCanonical.ts
// Canonicalization and hashing for koos.state@1 format
// Per /public/data/contracts/id-hashing.md

export interface KoosStatePlacement {
  pieceId: string;
  anchorIJK: [number, number, number];
  orientationIndex: number;
}

export interface KoosState {
  schema: 'koos.state';
  version: 1;
  id: string; // Content-addressed ID (sha256:...)
  shapeRef: string; // sha256:... of the shape
  placements: KoosStatePlacement[];
}

/**
 * Canonicalize placements for a koos.state@1 solution
 * - Upper-case pieceId
 * - Remove duplicates (same pieceId + anchorIJK + orientationIndex)
 * - Sort by: pieceId, then anchorIJK (i, j, k), then orientationIndex
 */
export function canonicalizePlacements(
  placements: KoosStatePlacement[]
): KoosStatePlacement[] {
  // Upper-case pieceId
  const normalized = placements.map(p => ({
    pieceId: p.pieceId.toUpperCase(),
    anchorIJK: p.anchorIJK as [number, number, number],
    orientationIndex: p.orientationIndex
  }));
  
  // Remove duplicates
  const seen = new Set<string>();
  const unique: KoosStatePlacement[] = [];
  
  for (const p of normalized) {
    const key = `${p.pieceId}|${p.anchorIJK[0]},${p.anchorIJK[1]},${p.anchorIJK[2]}|${p.orientationIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  
  // Sort lexicographically: pieceId → anchorIJK → orientationIndex
  unique.sort((a, b) => {
    // Compare pieceId (alphabetical)
    if (a.pieceId !== b.pieceId) {
      return a.pieceId.localeCompare(b.pieceId);
    }
    
    // Compare anchorIJK (i, then j, then k)
    if (a.anchorIJK[0] !== b.anchorIJK[0]) return a.anchorIJK[0] - b.anchorIJK[0];
    if (a.anchorIJK[1] !== b.anchorIJK[1]) return a.anchorIJK[1] - b.anchorIJK[1];
    if (a.anchorIJK[2] !== b.anchorIJK[2]) return a.anchorIJK[2] - b.anchorIJK[2];
    
    // Compare orientationIndex
    return a.orientationIndex - b.orientationIndex;
  });
  
  return unique;
}

/**
 * Canonicalize a koos.state@1 solution (without id field)
 */
export function canonicalizeSolution(
  solution: Omit<KoosState, 'id'>
): Omit<KoosState, 'id'> {
  return {
    schema: 'koos.state',
    version: 1,
    shapeRef: solution.shapeRef,
    placements: canonicalizePlacements(solution.placements)
  };
}

/**
 * Compute the content-addressed ID for a koos.state@1 solution
 * Uses SHA-256 hash of canonical JSON (alphabetical keys, excluding id)
 */
export async function computeSolutionId(
  solution: Omit<KoosState, 'id'>
): Promise<string> {
  // Canonicalize first
  const canonical = canonicalizeSolution(solution);
  
  // Serialize to JSON with alphabetical keys at every level
  const sortedPlacements = canonical.placements.map(p => ({
    anchorIJK: p.anchorIJK,
    orientationIndex: p.orientationIndex,
    pieceId: p.pieceId
  }));
  
  const canonicalJson = JSON.stringify({
    placements: sortedPlacements,
    schema: canonical.schema,
    shapeRef: canonical.shapeRef,
    version: canonical.version
  });
  
  // Compute SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256:${hashHex}`;
}

/**
 * Verify that a solution's ID matches its content
 */
export async function verifySolutionId(solution: KoosState): Promise<boolean> {
  const { id, ...content } = solution;
  const canonical = canonicalizeSolution(content);
  const computedId = await computeSolutionId(canonical);
  return computedId === id;
}

/**
 * Create a complete koos.state@1 solution with computed ID
 */
export async function createKoosSolution(
  shapeRef: string,
  placements: KoosStatePlacement[]
): Promise<KoosState> {
  // Canonicalize placements
  const canonical = canonicalizeSolution({
    schema: 'koos.state',
    version: 1,
    shapeRef,
    placements
  });
  
  // Compute content-addressed ID
  const id = await computeSolutionId(canonical);
  
  return {
    ...canonical,
    id
  };
}
