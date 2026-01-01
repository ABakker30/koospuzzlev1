import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PhysicsSettings } from './PhysicsSettingsModal';

// Material properties - increased restitution for visible bouncing
const MATERIALS = {
  // Hard ground/table surface
  ground: {
    friction: 0.5,
    restitution: 0.3,  // Allow some bounce
  },
  // Silicone rubber placemat
  placemat: {
    friction: 0.5,
    restitution: 0.4,  // Rubber-like bounce
  },
  // ABS plastic puzzle pieces
  puzzlePiece: {
    friction: 0.3,
    restitution: 0.5,  // Bouncy plastic
  },
};

// Stored transform for restoration
export interface StoredTransform {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}

// Piece physics data
export interface PiecePhysicsData {
  id: string;
  rigidBody: RAPIER.RigidBody;
  spherePositions: THREE.Vector3[]; // Local positions of spheres within piece
  originalTransform: StoredTransform;
  threeGroup: THREE.Group | null;
}

// Default velocity thresholds for "settled" detection (used if no settings provided)
const DEFAULT_SETTLED_LINEAR_VELOCITY = 0.005;
const DEFAULT_SETTLED_ANGULAR_VELOCITY = 0.005;

export class PhysicsService {
  private static instance: PhysicsService | null = null;
  private rapier: typeof RAPIER | null = null;
  private world: RAPIER.World | null = null;
  private groundBody: RAPIER.RigidBody | null = null;
  private placematBody: RAPIER.RigidBody | null = null;
  private pieces: Map<string, PiecePhysicsData> = new Map();
  private isInitialized = false;
  private simulationRunning = false;
  
  // Surface tracking for proper placement
  private groundTopY: number = 0;
  private placematTopY: number = 0;
  private placematRadius: number = 3.0;
  
  // Fixed timestep accumulator for substeps
  private acc: number = 0;
  private readonly fixedDt: number = 1 / 60;
  
  // Current physics settings (can be updated)
  private settings: PhysicsSettings | null = null;

  private constructor() {}

  static getInstance(): PhysicsService {
    if (!PhysicsService.instance) {
      PhysicsService.instance = new PhysicsService();
    }
    return PhysicsService.instance;
  }

  // Fully destroy and reset the singleton - allows true re-initialization
  static destroyInstance(): void {
    if (PhysicsService.instance) {
      PhysicsService.instance.destroy();
      PhysicsService.instance = null;
    }
  }

