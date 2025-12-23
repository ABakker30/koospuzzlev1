// Shared constants for KOOS Assembly

// FCC lattice: adjacent spheres (1 unit apart in IJK) are sqrt(0.5) ≈ 0.707 apart in world space
// Sphere radius = half the minimum distance between centers
export const WORLD_SPHERE_RADIUS = Math.sqrt(0.5) / 2; // ≈ 0.3535 world units

// Mat and table dimensions
export const MAT_TOP_Y = 0.01; // Mat surface plane (world Y coordinate, matches matMesh.position.y)
export const TABLE_PIECE_REST_Y = MAT_TOP_Y + WORLD_SPHERE_RADIUS + 0.02; // Where table pieces rest
export const EXPLODE_DIST = 2.5 * WORLD_SPHERE_RADIUS; // Explode distance for pieces
