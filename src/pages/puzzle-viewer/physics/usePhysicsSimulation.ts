import { useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { PhysicsService, PiecePhysicsData } from './PhysicsService';
import type { PhysicsSettings } from './PhysicsSettingsModal';

// State of the physics simulation
export type PhysicsState = 
  | 'idle'           // Not started
  | 'initializing'   // Loading Rapier
  | 'ready'          // Ready to drop
  | 'elevated'       // Pieces elevated, waiting for drop
  | 'dropping'       // Pieces falling
  | 'settled'        // All pieces settled
  | 'removing'       // Removing pieces one by one
  | 'completed'      // All pieces removed (Phase 2 done)
  | 'reassembling'   // Phase 3: Reassembling pieces
  | 'reassembled';   // Phase 3: All pieces reassembled

// Reassembly piece state (deterministic - no failure tracking needed)
interface ReassemblyPieceState {
  pieceId: string;
  waitingPos: THREE.Vector3;      // Position around the mat after Phase 2
  waitingQuat: THREE.Quaternion;  // Orientation after Phase 2
  targetPos: THREE.Vector3;       // Golden assembly position (exact)
  targetQuat: THREE.Quaternion;   // Golden assembly orientation (exact)
  yCentroid: number;              // For sorting (lowest first)
  placed: boolean;                // Has been placed at golden position?
}

interface PhysicsSimulationConfig {
  sphereRadius: number;
  physicsSettings?: PhysicsSettings;
}

const DEFAULT_CONFIG: PhysicsSimulationConfig = {
  sphereRadius: 0.0125, // Real-world: 12.5mm radius (25mm diameter)
};

export interface PhysicsPiece {
  id: string;
  spheres: THREE.Vector3[];
}

export function usePhysicsSimulation(config: Partial<PhysicsSimulationConfig> = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const physicsService = useRef<PhysicsService | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [state, setState] = useState<PhysicsState>('idle');
  const [settledCount, setSettledCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  
  // Piece groups for Three.js sync
  const pieceGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  
  // Removal animation state
  const removalQueueRef = useRef<PiecePhysicsData[]>([]);
  const lastPieceSettledTimeRef = useRef<number | null>(null); // Track when last piece finished
  const currentRemovalRef = useRef<{
    piece: PiecePhysicsData;
    startTime: number;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    arcPhase: 'lifting' | 'moving' | 'lowering' | 'settling';
  } | null>(null);

  // Phase 3: Reassembly state (deterministic)
  const [placedCount, setPlacedCount] = useState(0);
  const reassemblyPiecesRef = useRef<ReassemblyPieceState[]>([]);
  const originalAssemblyPosRef = useRef<Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion }>>(new Map());
  const currentReassemblyRef = useRef<{
    piece: ReassemblyPieceState;
    startTime: number;
    startPos: THREE.Vector3;
    startQuat: THREE.Quaternion;
    phase: 'lifting' | 'moving' | 'lowering';
  } | null>(null);

  // Initialize physics
  const initialize = useCallback(async () => {
    // Allow re-init if idle OR if physicsService was destroyed (e.g., after fullReset)
    if (state !== 'idle' && physicsService.current?.isReady()) {
      console.log('[HOOK] Physics already initialized, skipping');
      return;
    }
    
    setState('initializing');
    physicsService.current = PhysicsService.getInstance();
    await physicsService.current.initialize(fullConfig.physicsSettings);
    setState('ready');
    
    console.log('✅ [HOOK] Physics simulation ready');
  }, [state, fullConfig.physicsSettings]);

  // Setup physics world with placemat and ground
  // floorTopY: pass the Y of your visible floor plane to align physics with visuals
  const setupWorld = useCallback((placematBounds: THREE.Box3, floorTopY?: number) => {
    if (!physicsService.current?.isReady()) {
      console.error('[HOOK] Physics not initialized');
      return;
    }

    physicsService.current.createGroundPlane(placematBounds, floorTopY, fullConfig.sphereRadius);
    physicsService.current.createPlacematCollider(placematBounds, fullConfig.sphereRadius);
    
    console.log('✅ [HOOK] Physics world setup complete, floorTopY:', floorTopY ?? 'auto');
  }, [fullConfig.sphereRadius]);

  // Add pieces to physics simulation
  const addPieces = useCallback((
    pieces: PhysicsPiece[],
    pieceGroups: Map<string, THREE.Group>
  ) => {
    if (!physicsService.current?.isReady()) {
      console.error('[HOOK] Physics not initialized');
      return;
    }

    pieceGroupsRef.current = pieceGroups;
    originalAssemblyPosRef.current.clear();
    
    for (const piece of pieces) {
      const threeGroup = pieceGroups.get(piece.id) || null;
      
      // Capture original assembly position for Phase 3 reassembly
      if (threeGroup) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        threeGroup.getWorldPosition(worldPos);
        threeGroup.getWorldQuaternion(worldQuat);
        originalAssemblyPosRef.current.set(piece.id, {
          pos: worldPos.clone(),
          quat: worldQuat.clone()
        });
      }
      
      physicsService.current.createPieceRigidBody(
        piece.id,
        piece.spheres,
        fullConfig.sphereRadius,
        threeGroup
      );
    }
    
    setTotalPieces(pieces.length);
    console.log(`✅ [HOOK] Added ${pieces.length} pieces to physics`);
  }, [fullConfig.sphereRadius]);

  // Start drop experiment (Phase 1A) - Two-press mechanism
  // First press: elevate pieces to drop height
  // Second press: start physics simulation (drop)
  const startDropExperiment = useCallback(() => {
    if (!physicsService.current?.isReady()) {
      console.error('[HOOK] Cannot start drop - physics not ready');
      return;
    }
    
    const dropHeight = fullConfig.physicsSettings?.dropHeight ?? 0.05;
    
    // SECOND PRESS: From 'elevated' state, start the actual drop
    if (state === 'elevated') {
      physicsService.current.startSimulation();
      setState('dropping');
      
      // DEBUG: Log all piece positions at drop start
      const allPieces = physicsService.current.getAllPieces();
      console.log(`🚀 [HOOK] Drop started! ${allPieces.size} pieces`);
      let i = 0;
      for (const [pieceId, pieceData] of allPieces) {
        if (i < 3) {
          const pos = pieceData.rigidBody.translation();
          console.log(`   Piece ${pieceId}: pos=(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);
        }
        i++;
      }
      return;
    }
    
    // FIRST PRESS: From 'ready' or 'settled', elevate pieces
    if (state !== 'ready' && state !== 'settled') {
      console.error('[HOOK] Cannot elevate - must be ready or settled, current:', state);
      return;
    }

    // Reset pieces to original positions first if coming from settled
    const WORLD_SCALE = 0.0125 / 0.354;
    if (state === 'settled') {
      physicsService.current.resetToOriginalTransforms();
      // Sync Three.js groups inline - convert world meters to local units
      const pieces = physicsService.current.getAllPieces();
      for (const [pieceId] of pieces) {
        const group = pieceGroupsRef.current.get(pieceId);
        if (!group) continue;
        const transform = physicsService.current.getPieceTransform(pieceId);
        if (!transform) continue;
        
        const localPos = transform.position.clone().divideScalar(WORLD_SCALE);
        group.position.copy(localPos);
        group.quaternion.copy(transform.rotation);
      }
    }

    // Offset pieces upward to drop height (but don't start physics yet)
    physicsService.current.offsetPiecesForDrop(dropHeight);
    
    // Sync the elevated positions to visuals - convert world meters to local units
    const pieces = physicsService.current.getAllPieces();
    for (const [pieceId] of pieces) {
      const group = pieceGroupsRef.current.get(pieceId);
      if (!group) continue;
      const transform = physicsService.current.getPieceTransform(pieceId);
      if (!transform) continue;
      
      const localPos = transform.position.clone().divideScalar(WORLD_SCALE);
      group.position.copy(localPos);
      group.quaternion.copy(transform.rotation);
    }
    
    setState('elevated');
    
    // DEBUG: Verify scale and surface positions
    const allPieces = physicsService.current.getAllPieces();
    const firstPiece = allPieces.values().next().value;
    const placematTopY = physicsService.current.getPlacematTopY();
    const groundTopY = physicsService.current.getGroundTopY();
    
    if (firstPiece) {
      const pos = firstPiece.rigidBody.translation();
      const sphereRadius = fullConfig.sphereRadius;
      const pieceBottomY = pos.y - sphereRadius; // Approximate bottom of piece
      const gapToMat = pieceBottomY - placematTopY;
      
      console.log(`🔍 [DEBUG SURFACES]`);
      console.log(`   Placemat top Y: ${placematTopY.toFixed(4)}m = ${(placematTopY * 100).toFixed(2)}cm`);
      console.log(`   Ground top Y: ${groundTopY.toFixed(4)}m = ${(groundTopY * 100).toFixed(2)}cm`);
      console.log(`   Piece center Y: ${pos.y.toFixed(4)}m = ${(pos.y * 100).toFixed(2)}cm`);
      console.log(`   Sphere radius: ${sphereRadius}m = ${sphereRadius * 1000}mm`);
      console.log(`   Piece bottom Y: ${pieceBottomY.toFixed(4)}m = ${(pieceBottomY * 100).toFixed(2)}cm`);
      console.log(`   Gap to mat: ${gapToMat.toFixed(4)}m = ${(gapToMat * 100).toFixed(2)}cm`);
      console.log(`   Expected piece bottom (on mat): ${placematTopY.toFixed(4)}m`);
    }
    
    console.log('⬆️ [HOOK] Pieces elevated to height:', dropHeight, '- press again to drop');
  }, [state, fullConfig.physicsSettings?.dropHeight]);

  // Start removal experiment (Phase 1B)
  const startRemovalExperiment = useCallback(() => {
    if (!physicsService.current?.isReady() || state !== 'settled') {
      console.error('[HOOK] Cannot start removal - pieces not settled');
      return;
    }

    // Get pieces sorted by height (highest first)
    removalQueueRef.current = physicsService.current.getPiecesSortedByHeight();
    setRemovedCount(0);
    setState('removing');
    
    console.log('🚀 [HOOK] Removal experiment started');
  }, [state]);

  // Calculate target position for removed piece (circular layout OUTSIDE the mat)
  const calculateRemovalTarget = useCallback((index: number): THREE.Vector3 => {
    const center = physicsService.current?.getPlacematCenter() || new THREE.Vector3();
    
    // Use actual placemat radius + margin to place pieces OUTSIDE the mat
    const baseRadius = physicsService.current?.getPlacematRadius() ?? 3.0;
    const marginMultiplier = fullConfig.physicsSettings?.removalMargin ?? 6;
    const margin = fullConfig.sphereRadius * marginMultiplier;
    const radius = baseRadius + margin;
    
    // Distribute pieces in a circle around the placemat
    const angle = (index / Math.max(totalPieces, 1)) * Math.PI * 2;
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    
    // Use actual ground top surface + extra margin for tetrahedral pieces that can land tilted
    // Pieces have 4 spheres, lowest can be ~sphereRadius below center when tilted
    const groundTopY = physicsService.current?.getGroundTopY() ?? (center.y - 10);
    const y = groundTopY + fullConfig.sphereRadius * 1.5 + 0.05;
    
    return new THREE.Vector3(x, y, z);
  }, [totalPieces, fullConfig.sphereRadius, fullConfig.physicsSettings?.removalMargin]);

  // Update removal animation
  const updateRemoval = useCallback(() => {
    const now = performance.now();
    
    // Check if all pieces are done and we're waiting for final settle
    if (!physicsService.current || (removalQueueRef.current.length === 0 && !currentRemovalRef.current)) {
      if (state === 'removing') {
        // Wait 1 second after last piece settled before completing
        if (lastPieceSettledTimeRef.current === null) {
          lastPieceSettledTimeRef.current = now;
          console.log('⏳ [HOOK] Last piece placed, waiting 1s for final settle...');
        } else if (now - lastPieceSettledTimeRef.current > 1000) {
          setState('completed');
          lastPieceSettledTimeRef.current = null;
          console.log('✅ [HOOK] All pieces removed');
        }
      }
      return;
    }

    // Start new removal if none in progress
    if (!currentRemovalRef.current && removalQueueRef.current.length > 0) {
      const piece = removalQueueRef.current.shift()!;
      const pos = physicsService.current.getPieceTransform(piece.id);
      if (!pos) return;

      physicsService.current.setPieceKinematic(piece.id);
      
      currentRemovalRef.current = {
        piece,
        startTime: now,
        startPos: pos.position.clone(),
        targetPos: calculateRemovalTarget(removedCount),
        arcPhase: 'lifting',
      };
      
      console.log(`🔼 [HOOK] Starting removal of piece ${piece.id}`);
    }

    // Animate current removal
    if (currentRemovalRef.current) {
      const { piece, startTime, startPos, targetPos, arcPhase } = currentRemovalRef.current;
      const elapsed = (now - startTime) / 1000; // seconds
      
      const liftDuration = 0.3;
      const moveDuration = 0.6;
      const lowerDuration = 0.3;
      const settleDuration = 0.3;
      
      // Arc heights scaled to sphere radius (world scale)
      const liftHeight = fullConfig.sphereRadius * 4; // ~5cm lift
      const arcHeight = fullConfig.sphereRadius * 6;  // ~7.5cm arc peak
      
      let newPos = startPos.clone();
      
      if (arcPhase === 'lifting') {
        const t = Math.min(elapsed / liftDuration, 1);
        const easeT = t * t * (3 - 2 * t); // smoothstep
        newPos.y = startPos.y + liftHeight * easeT;
        
        if (t >= 1) {
          currentRemovalRef.current.arcPhase = 'moving';
          currentRemovalRef.current.startTime = now;
          currentRemovalRef.current.startPos = newPos.clone();
        }
      } else if (arcPhase === 'moving') {
        const t = Math.min(elapsed / moveDuration, 1);
        const easeT = t * t * (3 - 2 * t);
        
        // Arc movement
        const midY = Math.max(startPos.y, targetPos.y) + arcHeight;
        newPos.x = THREE.MathUtils.lerp(startPos.x, targetPos.x, easeT);
        newPos.z = THREE.MathUtils.lerp(startPos.z, targetPos.z, easeT);
        newPos.y = THREE.MathUtils.lerp(startPos.y, midY, Math.sin(easeT * Math.PI));
        
        if (t >= 1) {
          currentRemovalRef.current.arcPhase = 'lowering';
          currentRemovalRef.current.startTime = now;
          currentRemovalRef.current.startPos = new THREE.Vector3(targetPos.x, newPos.y, targetPos.z);
        }
      } else if (arcPhase === 'lowering') {
        const t = Math.min(elapsed / lowerDuration, 1);
        const easeT = t * t * (3 - 2 * t);
        
        newPos.x = targetPos.x;
        newPos.z = targetPos.z;
        // Lower to just slightly above target (0.5x sphere radius margin)
        // This minimizes fall distance and impact velocity
        const safeY = targetPos.y + fullConfig.sphereRadius * 0.5;
        newPos.y = THREE.MathUtils.lerp(currentRemovalRef.current.startPos.y, safeY, easeT);
        
        if (t >= 1) {
          currentRemovalRef.current.arcPhase = 'settling';
          currentRemovalRef.current.startTime = now;
          
          // Place piece at safe height before switching to dynamic
          physicsService.current!.setKinematicTarget(piece.id, newPos);
          
          // Switch back to dynamic for natural settling
          physicsService.current!.setPieceDynamic(piece.id);
          
          // Debug: log the transition
          const groundY = physicsService.current!.getGroundTopY();
          console.log(`🔽 [HOOK] Piece ${piece.id} lowered to Y=${newPos.y.toFixed(4)}, targetPos.y=${targetPos.y.toFixed(4)}, safeY=${safeY.toFixed(4)}, groundTopY=${groundY.toFixed(4)}`);
        }
      } else if (arcPhase === 'settling') {
        // Diagnostic: log position every 100ms during settling
        const transform = physicsService.current?.getPieceTransform(piece.id);
        if (transform) {
          const groundY = physicsService.current!.getGroundTopY();
          const expectedY = groundY + fullConfig.sphereRadius;
          const penetration = expectedY - transform.position.y;
          const linVel = transform.linvel;
          const linSpeed = Math.sqrt(linVel.x * linVel.x + linVel.y * linVel.y + linVel.z * linVel.z);
          
          // Log every 200ms
          if (Math.floor(elapsed * 5) !== Math.floor((elapsed - 0.016) * 5)) {
            console.log(`📊 [SETTLING ${piece.id}] t=${elapsed.toFixed(2)}s Y=${transform.position.y.toFixed(4)} expectedY=${expectedY.toFixed(4)} penetration=${penetration.toFixed(4)} vel=${linSpeed.toFixed(4)} linVelY=${linVel.y.toFixed(4)}`);
          }
        }
        
        if (elapsed > settleDuration) {
          // Done with this piece
          setRemovedCount(c => c + 1);
          currentRemovalRef.current = null;
          
          // Debug log final position
          if (transform) {
            const groundY = physicsService.current!.getGroundTopY();
            const expectedY = groundY + fullConfig.sphereRadius;
            const penetration = expectedY - transform.position.y;
            console.log(`✅ [HOOK] Piece ${piece.id} settled at Y=${transform.position.y.toFixed(4)}, expectedY=${expectedY.toFixed(4)}, penetration=${penetration.toFixed(4)}`);
          }
        }
        return; // Let physics handle settling
      }
      
      // Update kinematic position (only during kinematic phases)
      physicsService.current!.setKinematicTarget(piece.id, newPos);
    }
  }, [state, removedCount, calculateRemovalTarget, fullConfig.sphereRadius]);

  // ============ PHASE 3: REASSEMBLY ============
  
  // Start reassembly experiment (Phase 3)
  const startReassemblyExperiment = useCallback(() => {
    if (!physicsService.current?.isReady() || state !== 'completed') {
      console.error('[HOOK] Cannot start reassembly - Phase 2 not completed');
      return;
    }

    // Capture waiting positions (current positions after Phase 2)
    const allPieces = physicsService.current.getAllPieces();
    const reassemblyPieces: ReassemblyPieceState[] = [];
    
    for (const [pieceId, pieceData] of allPieces) {
      const transform = physicsService.current.getPieceTransform(pieceId);
      const originalPos = originalAssemblyPosRef.current.get(pieceId);
      
      if (!transform || !originalPos) {
        console.warn(`[REASSEMBLY] Missing data for piece ${pieceId}`);
        continue;
      }
      
      // Calculate Y-centroid from original target position (for sorting)
      const yCentroid = originalPos.pos.y;
      
      reassemblyPieces.push({
        pieceId,
        waitingPos: transform.position.clone(),
        waitingQuat: transform.rotation.clone(),
        targetPos: originalPos.pos.clone(),
        targetQuat: originalPos.quat.clone(),
        yCentroid,
        placed: false
      });
    }
    
    // Sort by Y-centroid ascending (lowest pieces first - bottom-up assembly)
    reassemblyPieces.sort((a, b) => a.yCentroid - b.yCentroid);
    
    reassemblyPiecesRef.current = reassemblyPieces;
    currentReassemblyRef.current = null;
    setPlacedCount(0);
    setState('reassembling');
    
    console.log(`🔧 [HOOK] Reassembly started with ${reassemblyPieces.length} pieces (sorted by Y-centroid)`);
    if (reassemblyPieces.length > 0) {
      console.log(`   First piece: ${reassemblyPieces[0].pieceId} at Y=${reassemblyPieces[0].yCentroid.toFixed(3)}`);
      console.log(`   Last piece: ${reassemblyPieces[reassemblyPieces.length - 1].pieceId} at Y=${reassemblyPieces[reassemblyPieces.length - 1].yCentroid.toFixed(3)}`);
    }
  }, [state]);

  // Update reassembly animation (deterministic - no physics validation)
  const updateReassembly = useCallback(() => {
    const now = performance.now();
    
    // Check if all pieces are placed
    const unplacedPieces = reassemblyPiecesRef.current.filter(p => !p.placed);
    
    if (!physicsService.current || (unplacedPieces.length === 0 && !currentReassemblyRef.current)) {
      if (state === 'reassembling') {
        setState('reassembled');
        console.log('✅ [HOOK] Puzzle reassembled!');
      }
      return;
    }

    // Animation timing (calm, deliberate motion)
    const liftDuration = 0.3;
    const moveDuration = 0.6;
    const lowerDuration = 0.3;
    
    // Arc heights scaled to sphere radius
    const liftHeight = fullConfig.sphereRadius * 4;
    const arcHeight = fullConfig.sphereRadius * 6;

    // Start new placement if none in progress
    if (!currentReassemblyRef.current && unplacedPieces.length > 0) {
      // Next piece in sorted order (already sorted by Y-centroid ascending)
      const candidate = unplacedPieces[0];
      
      // Make piece kinematic for animation (physics disabled)
      physicsService.current.setPieceKinematic(candidate.pieceId);
      
      currentReassemblyRef.current = {
        piece: candidate,
        startTime: now,
        startPos: candidate.waitingPos.clone(),
        startQuat: candidate.waitingQuat.clone(),
        phase: 'lifting'
      };
      
      console.log(`🔼 [REASSEMBLY] Placing piece ${candidate.pieceId} (${reassemblyPiecesRef.current.filter(p => p.placed).length + 1}/${reassemblyPiecesRef.current.length})`);
    }

    // Animate current placement
    if (currentReassemblyRef.current) {
      const { piece, startTime, startPos, startQuat, phase } = currentReassemblyRef.current;
      const elapsed = (now - startTime) / 1000;
      
      let newPos = startPos.clone();
      let newQuat = startQuat.clone();
      
      if (phase === 'lifting') {
        const t = Math.min(elapsed / liftDuration, 1);
        const easeT = t * t * (3 - 2 * t); // Smooth step
        newPos.y = startPos.y + liftHeight * easeT;
        
        if (t >= 1) {
          currentReassemblyRef.current.phase = 'moving';
          currentReassemblyRef.current.startTime = now;
          currentReassemblyRef.current.startPos = newPos.clone();
        }
      } else if (phase === 'moving') {
        const t = Math.min(elapsed / moveDuration, 1);
        const easeT = t * t * (3 - 2 * t);
        
        // Arc movement towards golden target
        const midY = Math.max(startPos.y, piece.targetPos.y) + arcHeight;
        newPos.x = THREE.MathUtils.lerp(startPos.x, piece.targetPos.x, easeT);
        newPos.z = THREE.MathUtils.lerp(startPos.z, piece.targetPos.z, easeT);
        newPos.y = THREE.MathUtils.lerp(startPos.y, midY, Math.sin(easeT * Math.PI));
        
        // Interpolate quaternion towards golden rotation
        newQuat.slerpQuaternions(startQuat, piece.targetQuat, easeT);
        
        if (t >= 1) {
          currentReassemblyRef.current.phase = 'lowering';
          currentReassemblyRef.current.startTime = now;
          currentReassemblyRef.current.startPos = new THREE.Vector3(piece.targetPos.x, newPos.y, piece.targetPos.z);
          currentReassemblyRef.current.startQuat = newQuat.clone();
        }
      } else if (phase === 'lowering') {
        const t = Math.min(elapsed / lowerDuration, 1);
        const easeT = t * t * (3 - 2 * t);
        
        // Lower to exact golden position
        newPos.x = piece.targetPos.x;
        newPos.z = piece.targetPos.z;
        newPos.y = THREE.MathUtils.lerp(currentReassemblyRef.current.startPos.y, piece.targetPos.y, easeT);
        newQuat.copy(piece.targetQuat);
        
        if (t >= 1) {
          // Lock piece at exact golden transform (keep kinematic = frozen)
          physicsService.current!.setKinematicTarget(piece.pieceId, piece.targetPos, piece.targetQuat);
          
          // Mark as placed - piece stays kinematic (locked in place)
          piece.placed = true;
          setPlacedCount(c => c + 1);
          currentReassemblyRef.current = null;
          
          console.log(`✅ [REASSEMBLY] Piece ${piece.pieceId} locked at golden position`);
        }
      }
      
      // Update kinematic position and rotation
      physicsService.current!.setKinematicTarget(piece.pieceId, newPos, newQuat);
    }
  }, [state, fullConfig.sphereRadius]);

  // Sync Three.js groups with physics transforms
  // Physics positions are in world coordinates (meters)
  // Group positions need to be in local coordinates of their scaled parent
  // WORLD_SCALE = 0.0125 / 0.354 ≈ 0.0353
  const WORLD_SCALE = 0.0125 / 0.354;
  
  const syncThreeGroups = useCallback(() => {
    if (!physicsService.current) return;

    const pieces = physicsService.current.getAllPieces();
    let syncCount = 0;
    let firstLocalY = 0;
    
    for (const [pieceId] of pieces) {
      const group = pieceGroupsRef.current.get(pieceId);
      if (!group) {
        console.warn(`⚠️ [SYNC] No group for piece ${pieceId}`);
        continue;
      }

      const transform = physicsService.current.getPieceTransform(pieceId);
      if (!transform) {
        console.warn(`⚠️ [SYNC] No transform for piece ${pieceId}`);
        continue;
      }

      // Convert world physics position (meters) to local coordinates
      // Divide by WORLD_SCALE to get local units
      const localPos = transform.position.clone().divideScalar(WORLD_SCALE);
      group.position.copy(localPos);
      group.quaternion.copy(transform.rotation);
      
      if (syncCount === 0) {
        firstLocalY = localPos.y;
      }
      syncCount++;
    }
    
    // Debug: log sync status periodically (every ~60 frames)
    if (Math.random() < 0.016) {
      // Also check if puzzleGroup parent has an offset
      const firstGroup = pieceGroupsRef.current.values().next().value;
      let parentInfo = '';
      if (firstGroup?.parent) {
        const parentPos = firstGroup.parent.position;
        parentInfo = ` | parent.pos.y=${parentPos.y.toFixed(2)}`;
      }
      console.log(`🔄 [SYNC] Updated ${syncCount} pieces, first localY=${firstLocalY.toFixed(2)}${parentInfo}`);
    }
  }, []);

  // Main simulation loop
  useEffect(() => {
    if (state !== 'dropping' && state !== 'removing' && state !== 'reassembling') return;
    
    console.log(`🎬 [LOOP] Simulation loop starting for state: ${state}`);

    let lastTime = performance.now();
    let totalSimTime = 0;           // Total simulation time elapsed
    let settleCheckTimer = 0;       // Timer for check interval
    let consecutiveSettledChecks = 0; // Must be settled for multiple checks in a row

    const MIN_SIM_TIME = 1.0;       // Minimum 1 second before checking for settling
    const MAX_SIM_TIME = fullConfig.physicsSettings?.maxSimTime ?? 3.0; // Force settle after max time
    const CHECK_INTERVAL = 0.5;     // Check every 0.5 seconds
    const REQUIRED_CONSECUTIVE = 3; // Must be settled for 3 consecutive checks (1.5s)
    let debugTimer = 0;             // Timer for periodic debug logging

    const tick = () => {
      if (!physicsService.current?.isSimulating()) {
        animationFrameRef.current = null;
        return;
      }

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      totalSimTime += dt;

      // Step physics with dt for fixed substeps
      physicsService.current.step(dt);

      // Periodic debug logging (every 1 second during dropping)
      if (state === 'dropping') {
        debugTimer += dt;
        if (debugTimer > 1.0) {
          debugTimer = 0;
          // Log a sample piece's state
          const pieces = physicsService.current.getAllPieces();
          const firstPiece = pieces.values().next().value;
          if (firstPiece) {
            const vel = firstPiece.rigidBody.linvel();
            const pos = firstPiece.rigidBody.translation();
            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
            console.log(`⏱️ [DROP] t=${totalSimTime.toFixed(1)}s | sample piece: y=${pos.y.toFixed(2)} velY=${vel.y.toFixed(2)} speed=${speed.toFixed(3)}`);
          }
        }
      }

      // Update removal animation
      if (state === 'removing') {
        updateRemoval();
      }

      // Update reassembly animation (Phase 3)
      if (state === 'reassembling') {
        updateReassembly();
      }

      // Sync Three.js
      syncThreeGroups();
      
      // DIAGNOSTIC: Monitor all pieces for post-settle drift (during removal state)
      if (state === 'removing' && physicsService.current) {
        debugTimer += dt;
        // Log every 0.5 seconds
        if (debugTimer > 0.5) {
          debugTimer = 0;
          const groundY = physicsService.current.getGroundTopY();
          const expectedY = groundY + fullConfig.sphereRadius;
          
          // Find pieces that have already been removed (not currently being animated)
          const currentPieceId = currentRemovalRef.current?.piece?.id;
          for (const [pieceId, pieceData] of physicsService.current.getAllPieces()) {
            // Skip the piece currently being animated
            if (pieceId === currentPieceId) continue;
            
            const pos = pieceData.rigidBody.translation();
            const linvel = pieceData.rigidBody.linvel();
            const bodyType = pieceData.rigidBody.bodyType();
            const isSleeping = pieceData.rigidBody.isSleeping();
            
            // Only log pieces that are dynamic (settled pieces)
            // bodyType 0 = Dynamic, 1 = Fixed, 2 = KinematicPositionBased, 3 = KinematicVelocityBased
            if (bodyType === 0) {
              const penetration = expectedY - pos.y;
              console.log(`📍 [DRIFT ${pieceId}] Y=${pos.y.toFixed(5)} velY=${linvel.y.toFixed(6)} penetration=${(penetration*1000).toFixed(2)}mm sleeping=${isSleeping} bodyType=${bodyType}`);
            }
          }
        }
      }

      // Check if settled (during dropping phase)
      // Must wait minimum time AND be settled for multiple consecutive checks
      // OR force settle after maximum time
      if (state === 'dropping' && totalSimTime > MIN_SIM_TIME) {
        // Force settle after maximum time regardless of velocity
        if (totalSimTime > MAX_SIM_TIME) {
          setSettledCount(totalPieces);
          setState('settled');
          console.log(`⏱️ [HOOK] Force settled after ${MAX_SIM_TIME}s timeout`);
          return;
        }
        
        settleCheckTimer += dt;
        if (settleCheckTimer > CHECK_INTERVAL) {
          settleCheckTimer = 0;
          if (physicsService.current.areAllPiecesSettled(fullConfig.sphereRadius, true)) {
            consecutiveSettledChecks++;
            console.log(`🔍 [HOOK] Settled check ${consecutiveSettledChecks}/${REQUIRED_CONSECUTIVE}`);
            if (consecutiveSettledChecks >= REQUIRED_CONSECUTIVE) {
              setSettledCount(totalPieces);
              setState('settled');
              
              // DEBUG: Log final settled positions vs mat surface
              const placematTopY = physicsService.current!.getPlacematTopY();
              const sphereRadius = fullConfig.sphereRadius;
              let minPieceY = Infinity;
              let minPieceId = '';
              
              console.log(`✅ [HOOK] All pieces settled (confirmed)`);
              console.log(`🔍 [SETTLED DEBUG - ALL PIECES]`);
              console.log(`   Placemat top Y: ${placematTopY.toFixed(4)}m`);
              console.log(`   Sphere radius: ${sphereRadius.toFixed(4)}m`);
              console.log(`   Expected piece center Y (on mat): ${(placematTopY + sphereRadius).toFixed(4)}m`);
              console.log(`   ---`);
              
              for (const [pieceId, pieceData] of physicsService.current!.getAllPieces()) {
                const pos = pieceData.rigidBody.translation();
                const linvel = pieceData.rigidBody.linvel();
                const expectedY = placematTopY + sphereRadius;
                const drift = pos.y - expectedY;
                const isSleeping = pieceData.rigidBody.isSleeping();
                
                console.log(`   ${pieceId}: Y=${pos.y.toFixed(5)} drift=${(drift*1000).toFixed(2)}mm velY=${linvel.y.toFixed(6)} sleeping=${isSleeping}`);
                
                if (pos.y < minPieceY) {
                  minPieceY = pos.y;
                  minPieceId = pieceId;
                }
              }
              
              const pieceBottomY = minPieceY - sphereRadius;
              const gapToMat = pieceBottomY - placematTopY;
              
              console.log(`   ---`);
              console.log(`   Lowest piece "${minPieceId}" center Y: ${minPieceY.toFixed(4)}m`);
              console.log(`   GAP to mat: ${(gapToMat * 1000).toFixed(1)}mm (should be ~0)`);
              
              // Start post-settle monitoring
              console.log(`📊 [POST-SETTLE] Starting 5-second drift monitor...`);
              let monitorCount = 0;
              const monitorInterval = setInterval(() => {
                monitorCount++;
                if (!physicsService.current || monitorCount > 10) {
                  clearInterval(monitorInterval);
                  console.log(`📊 [POST-SETTLE] Monitoring complete`);
                  return;
                }
                
                console.log(`📊 [POST-SETTLE t=${monitorCount * 0.5}s]`);
                for (const [pieceId, pieceData] of physicsService.current.getAllPieces()) {
                  const pos = pieceData.rigidBody.translation();
                  const linvel = pieceData.rigidBody.linvel();
                  const expectedY = placematTopY + sphereRadius;
                  const drift = pos.y - expectedY;
                  
                  // Only log pieces that are drifting (velY != 0 or significant drift)
                  if (Math.abs(linvel.y) > 0.00001 || Math.abs(drift) > 0.001) {
                    console.log(`   ${pieceId}: Y=${pos.y.toFixed(5)} drift=${(drift*1000).toFixed(2)}mm velY=${linvel.y.toFixed(6)}`);
                  }
                }
              }, 500);
            }
          } else {
            // Reset if any piece is still moving
            if (consecutiveSettledChecks > 0) {
              console.log('🔄 [HOOK] Piece still moving, resetting settle counter');
            }
            consecutiveSettledChecks = 0;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state, syncThreeGroups, updateRemoval, updateReassembly, totalPieces]);

  // Reset simulation (soft reset - keeps physics initialized)
  const reset = useCallback(() => {
    if (!physicsService.current) return;

    physicsService.current.stopSimulation();
    physicsService.current.resetToOriginalTransforms();
    syncThreeGroups();
    
    removalQueueRef.current = [];
    currentRemovalRef.current = null;
    reassemblyPiecesRef.current = [];
    currentReassemblyRef.current = null;
    setSettledCount(0);
    setRemovedCount(0);
    setPlacedCount(0);
    setState('ready');
    
    // Log current physics settings for debugging
    const settings = fullConfig.physicsSettings;
    console.log('🔄 [HOOK] Simulation reset - ready for new drop');
    console.log('⚙️ [PHYSICS SETTINGS]');
    console.log(`   gravity: ${settings?.gravity ?? 9.81}`);
    console.log(`   linearDamping: ${settings?.linearDamping ?? 0.5}`);
    console.log(`   angularDamping: ${settings?.angularDamping ?? 0.5}`);
    console.log(`   friction: ${settings?.friction ?? 0.5}`);
    console.log(`   restitution: ${settings?.restitution ?? 0.3}`);
    console.log(`   dropHeight: ${settings?.dropHeight ?? 0.2}`);
    console.log(`   maxSimTime: ${settings?.maxSimTime ?? 3}`);
  }, [syncThreeGroups, fullConfig.physicsSettings]);

  // Full reset - destroys physics completely, returns to idle, restores golden positions
  const fullReset = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Restore Three.js groups to their original golden positions before clearing
    const WORLD_SCALE = 0.0125 / 0.354;
    for (const [pieceId, threeGroup] of pieceGroupsRef.current) {
      const originalTransform = originalAssemblyPosRef.current.get(pieceId);
      if (originalTransform && threeGroup) {
        // Convert world position back to local (scaled) coordinates
        threeGroup.position.set(
          originalTransform.pos.x / WORLD_SCALE,
          originalTransform.pos.y / WORLD_SCALE,
          originalTransform.pos.z / WORLD_SCALE
        );
        threeGroup.quaternion.copy(originalTransform.quat);
      }
    }
    
    // Destroy the singleton completely
    PhysicsService.destroyInstance();
    physicsService.current = null;
    
    // Reset all hook state
    pieceGroupsRef.current.clear();
    removalQueueRef.current = [];
    currentRemovalRef.current = null;
    reassemblyPiecesRef.current = [];
    currentReassemblyRef.current = null;
    originalAssemblyPosRef.current.clear();
    setSettledCount(0);
    setRemovedCount(0);
    setPlacedCount(0);
    setTotalPieces(0);
    setState('idle');
    
    console.log('🗑️ [HOOK] Physics fully reset to idle (golden positions restored)');
  }, []);

  // Restart drop - full reset then re-init and start drop (avoids React closure issues)
  const restartDrop = useCallback(async (
    placematBounds: THREE.Box3,
    floorTopY: number,
    pieces: PhysicsPiece[],
    pieceGroups: Map<string, THREE.Group>
  ) => {
    console.log('🔁 [RESTART] Starting full restart sequence...');
    
    // 1. Cancel any running animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // 2. Restore Three.js groups to golden positions
    const WORLD_SCALE = 0.0125 / 0.354;
    for (const [pieceId, threeGroup] of pieceGroupsRef.current) {
      const originalTransform = originalAssemblyPosRef.current.get(pieceId);
      if (originalTransform && threeGroup) {
        threeGroup.position.set(
          originalTransform.pos.x / WORLD_SCALE,
          originalTransform.pos.y / WORLD_SCALE,
          originalTransform.pos.z / WORLD_SCALE
        );
        threeGroup.quaternion.copy(originalTransform.quat);
      }
    }
    
    // 3. Destroy physics
    PhysicsService.destroyInstance();
    physicsService.current = null;
    
    // 4. Clear refs
    pieceGroupsRef.current.clear();
    removalQueueRef.current = [];
    currentRemovalRef.current = null;
    reassemblyPiecesRef.current = [];
    currentReassemblyRef.current = null;
    originalAssemblyPosRef.current.clear();
    
    // 5. Reset state
    setSettledCount(0);
    setRemovedCount(0);
    setPlacedCount(0);
    setTotalPieces(0);
    
    // 6. Re-initialize physics
    setState('initializing');
    physicsService.current = PhysicsService.getInstance();
    await physicsService.current.initialize(fullConfig.physicsSettings);
    
    // 7. Setup world
    physicsService.current.createGroundPlane(placematBounds, floorTopY, fullConfig.sphereRadius);
    physicsService.current.createPlacematCollider(placematBounds, fullConfig.sphereRadius);
    
    // 8. Add pieces
    pieceGroupsRef.current = pieceGroups;
    originalAssemblyPosRef.current.clear();
    
    for (const piece of pieces) {
      const threeGroup = pieceGroups.get(piece.id) || null;
      
      if (threeGroup) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        threeGroup.getWorldPosition(worldPos);
        threeGroup.getWorldQuaternion(worldQuat);
        originalAssemblyPosRef.current.set(piece.id, {
          pos: worldPos.clone(),
          quat: worldQuat.clone()
        });
      }
      
      physicsService.current.createPieceRigidBody(
        piece.id,
        piece.spheres,
        fullConfig.sphereRadius,
        threeGroup
      );
    }
    
    setTotalPieces(pieces.length);
    setState('ready');
    
    // 9. Elevate pieces
    const dropHeight = fullConfig.physicsSettings?.dropHeight ?? 0.05;
    physicsService.current.offsetPiecesForDrop(dropHeight);
    
    // Sync elevated positions to visuals
    const allPieces = physicsService.current.getAllPieces();
    for (const [pieceId] of allPieces) {
      const group = pieceGroupsRef.current.get(pieceId);
      if (!group) continue;
      const transform = physicsService.current.getPieceTransform(pieceId);
      if (!transform) continue;
      
      const localPos = transform.position.clone().divideScalar(WORLD_SCALE);
      group.position.copy(localPos);
      group.quaternion.copy(transform.rotation);
    }
    
    setState('elevated');
    console.log('⬆️ [RESTART] Pieces elevated');
    
    // 10. Start drop after brief delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    physicsService.current.startSimulation();
    setState('dropping');
    console.log('🚀 [RESTART] Drop started!');
  }, [fullConfig.physicsSettings, fullConfig.sphereRadius]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      PhysicsService.destroyInstance();
    };
  }, []);

  return {
    state,
    settledCount,
    removedCount,
    placedCount,
    totalPieces,
    initialize,
    setupWorld,
    addPieces,
    startDropExperiment,
    startRemovalExperiment,
    startReassemblyExperiment,
    reset,
    fullReset,
    restartDrop,
    syncThreeGroups,
  };
}