  async initialize(settings?: PhysicsSettings): Promise<void> {
    if (this.isInitialized) return;
    
    this.settings = settings || null;
    
    console.log('🔧 [PHYSICS] Initializing Rapier...');
    await RAPIER.init();
    this.rapier = RAPIER;
    
    // Create world with gravity (use settings if provided)
    const gravityMag = settings?.gravity ?? 9.81;
    const gravity = { x: 0.0, y: -gravityMag, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    
    // Increase solver iterations for better contact resolution (reduces rocking/penetration)
    // Higher value = more stable compound bodies but slower
    try {
      const params = (this.world as any).integrationParameters;
      params.numSolverIterations = 40;
      params.numAdditionalFrictionIterations = 8;
      // Aggressive error correction to prevent slow sinking
      params.erp = 0.9; // Error reduction parameter (0-1, higher = more aggressive correction)
      params.allowedLinearError = 0.0001; // Minimal allowed penetration (0.1mm)
      console.log('✅ [PHYSICS] Solver: 40 iters, erp=0.9, allowedError=0.1mm');
    } catch (e) {
      console.log('⚠️ [PHYSICS] Could not set all integration params:', e);
    }
    
    this.isInitialized = true;
    console.log('✅ [PHYSICS] Rapier initialized, gravity:', gravityMag);
  }
  
  // Update settings reference
  setSettings(settings: PhysicsSettings): void {
    this.settings = settings;
  }

  isReady(): boolean {
    return this.isInitialized && this.world !== null;
  }

  getWorld(): RAPIER.World | null {
    return this.world;
  }

  // Create ground plane - uses floorTopY to match visible floor exactly
  createGroundPlane(placematBounds: THREE.Box3, floorTopY?: number, sphereRadius: number = 0.0125): void {
    if (!this.world || !this.rapier) {
      console.error('[PHYSICS] World not initialized');
      return;
    }

    const center = new THREE.Vector3();
    placematBounds.getCenter(center);
    const size = new THREE.Vector3();
    placematBounds.getSize(size);

    // Use settings or defaults
    const groundHalfY = this.settings?.groundThickness ?? 0.5;
    const groundExtent = this.settings?.groundExtent ?? 5.0;
    
    // Use explicit floorTopY if provided, otherwise fall back to placemat-based calculation
    if (floorTopY !== undefined) {
      this.groundTopY = floorTopY;
    } else {
      const groundOffset = this.settings?.groundOffset ?? 0.05;
      this.groundTopY = placematBounds.min.y - groundOffset;
    }
    const groundCenterY = this.groundTopY - groundHalfY;

    // Create fixed rigid body for ground (at center of slab)
    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(center.x, groundCenterY, center.z);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);

    // Contact skin - zero for hard surface (no penetration)
    const contactSkin = 0;

    // Calculate actual ground size to cover removal circle
    // Removal radius = placematRadius + (sphereRadius * removalMargin)
    // Ground should extend beyond that
    const placematDiagonal = Math.sqrt(size.x * size.x + size.z * size.z);
    const estimatedRemovalRadius = placematDiagonal / 2 + sphereRadius * 10; // generous margin
    const groundHalfExtent = Math.max(size.x * groundExtent, size.z * groundExtent, estimatedRemovalRadius * 1.5);
    
    // Create collider - extends well beyond removal circle
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(
      groundHalfExtent,
      groundHalfY,
      groundHalfExtent
    )
      .setFriction(MATERIALS.ground.friction)
      .setRestitution(MATERIALS.ground.restitution)
      .setContactSkin(contactSkin);
    
    this.world.createCollider(groundColliderDesc, this.groundBody);
    
    console.log(`✅ [PHYSICS] Ground: topY=${this.groundTopY.toFixed(3)}, halfExtent=${groundHalfExtent.toFixed(2)}, contactSkin=${contactSkin.toFixed(4)}`);
  }

  // Create placemat physics body (silicone rubber) - slab at TOP surface only
  // Account for dimples: spheres should rest IN dimples, not ON top of mat
  // Dimple depth ≈ sphere radius, so lower physics surface by sphere radius
  createPlacematCollider(placematBounds: THREE.Box3, sphereRadius: number = 0.0125): void {
    if (!this.world || !this.rapier) {
      console.error('[PHYSICS] World not initialized');
      return;
    }

    const center = new THREE.Vector3();
    placematBounds.getCenter(center);
    const size = new THREE.Vector3();
    placematBounds.getSize(size);

    // Dimple depth: spheres sit IN dimples, not on top of mat surface
    // Dimple depth is about 60% of sphere radius (half-sphere indent)
    const dimpleDepth = sphereRadius * 0.6;
    
    // Store placemat top Y (adjusted for dimples)
    this.placematTopY = placematBounds.max.y - dimpleDepth;
    console.log(`🕳️ [PHYSICS] Dimple adjustment: mat surface lowered by ${(dimpleDepth * 1000).toFixed(1)}mm`);
    
    // Store placemat XZ radius (half-diagonal) for removal circle
    this.placematRadius = 0.5 * Math.sqrt(size.x * size.x + size.z * size.z);

    // Use settings or fallback to sphere-based thickness
    const thickness = this.settings?.placematThickness ?? Math.max(sphereRadius * 0.6, 0.15);
    const halfY = thickness / 2;
    const slabCenterY = this.placematTopY - halfY;

    // Create fixed rigid body for placemat (at slab center)
    const placematBodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(center.x, slabCenterY, center.z);
    this.placematBody = this.world.createRigidBody(placematBodyDesc);

    // Contact skin - zero for hard surface (no sinking)
    const contactSkin = 0;

    // Create slab collider at top surface
    const placematColliderDesc = this.rapier.ColliderDesc.cuboid(
      size.x / 2,
      halfY,
      size.z / 2
    )
      .setFriction(MATERIALS.placemat.friction)
      .setRestitution(MATERIALS.placemat.restitution)
      .setContactSkin(contactSkin);
    
    this.world.createCollider(placematColliderDesc, this.placematBody);
    
    console.log(`✅ [PHYSICS] Placemat: topY=${this.placematTopY.toFixed(4)}, thickness=${thickness.toFixed(3)}, slabCenterY=${slabCenterY.toFixed(4)}, contactSkin=${contactSkin.toFixed(4)}`);
  }

