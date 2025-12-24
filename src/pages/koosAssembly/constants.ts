// Shared constants for KOOS Assembly

// FCC lattice: adjacent spheres (1 unit apart in IJK) are sqrt(0.5) ≈ 0.707 apart in world space
// Sphere radius = half the minimum distance between centers
export const WORLD_SPHERE_RADIUS = Math.sqrt(0.5) / 2; // ≈ 0.3535 world units

// Vertical reference planes
export const TABLE_SURFACE_Y = 0;    // Table plane (y=0, physics ground plane)
export const MAT_SURFACE_Y = 0.01;   // Mat plane (slightly above table to prevent z-fighting)

// Physics spawn height for table pieces (spawn low enough to settle quickly)
export const TABLE_PIECE_SPAWN_Y = WORLD_SPHERE_RADIUS + 0.15; // Low drop for minimal bouncing

// Target rest height for table pieces (visual reference + sanity checks)
export const TABLE_PIECE_REST_Y = TABLE_SURFACE_Y + WORLD_SPHERE_RADIUS; // Sphere bottoms touch table

export const EXPLODE_DIST = 2.5 * WORLD_SPHERE_RADIUS; // Explode distance for pieces
