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
  animationSpeed?: number; // Multiplier for animation speed (1.0 = normal, 2.0 = 2x faster)
}

const DEFAULT_CONFIG: PhysicsSimulationConfig = {
  sphereRadius: 0.0125, // Real-world: 12.5mm radius (25mm diameter)
  animationSpeed: 1.0,
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
  const stateRef = useRef<PhysicsState>('idle');  // Mirror state for animation loop closure
  const [settledCount, setSettledCount] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  
  // Piece groups for Three.js sync
  const pieceGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  
  // Removal animation state
  const removalQueueRef = useRef<PiecePhysicsData[]>([]);
  const lastPieceSettledTimeRef = useRef<number | null>(null); // Track when last piece finished
  
  // Animation speed multiplier (can be changed at runtime)
  const animationSpeedRef = useRef<number>(fullConfig.animationSpeed || 1.0);
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
    phase: 'rising' | 'traversing' | 'descending';
    clearanceY?: number;  // Height to rise above placed pieces
  } | null>(null);

  // Automated sequence state
  const sequenceActiveRef = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef<boolean>(false);

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

    // Copy the map to avoid issues if caller clears original map on re-render
    pieceGroupsRef.current = new Map(pieceGroups);
    originalAssemblyPosRef.current.clear();
    
    // Debug: Check for mismatches between pieces and pieceGroups
    const pieceIds = pieces.map(p => p.id).sort();
    const groupIds = Array.from(pieceGroups.keys()).sort();
    const missingGroups = pieceIds.filter(id => !pieceGroups.has(id));
    const extraGroups = groupIds.filter(id => !pieceIds.includes(id));
    console.log(`📊 [HOOK] Pieces: ${pieceIds.length}, Groups: ${groupIds.length}`);
    if (missingGroups.length > 0) {
      console.warn(`⚠️ [HOOK] Pieces WITHOUT groups: ${missingGroups.join(', ')}`);
    }
    if (extraGroups.length > 0) {
      console.warn(`⚠️ [HOOK] Groups WITHOUT pieces: ${extraGroups.join(', ')}`);
    }
    
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

    // Restore gravity on all pieces (may have been disabled by early freeze)
    // This ensures bumped pieces fall properly during removal
    physicsService.current.unfreezeAllPieces();

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
    
    console.log(`📍 [REMOVE] Target Y: groundTopY=${groundTopY.toFixed(4)}, sphereRadius=${fullConfig.sphereRadius.toFixed(4)}, targetY=${y.toFixed(4)}`);
    
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
      
      // Scale durations by animation speed (higher speed = shorter durations)
      // Removal is faster: base 0.75s per piece (0.15 + 0.3 + 0.15 + 0.15)
      const speed = animationSpeedRef.current;
      const liftDuration = 0.15 / speed;
      const moveDuration = 0.3 / speed;
      const lowerDuration = 0.15 / speed;
      const settleDuration = 0.15 / speed;
      
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

  // Catmull-Rom spline interpolation for smooth curves through control points
  const catmullRom = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number): THREE.Vector3 => {
    const t2 = t * t;
    const t3 = t2 * t;
    return new THREE.Vector3(
      0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    );
  };

  // Ease-in-out quintic for very smooth velocity (slow start, slow end)
  const easeInOutQuintic = (t: number) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

  // Update reassembly animation (deterministic - no physics validation)
  // Uses Catmull-Rom spline for smooth curved path through key vertices
  const updateReassembly = useCallback(() => {
    const now = performance.now();
    
    // Check if all pieces are placed
    const unplacedPieces = reassemblyPiecesRef.current.filter(p => !p.placed);
    const placedPieces = reassemblyPiecesRef.current.filter(p => p.placed);
    
    if (!physicsService.current || (unplacedPieces.length === 0 && !currentReassemblyRef.current)) {
      if (state === 'reassembling') {
        setState('reassembled');
        console.log('✅ [HOOK] Puzzle reassembled!');
      }
      return;
    }

    // Total animation duration for entire path (scaled by animation speed)
    // Reassembly is slower: base 3.0s per piece (double the original 1.5s)
    const totalDuration = 3.0 / animationSpeedRef.current;  // seconds for full path
    
    // Heights scaled to sphere radius
    const clearanceMargin = fullConfig.sphereRadius * 5;

    // Start new placement if none in progress
    if (!currentReassemblyRef.current && unplacedPieces.length > 0) {
      const candidate = unplacedPieces[0];
      
      // Calculate clearance height above ALL placed pieces
      let maxPlacedY = 0;
      for (const placed of placedPieces) {
        maxPlacedY = Math.max(maxPlacedY, placed.targetPos.y);
      }
      const clearanceY = Math.max(
        maxPlacedY + clearanceMargin,
        candidate.targetPos.y + clearanceMargin,
        candidate.waitingPos.y + clearanceMargin
      );
      
      physicsService.current.setPieceKinematic(candidate.pieceId);
      
      currentReassemblyRef.current = {
        piece: candidate,
        startTime: now,
        startPos: candidate.waitingPos.clone(),
        startQuat: candidate.waitingQuat.clone(),
        phase: 'rising',  // Not used for phases anymore, but kept for type compatibility
        clearanceY
      };
      
      console.log(`🔼 [REASSEMBLY] Placing piece ${candidate.pieceId} (${placedPieces.length + 1}/${reassemblyPiecesRef.current.length}) clearanceY=${clearanceY.toFixed(3)}`);
    }

    // Animate using Catmull-Rom spline through key vertices
    if (currentReassemblyRef.current) {
      const { piece, startTime, clearanceY } = currentReassemblyRef.current;
      const elapsed = (now - startTime) / 1000;
      
      // Overall progress with ease-in-out (slow start, slow end)
      const rawT = Math.min(elapsed / totalDuration, 1);
      const t = easeInOutQuintic(rawT);
      
      // Define key vertices for the path
      const start = piece.waitingPos.clone();
      const target = piece.targetPos.clone();
      
      // Intermediate control points
      const risePoint = new THREE.Vector3(
        start.x + (target.x - start.x) * 0.15,  // Slight drift toward target
        clearanceY!,
        start.z + (target.z - start.z) * 0.15
      );
      const aboveTarget = new THREE.Vector3(
        target.x,
        clearanceY! + fullConfig.sphereRadius * 1.5,  // Slight arc peak
        target.z
      );
      
      // Create phantom points for Catmull-Rom (extend path tangents)
      const preStart = new THREE.Vector3(
        start.x,
        start.y - fullConfig.sphereRadius * 2,  // Below start
        start.z
      );
      const postTarget = new THREE.Vector3(
        target.x,
        target.y - fullConfig.sphereRadius * 2,  // Below target (soft landing direction)
        target.z
      );
      
      // Spline through 4 key points: start → risePoint → aboveTarget → target
      // We use 3 segments, so map t to the appropriate segment
      let newPos: THREE.Vector3;
      
      if (t < 0.33) {
        // Segment 1: start → risePoint
        const segT = t / 0.33;
        newPos = catmullRom(preStart, start, risePoint, aboveTarget, segT);
      } else if (t < 0.67) {
        // Segment 2: risePoint → aboveTarget
        const segT = (t - 0.33) / 0.34;
        newPos = catmullRom(start, risePoint, aboveTarget, target, segT);
      } else {
        // Segment 3: aboveTarget → target
        const segT = (t - 0.67) / 0.33;
        newPos = catmullRom(risePoint, aboveTarget, target, postTarget, segT);
      }
      
      // Smooth rotation interpolation (slerp with same eased t)
      const newQuat = new THREE.Quaternion();
      newQuat.slerpQuaternions(piece.waitingQuat, piece.targetQuat, t);
      
      // Check for completion
      if (rawT >= 1) {
        // Lock piece at exact golden transform
        physicsService.current!.setKinematicTarget(piece.pieceId, piece.targetPos, piece.targetQuat);
        
        piece.placed = true;
        setPlacedCount(c => c + 1);
        currentReassemblyRef.current = null;
        
        console.log(`✅ [REASSEMBLY] Piece ${piece.pieceId} locked at golden position`);
      } else {
        // Update kinematic position and rotation
        physicsService.current!.setKinematicTarget(piece.pieceId, newPos, newQuat);
      }
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

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Auto-trigger reassembly when removal completes during sequence
  useEffect(() => {
    if (state === 'completed' && sequenceActiveRef.current) {
      console.log('🔄 [AUTO] State is completed and sequence active - starting reassembly');
      
      // Start reassembly
      physicsService.current?.startSimulation();
      
      // Capture waiting positions
      const allPieces = physicsService.current?.getAllPieces();
      if (!allPieces) return;
      
      const reassemblyPieces: ReassemblyPieceState[] = [];
      
      for (const [pieceId] of allPieces) {
        const transform = physicsService.current?.getPieceTransform(pieceId);
        const originalPos = originalAssemblyPosRef.current.get(pieceId);
        
        if (!transform || !originalPos) continue;
        
        reassemblyPieces.push({
          pieceId,
          waitingPos: transform.position.clone(),
          waitingQuat: transform.rotation.clone(),
          targetPos: originalPos.pos.clone(),
          targetQuat: originalPos.quat.clone(),
          yCentroid: originalPos.pos.y,
          placed: false
        });
      }
      
      reassemblyPieces.sort((a, b) => a.yCentroid - b.yCentroid);
      reassemblyPiecesRef.current = reassemblyPieces;
      currentReassemblyRef.current = null;
      setPlacedCount(0);
      
      console.log(`🔄 [AUTO] Starting reassembly with ${reassemblyPieces.length} pieces`);
      setState('reassembling');
    }
  }, [state]);

  // Main simulation loop
  useEffect(() => {
    console.log(`🎬 [LOOP] useEffect triggered for state: ${state}`);
    if (state !== 'dropping' && state !== 'removing' && state !== 'reassembling') {
      console.log(`🎬 [LOOP] Skipping - state ${state} not in active list`);
      return;
    }
    
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
      // Check stateRef (not captured state) to detect state changes and stop loop
      const currentState = stateRef.current;
      if (currentState !== 'dropping' && currentState !== 'removing' && currentState !== 'reassembling') {
        console.log(`🛑 [LOOP] Stopping - state changed to: ${currentState}`);
        animationFrameRef.current = null;
        return;
      }
      
      // For reassembly, we don't need physics simulation running - just the animation loop
      if (currentState !== 'reassembling' && !physicsService.current?.isSimulating()) {
        console.log(`🛑 [LOOP] Stopping - simulation not running for state: ${currentState}`);
        animationFrameRef.current = null;
        return;
      }
      
      // If paused, keep the loop running but don't advance time
      if (isPausedRef.current) {
        lastTime = performance.now(); // Reset lastTime to avoid time jump on resume
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      totalSimTime += dt;

      // Step physics with dt for fixed substeps
      physicsService.current.step(dt);

      // EARLY FREEZE for drop phase: freeze pieces once velocities drop
      if (currentState === 'dropping' && totalSimTime > 0.5) {
        const pieces = physicsService.current.getAllPieces();
        let maxLinSpeed = 0;
        let maxAngSpeed = 0;
        
        for (const [, pieceData] of pieces) {
          const vel = pieceData.rigidBody.linvel();
          const angVel = pieceData.rigidBody.angvel();
          const linSpeed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
          const angSpeed = Math.sqrt(angVel.x ** 2 + angVel.y ** 2 + angVel.z ** 2);
          maxLinSpeed = Math.max(maxLinSpeed, linSpeed);
          maxAngSpeed = Math.max(maxAngSpeed, angSpeed);
        }
        
        // Freeze when velocities drop below threshold
        if (maxLinSpeed < 0.01 && maxAngSpeed < 0.2) {
          physicsService.current.freezeAllPieces();
          setSettledCount(totalPieces);
          setState('settled');
          console.log(`🧊 [EARLY FREEZE] t=${totalSimTime.toFixed(2)}s`);
          return;
        }
      }

      // Periodic debug logging (every 1 second during dropping)
      if (currentState === 'dropping') {
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
      if (currentState === 'removing') {
        updateRemoval();
      }

      // Update reassembly animation (Phase 3)
      if (currentState === 'reassembling') {
        updateReassembly();
      }

      // Sync Three.js
      syncThreeGroups();
      
      // DIAGNOSTIC: Monitor all pieces for post-settle drift (during removal state)
      if (currentState === 'removing' && physicsService.current) {
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
      if (currentState === 'dropping' && totalSimTime > MIN_SIM_TIME) {
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
    
    // 8. Add pieces (copy map to avoid issues if caller clears on re-render)
    pieceGroupsRef.current = new Map(pieceGroups);
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

  // Instantly settle pieces by running physics simulation off-screen
  const simulateInstantSettle = useCallback(() => {
    if (!physicsService.current?.isReady()) return false;
    
    const dropHeight = fullConfig.physicsSettings?.dropHeight ?? 0.05;
    const maxSteps = 500; // Max iterations to prevent infinite loop
    const dt = 1 / 60; // Fixed timestep
    
    // Generate time-based seed for unique pile each play
    const now = new Date();
    const seed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds();
    console.log(`🎲 [RANDOM] Seed: ${seed} (${now.toLocaleTimeString()})`);
    
    // Simple seeded random function
    let randomState = seed;
    const seededRandom = () => {
      randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
      return (randomState / 0x7fffffff);
    };
    
    // Elevate pieces with random horizontal offsets for unique pile formation
    const pieces = physicsService.current.getAllPieces();
    const offsetRange = 0.005; // Small random offset in meters (5mm)
    
    for (const [pieceId, pieceData] of pieces) {
      const pos = pieceData.rigidBody.translation();
      // Add random horizontal offset
      const offsetX = (seededRandom() - 0.5) * offsetRange;
      const offsetZ = (seededRandom() - 0.5) * offsetRange;
      pieceData.rigidBody.setTranslation(
        { x: pos.x + offsetX, y: pos.y + dropHeight, z: pos.z + offsetZ },
        true
      );
    }
    
    physicsService.current.startSimulation();
    
    // Run physics simulation until settled or max steps
    let steps = 0;
    let settled = false;
    
    while (steps < maxSteps && !settled) {
      physicsService.current.step(dt);
      steps++;
      
      // Check if settled after minimum time (simulated)
      if (steps > 30) { // ~0.5s simulated
        const pieces = physicsService.current.getAllPieces();
        let maxLinSpeed = 0;
        let maxAngSpeed = 0;
        
        for (const [, pieceData] of pieces) {
          const vel = pieceData.rigidBody.linvel();
          const angVel = pieceData.rigidBody.angvel();
          const linSpeed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
          const angSpeed = Math.sqrt(angVel.x ** 2 + angVel.y ** 2 + angVel.z ** 2);
          maxLinSpeed = Math.max(maxLinSpeed, linSpeed);
          maxAngSpeed = Math.max(maxAngSpeed, angSpeed);
        }
        
        if (maxLinSpeed < 0.01 && maxAngSpeed < 0.2) {
          settled = true;
        }
      }
    }
    
    // Freeze all pieces
    physicsService.current.freezeAllPieces();
    
    // Debug: log final positions before sync
    const finalPieces = physicsService.current.getAllPieces();
    let samplePos = null;
    for (const [pieceId, pieceData] of finalPieces) {
      const pos = pieceData.rigidBody.translation();
      if (!samplePos) {
        samplePos = pos;
        console.log(`📍 [SETTLE] Sample piece ${pieceId} final pos: (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);
      }
      break;
    }
    
    // Sync visuals
    syncThreeGroups();
    
    console.log(`⚡ [INSTANT SETTLE] Completed in ${steps} steps (${(steps * dt).toFixed(2)}s simulated)`);
    return true;
  }, [fullConfig.physicsSettings?.dropHeight, syncThreeGroups]);

  // Initialize and immediately settle pieces into a pile (for page load)
  const initializeWithPile = useCallback(async (
    placematBounds: THREE.Box3,
    floorTopY: number,
    pieces: PhysicsPiece[],
    pieceGroups: Map<string, THREE.Group>
  ) => {
    // Initialize physics
    await initialize();
    
    if (!physicsService.current?.isReady()) {
      console.error('[HOOK] Failed to initialize physics');
      return;
    }
    
    // Setup world
    setupWorld(placematBounds, floorTopY);
    
    // Add pieces
    addPieces(pieces, pieceGroups);
    
    // Instantly settle into pile
    const settled = simulateInstantSettle();
    if (settled) {
      setSettledCount(pieces.length);
      setState('settled');
      console.log('📦 [HOOK] Initialized with pile');
    }
  }, [initialize, setupWorld, addPieces, simulateInstantSettle]);

  // Play sequence from settled pile: removal → reassembly → stop
  const playFullSequence = useCallback(async () => {
    // Use stateRef for check to avoid dependency on state
    if (!physicsService.current?.isReady() || stateRef.current !== 'settled') {
      console.error('[HOOK] Cannot play sequence - must be in settled state');
      return;
    }
    
    sequenceActiveRef.current = true;
    setIsPlaying(true);
    console.log('▶️ [SEQUENCE] Starting sequence from pile');
    
    // Phase 1: Start removal
    console.log('🔄 [SEQUENCE] Starting removal phase');
    physicsService.current!.unfreezeAllPieces();
    removalQueueRef.current = physicsService.current!.getPiecesSortedByHeight();
    setRemovedCount(0);
    setState('removing');
    
    // Wait for removal to complete (poll state)
    console.log(`🔄 [SEQUENCE] Starting removal poll loop`);
    let pollCount = 0;
    while (sequenceActiveRef.current && stateRef.current === 'removing') {
      pollCount++;
      if (pollCount % 10 === 0) {
        console.log(`🔄 [SEQUENCE] Poll #${pollCount} - state=${stateRef.current}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log(`� [SEQUENCE] Exited poll loop after ${pollCount} polls - sequenceActive=${sequenceActiveRef.current}, stateRef=${stateRef.current}`);
    
    if (!sequenceActiveRef.current || stateRef.current !== 'completed') {
      console.log(`⏹️ [SEQUENCE] Stopped during removal phase - active=${sequenceActiveRef.current}, state=${stateRef.current}`);
      setIsPlaying(false);
      return;
    }
    
    // Phase 2: Start reassembly (immediately after removal)
    console.log('🔄 [SEQUENCE] Starting reassembly phase - about to setup pieces');
    
    // Ensure simulation is running for the animation loop
    physicsService.current!.startSimulation();
    
    // Use startReassemblyExperiment to set up reassembly (it handles all the state setup)
    // But we need to call it via a small delay to let React process the state
    // Actually, let's just inline the core logic here to avoid state check issues
    
    try {
      // Capture waiting positions (current positions after removal)
      const allPieces = physicsService.current!.getAllPieces();
      console.log(`🔧 [SEQUENCE] Got ${allPieces.size} pieces for reassembly`);
      
      const reassemblyPieces: ReassemblyPieceState[] = [];
      
      for (const [pieceId, pieceData] of allPieces) {
        const transform = physicsService.current!.getPieceTransform(pieceId);
        const originalPos = originalAssemblyPosRef.current.get(pieceId);
        
        if (!transform || !originalPos) {
          console.warn(`[REASSEMBLY] Missing data for piece ${pieceId}`);
          continue;
        }
        
        reassemblyPieces.push({
          pieceId,
          waitingPos: transform.position.clone(),
          waitingQuat: transform.rotation.clone(),
          targetPos: originalPos.pos.clone(),
          targetQuat: originalPos.quat.clone(),
          yCentroid: originalPos.pos.y,
          placed: false
        });
      }
      
      // Sort by Y-centroid ascending (lowest pieces first)
      reassemblyPieces.sort((a, b) => a.yCentroid - b.yCentroid);
      
      reassemblyPiecesRef.current = reassemblyPieces;
      currentReassemblyRef.current = null;
      setPlacedCount(0);
      
      console.log(`🔧 [SEQUENCE] Reassembly setup complete with ${reassemblyPieces.length} pieces`);
      
      // Set state to reassembling
      setState('reassembling');
      stateRef.current = 'reassembling'; // Also update ref immediately
      
      // Run our own animation loop for reassembly (don't rely on useEffect)
      console.log(`🔧 [SEQUENCE] Starting inline reassembly animation loop`);
      
      let lastTime = performance.now();
      const runReassemblyLoop = () => {
        if (!sequenceActiveRef.current || stateRef.current !== 'reassembling') {
          console.log(`🔧 [SEQUENCE] Reassembly loop stopping - active=${sequenceActiveRef.current}, state=${stateRef.current}`);
          return;
        }
        
        // If paused, keep loop running but don't advance
        if (isPausedRef.current) {
          lastTime = performance.now();
          requestAnimationFrame(runReassemblyLoop);
          return;
        }
        
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        
        // Step physics
        if (physicsService.current) {
          physicsService.current.step(dt);
        }
        
        // Update reassembly animation
        updateReassembly();
        
        // Sync visuals
        syncThreeGroups();
        
        // Continue loop if still reassembling
        if (stateRef.current === 'reassembling') {
          requestAnimationFrame(runReassemblyLoop);
        } else {
          console.log(`🔧 [SEQUENCE] Reassembly animation complete`);
        }
      };
      
      // Start the loop
      requestAnimationFrame(runReassemblyLoop);
      
    } catch (err) {
      console.error('❌ [SEQUENCE] Error during reassembly setup:', err);
      setIsPlaying(false);
      return;
    }
    
    // Wait for reassembly to complete
    while (sequenceActiveRef.current && stateRef.current === 'reassembling') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ [SEQUENCE] Complete!');
    sequenceActiveRef.current = false;
    setIsPlaying(false);
  }, [totalPieces, simulateInstantSettle, updateReassembly, syncThreeGroups]);

  // Stop the automated sequence
  const stopSequence = useCallback(() => {
    sequenceActiveRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    isPausedRef.current = false;
    console.log('⏹️ [SEQUENCE] Stopped');
  }, []);

  // Set animation speed multiplier (for recording timing)
  const setAnimationSpeed = useCallback((speed: number) => {
    animationSpeedRef.current = Math.max(0.1, speed); // Minimum 0.1x speed
    console.log(`⚡ [HOOK] Animation speed set to ${animationSpeedRef.current}x`);
  }, []);

  // Pause the sequence
  const pauseSequence = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    console.log('⏸️ [SEQUENCE] Paused');
  }, []);

  // Resume the sequence
  const resumeSequence = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    console.log('▶️ [SEQUENCE] Resumed');
  }, []);

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
    isPlaying,
    isPaused,
    initialize,
    setupWorld,
    addPieces,
    initializeWithPile,
    startDropExperiment,
    startRemovalExperiment,
    startReassemblyExperiment,
    playFullSequence,
    pauseSequence,
    resumeSequence,
    stopSequence,
    reset,
    fullReset,
    restartDrop,
    syncThreeGroups,
    setAnimationSpeed,
  };
}