  // Create compound rigid body for a puzzle piece
  createPieceRigidBody(
    pieceId: string,
    spherePositions: THREE.Vector3[],
    sphereRadius: number,
    threeGroup: THREE.Group | null = null
  ): PiecePhysicsData | null {
    if (!this.world || !this.rapier) {
      console.error('[PHYSICS] World not initialized');
      return null;
    }

    // Calculate piece center (centroid of all spheres)
    const center = new THREE.Vector3();
    for (const pos of spherePositions) {
      center.add(pos);
    }
    center.divideScalar(spherePositions.length);

    // Store original transform
    const originalTransform: StoredTransform = {
      position: center.clone(),
      rotation: new THREE.Quaternion(),
    };

    // Create dynamic rigid body at piece center with damping from settings
    const linDamp = this.settings?.linearDamping ?? 0.05;
    const angDamp = this.settings?.angularDamping ?? 0.05;
    
    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setLinearDamping(linDamp)
      .setAngularDamping(angDamp)
      .setCanSleep(false); // CRITICAL: Disable sleeping so pieces don't freeze mid-air
    const rigidBody = this.world.createRigidBody(bodyDesc);
    
    // Enable CCD AFTER body creation (prevents tunneling)
    rigidBody.enableCcd(true);

    // Contact skin - zero for hard surface collision (no penetration/sinking)
    const contactSkin = 0;

    // Add sphere colliders at local positions (relative to center)
    // All colliders attached to same rigidBody = compound body
    const localPositions: THREE.Vector3[] = [];
    let collidersCreated = 0;
    for (const pos of spherePositions) {
      const localPos = pos.clone().sub(center);
      localPositions.push(localPos);

      // Use settings for friction/restitution if available, otherwise use defaults
      const friction = this.settings?.pieceFriction ?? MATERIALS.puzzlePiece.friction;
      const restitution = this.settings?.pieceRestitution ?? MATERIALS.puzzlePiece.restitution;
      
      const colliderDesc = this.rapier.ColliderDesc.ball(sphereRadius)
        .setTranslation(localPos.x, localPos.y, localPos.z)
        .setFriction(friction)
        .setRestitution(restitution)
        .setContactSkin(contactSkin)
        .setDensity(1.0); // Explicit density for consistent mass
      
      this.world.createCollider(colliderDesc, rigidBody);
      collidersCreated++;
    }
    
    // Verify compound body was created correctly
    const numColliders = rigidBody.numColliders();
    if (numColliders !== spherePositions.length) {
      console.error(`❌ [PHYSICS] Piece ${pieceId}: Expected ${spherePositions.length} colliders, got ${numColliders}`);
    }

    const pieceData: PiecePhysicsData = {
      id: pieceId,
      rigidBody,
      spherePositions: localPositions,
      originalTransform,
      threeGroup,
    };

    this.pieces.set(pieceId, pieceData);
    
    console.log(`✅ [PHYSICS] Piece ${pieceId} created with ${spherePositions.length} sphere colliders`);
    return pieceData;
  }

  // Offset all pieces upward for drop experiment (height in meters)
  offsetPiecesForDrop(heightOffset: number = 0.05): void {
    if (!this.world) return;

    for (const [pieceId, pieceData] of this.pieces) {
      const pos = pieceData.rigidBody.translation();
      pieceData.rigidBody.setTranslation(
        { x: pos.x, y: pos.y + heightOffset, z: pos.z },
        true // wake up body
      );
      console.log(`🔼 [PHYSICS] Piece ${pieceId} offset by ${heightOffset}m`);
    }
  }

  // Step simulation with fixed substeps (prevents tunneling)
  step(dt: number): void {
    if (!this.world) return;
    
    // Force wake all piece bodies to prevent freezing mid-air
    for (const [, pieceData] of this.pieces) {
      pieceData.rigidBody.wakeUp();
    }
    
    this.acc += dt;
    const maxSubsteps = 5;
    let steps = 0;
    
    while (this.acc >= this.fixedDt && steps < maxSubsteps) {
      this.world.timestep = this.fixedDt;
      this.world.step();
      this.acc -= this.fixedDt;
      steps++;
    }
  }

  // Check if all pieces have settled (low velocity)
  // With wakeUp() forcing bodies to stay active, we don't need "near surface" check
  areAllPiecesSettled(sphereRadius: number = 0.0125, debug: boolean = false): boolean {
    let allSettled = true;
    let unsettledCount = 0;
    
    for (const [pieceId, pieceData] of this.pieces) {
      const linVel = pieceData.rigidBody.linvel();
      const angVel = pieceData.rigidBody.angvel();
      
      const linSpeed = Math.sqrt(linVel.x ** 2 + linVel.y ** 2 + linVel.z ** 2);
      const angSpeed = Math.sqrt(angVel.x ** 2 + angVel.y ** 2 + angVel.z ** 2);
      
      // Use settings for thresholds if available, otherwise use defaults
      const linThreshold = this.settings?.settledLinearVelocity ?? DEFAULT_SETTLED_LINEAR_VELOCITY;
      const angThreshold = this.settings?.settledAngularVelocity ?? DEFAULT_SETTLED_ANGULAR_VELOCITY;
      
      // Simple velocity check - pieces with low velocity are settled
      const pieceSettled = linSpeed <= linThreshold && angSpeed <= angThreshold;
      
      if (!pieceSettled) {
        allSettled = false;
        unsettledCount++;
      }
    }
    
    if (debug) {
      console.log(`📊 [SETTLE] ${allSettled ? 'ALL SETTLED' : `NOT SETTLED (${unsettledCount} moving)`}`);
    }
    
    return allSettled;
  }

  // Freeze all pieces - zero velocity and disable gravity to stop drift
  freezeAllPieces(): void {
    for (const [pieceId, pieceData] of this.pieces) {
      // Zero out velocities
      pieceData.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pieceData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // Disable gravity for this body so it doesn't drift
      pieceData.rigidBody.setGravityScale(0, true);
    }
    console.log(`🧊 [PHYSICS] Froze ${this.pieces.size} pieces (gravity disabled)`);
  }

  // Unfreeze all pieces - restore gravity
  unfreezeAllPieces(): void {
    for (const [pieceId, pieceData] of this.pieces) {
      pieceData.rigidBody.setGravityScale(1, true);
    }
    console.log(`🔥 [PHYSICS] Unfroze ${this.pieces.size} pieces (gravity restored)`);
  }

  // Get pieces sorted by height (highest first)
  getPiecesSortedByHeight(): PiecePhysicsData[] {
    const piecesArray = Array.from(this.pieces.values());
    return piecesArray.sort((a, b) => {
      const yA = a.rigidBody.translation().y;
      const yB = b.rigidBody.translation().y;
      return yB - yA; // Descending (highest first)
    });
  }

  // Switch piece to kinematic mode (for controlled movement)
  // Disables collisions to prevent knocking other pieces during removal
  setPieceKinematic(pieceId: string): void {
    const pieceData = this.pieces.get(pieceId);
    if (!pieceData || !this.rapier || !this.world) return;
    
    pieceData.rigidBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
    
    // Disable collisions by setting all colliders to sensors (pass-through)
    const numColliders = pieceData.rigidBody.numColliders();
    for (let i = 0; i < numColliders; i++) {
      const collider = pieceData.rigidBody.collider(i);
      collider.setSensor(true);
    }
    
    console.log(`🔒 [PHYSICS] Piece ${pieceId} set to kinematic (collisions disabled)`);
  }

  // Switch piece back to dynamic mode
  // Re-enables collisions
  setPieceDynamic(pieceId: string): void {
    const pieceData = this.pieces.get(pieceId);
    if (!pieceData || !this.rapier || !this.world) return;
    
    // Re-enable collisions by unsetting sensor mode
    const numColliders = pieceData.rigidBody.numColliders();
    for (let i = 0; i < numColliders; i++) {
      const collider = pieceData.rigidBody.collider(i);
      collider.setSensor(false);
    }
    
    pieceData.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
    
    // Restore gravity (may have been disabled by freezeAllPieces)
    pieceData.rigidBody.setGravityScale(1, true);
    
    // Reset velocities to prevent any residual momentum
    pieceData.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    pieceData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    
    console.log(`🔓 [PHYSICS] Piece ${pieceId} set to dynamic (collisions + gravity enabled)`);
  }

  // Move kinematic piece to target position
  setKinematicTarget(pieceId: string, position: THREE.Vector3, rotation?: THREE.Quaternion): void {
    const pieceData = this.pieces.get(pieceId);
    if (!pieceData) return;

    pieceData.rigidBody.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
    
    if (rotation) {
      pieceData.rigidBody.setNextKinematicRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    }
  }

  // Get piece transform (for syncing to Three.js)
  getPieceTransform(pieceId: string): { 
    position: THREE.Vector3; 
    rotation: THREE.Quaternion;
    linvel: { x: number; y: number; z: number };
    angvel: { x: number; y: number; z: number };
  } | null {
    const pieceData = this.pieces.get(pieceId);
    if (!pieceData) return null;

    const pos = pieceData.rigidBody.translation();
    const rot = pieceData.rigidBody.rotation();
    const linvel = pieceData.rigidBody.linvel();
    const angvel = pieceData.rigidBody.angvel();

    return {
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
      rotation: new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w),
      linvel: { x: linvel.x, y: linvel.y, z: linvel.z },
      angvel: { x: angvel.x, y: angvel.y, z: angvel.z },
    };
  }

  // Get all pieces
  getAllPieces(): Map<string, PiecePhysicsData> {
    return this.pieces;
  }

  // Reset all pieces to original transforms
  resetToOriginalTransforms(): void {
    for (const [pieceId, pieceData] of this.pieces) {
      const { position, rotation } = pieceData.originalTransform;
      pieceData.rigidBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
      pieceData.rigidBody.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
      pieceData.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pieceData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      console.log(`🔄 [PHYSICS] Piece ${pieceId} reset to original position`);
    }
  }

  // Get placemat center for removal animation
  getPlacematCenter(): THREE.Vector3 | null {
    if (!this.placematBody) return null;
    const pos = this.placematBody.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  // Get placemat XZ radius (half-diagonal from bounds)
  getPlacematRadius(): number {
    return this.placematRadius;
  }

  // Get ground top surface Y for piece placement
  getGroundTopY(): number {
    return this.groundTopY;
  }
  
  // Debug: Log all piece positions relative to ground
  debugLogPiecePositions(sphereRadius: number): void {
    console.log(`📍 [DEBUG] groundTopY = ${this.groundTopY.toFixed(4)}`);
    for (const [pieceId, pieceData] of this.pieces) {
      const pos = pieceData.rigidBody.translation();
      const penetration = this.getPieceGroundPenetration(pieceId, sphereRadius);
      const status = penetration !== null && penetration < 0 ? '❌ BELOW' : '✅ ABOVE';
      console.log(`  ${status} Piece ${pieceId}: center.y=${pos.y.toFixed(4)}, penetration=${penetration?.toFixed(4)}`);
    }
  }
  
  // Get placemat top surface Y
  getPlacematTopY(): number {
    return this.placematTopY;
  }

  // Debug: Returns how far the lowest point of a piece is below groundTopY
  // Negative = penetrating into ground, positive = above ground
  getPieceGroundPenetration(pieceId: string, sphereRadius: number): number | null {
    const p = this.pieces.get(pieceId);
    if (!p) return null;

    const t = p.rigidBody.translation();
    let minBottom = Infinity;

    for (const lp of p.spherePositions) {
      // World Y of each sphere center (approx; ignores rotation for quick check)
      const wy = t.y + lp.y;
      const bottom = wy - sphereRadius;
      minBottom = Math.min(minBottom, bottom);
    }

    return minBottom - this.groundTopY;
  }

  // Simulation control
  startSimulation(): void {
    this.simulationRunning = true;
    console.log('▶️ [PHYSICS] Simulation started');
  }

  stopSimulation(): void {
    this.simulationRunning = false;
    console.log('⏹️ [PHYSICS] Simulation stopped');
  }

  isSimulating(): boolean {
    return this.simulationRunning;
  }

  // Cleanup - fully reset all state
  destroy(): void {
    this.stopSimulation();
    this.pieces.clear();
    this.groundBody = null;
    this.placematBody = null;
    this.world = null;
    this.rapier = null;
    this.isInitialized = false;
    this.simulationRunning = false;
    this.groundTopY = 0;
    this.placematTopY = 0;
    this.placematRadius = 3.0;
    this.acc = 0;
    this.settings = null;
    console.log('🗑️ [PHYSICS] PhysicsService fully destroyed');
  }
}
