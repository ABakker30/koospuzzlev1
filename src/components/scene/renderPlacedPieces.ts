import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView, getPieceColor } from "./sceneMath";
import { buildBonds } from "./buildBonds";

// Animation constants for piece appearance
const PIECE_APPEAR_MS = 500; // 500ms fade-in for hint/user-drawn pieces
const HINT_COLOR_ANIMATION_MS = 1000;
const GOLD_COLOR = new THREE.Color(0xffdd00);

// Animation constants for highlight glow (Phase 3A-5)
const HIGHLIGHT_GLOW_MS = 400;
const HIGHLIGHT_COLOR = new THREE.Color(0xffffff);
const HIGHLIGHT_INTENSITY = 0.6;

// Track highlight glow animation state
const highlightGlowState = new Map<string, { 
  startTime: number; 
  animationId: number | null;
  mesh: THREE.InstancedMesh;
  bondGroup?: THREE.Group;
  originalEmissive: number;
}>();

// Animation constants for visibility fade
const VISIBILITY_FADE_MS = 400;
const STAGGER_DELAY_MS = 200;

// Easing function for visibility: 30% ease-in, 40% linear, 30% ease-out
function visibilityEase(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  
  if (clamped <= 0.3) {
    // Ease-in phase (0 to 0.3) → output 0 to 0.3
    // Use quadratic ease-in: (t/0.3)^2 * 0.3
    const phase = clamped / 0.3;
    return phase * phase * 0.3;
  } else if (clamped <= 0.7) {
    // Linear phase (0.3 to 0.7) → output 0.3 to 0.7
    return clamped;
  } else {
    // Ease-out phase (0.7 to 1.0) → output 0.7 to 1.0
    // Use quadratic ease-out: 1 - (1 - (t-0.7)/0.3)^2 * 0.3
    const phase = (clamped - 0.7) / 0.3;
    return 0.7 + (1 - (1 - phase) * (1 - phase)) * 0.3;
  }
}

// Track animation state for hint pieces (color transition)
const hintAnimationState = new Map<string, { startTime: number; targetColor: THREE.Color; animationId: number | null }>();

// Track animation state for piece fade-in (opacity)
const pieceAppearState = new Map<string, { startTime: number; targetOpacity: number; animationId: number | null; mesh: THREE.InstancedMesh; bondGroup?: THREE.Group }>();

// Track visibility fade animation state
const visibilityAnimationState = {
  isAnimating: false,
  animationId: null as number | null,
  startTime: 0,
  fadingOut: false, // true = fading to hidden, false = fading to visible
  lastHiddenState: false, // track previous state to detect changes
};

export function renderPlacedPieces(opts: {
  scene: THREE.Scene;

  // refs
  placedMeshesRef: React.MutableRefObject<Map<string, THREE.InstancedMesh>>;
  placedBondsRef: React.MutableRefObject<Map<string, THREE.Group>>;
  placedPiecesGroupRef: React.MutableRefObject<THREE.Group | null>;

  // inputs
  view: ViewTransforms;
  placedPieces: Array<{
    uid: string;
    pieceId: string;
    orientationId: string;
    anchorSphereIndex: 0 | 1 | 2 | 3;
    cells: IJK[];
    placedAt: number;
    reason?: 'hint' | 'computer' | 'user' | 'undo';
  }>;

  // selection / visibility
  selectedPieceUid: string | null;
  highlightedPieceUid?: string | null; // Phase 3A-5: temporary glow highlight
  hidePlacedPieces: boolean;
  temporarilyVisiblePieces: Set<string>;

  // rendering knobs
  puzzleMode: 'oneOfEach' | 'unlimited' | 'single';
  showBonds: boolean;

  // material settings
  piecesMetalness: number;
  piecesRoughness: number;
  piecesOpacity: number;
  sphereColorTheme?: 'default' | 'whiteMarbleCluster';
}) {
  const {
    scene,
    placedMeshesRef,
    placedBondsRef,
    placedPiecesGroupRef,
    view,
    placedPieces,
    selectedPieceUid,
    highlightedPieceUid,
    hidePlacedPieces,
    temporarilyVisiblePieces,
    puzzleMode,
    showBonds,
    piecesMetalness,
    piecesRoughness,
    piecesOpacity,
    sphereColorTheme,
  } = opts;

  const placedGroup = placedPiecesGroupRef.current;

  // Detect visibility state change and start staggered fade animation
  const shouldBeHidden = hidePlacedPieces && temporarilyVisiblePieces.size === 0;
  
  if (shouldBeHidden !== visibilityAnimationState.lastHiddenState) {
    // State changed - start staggered fade animation
    visibilityAnimationState.lastHiddenState = shouldBeHidden;
    visibilityAnimationState.fadingOut = shouldBeHidden;
    visibilityAnimationState.startTime = Date.now();
    visibilityAnimationState.isAnimating = true;
    
    // Cancel any existing animation
    if (visibilityAnimationState.animationId) {
      cancelAnimationFrame(visibilityAnimationState.animationId);
    }
    
    // Get list of pieces to animate (excluding temporarily visible ones when fading out)
    const pieceUids = Array.from(placedMeshesRef.current.keys()).filter(uid => {
      if (visibilityAnimationState.fadingOut && temporarilyVisiblePieces.has(uid)) {
        return false;
      }
      return true;
    });
    
    const numPieces = pieceUids.length;
    const totalDuration = VISIBILITY_FADE_MS + (numPieces - 1) * STAGGER_DELAY_MS;
    
    // Start the staggered fade animation
    const animateFade = () => {
      const elapsed = Date.now() - visibilityAnimationState.startTime;
      
      // Update each piece with its staggered timing
      pieceUids.forEach((uid, index) => {
        const pieceStartTime = index * STAGGER_DELAY_MS;
        const pieceElapsed = Math.max(0, elapsed - pieceStartTime);
        const pieceT = Math.min(1, pieceElapsed / VISIBILITY_FADE_MS);
        
        // Apply non-linear easing: 30% ease-in, 40% linear, 30% ease-out
        const easedT = visibilityEase(pieceT);
        
        // Calculate opacity for this piece
        const pieceOpacity = visibilityAnimationState.fadingOut 
          ? piecesOpacity * (1 - easedT) 
          : piecesOpacity * easedT;
        
        // Update mesh
        const mesh = placedMeshesRef.current.get(uid);
        if (mesh) {
          mesh.visible = true;
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.transparent = true;
          material.opacity = pieceOpacity;
          material.needsUpdate = true;
        }
        
        // Update bonds
        const bondGroup = placedBondsRef.current.get(uid);
        if (bondGroup) {
          bondGroup.visible = true;
          bondGroup.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              const material = obj.material as THREE.MeshStandardMaterial;
              material.transparent = true;
              material.opacity = pieceOpacity;
              material.needsUpdate = true;
            }
          });
        }
      });
      
      if (elapsed < totalDuration) {
        visibilityAnimationState.animationId = requestAnimationFrame(animateFade);
      } else {
        visibilityAnimationState.isAnimating = false;
        visibilityAnimationState.animationId = null;
        
        // After fade out completes, actually hide the meshes
        if (visibilityAnimationState.fadingOut) {
          for (const uid of pieceUids) {
            const mesh = placedMeshesRef.current.get(uid);
            if (mesh) mesh.visible = false;
            const bondGroup = placedBondsRef.current.get(uid);
            if (bondGroup) bondGroup.visible = false;
          }
        }
      }
    };
    
    visibilityAnimationState.animationId = requestAnimationFrame(animateFade);
  }
  
  // Handle temporarily visible pieces (should always be visible at full opacity)
  for (const uid of temporarilyVisiblePieces) {
    const mesh = placedMeshesRef.current.get(uid);
    if (mesh) {
      mesh.visible = true;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.opacity = piecesOpacity;
      material.needsUpdate = true;
    }
    const bondGroup = placedBondsRef.current.get(uid);
    if (bondGroup) {
      bondGroup.visible = true;
      bondGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const material = obj.material as THREE.MeshStandardMaterial;
          material.opacity = piecesOpacity;
          material.needsUpdate = true;
        }
      });
    }
  }

  // If currently hidden and not animating, skip further processing
  if (shouldBeHidden && !visibilityAnimationState.isAnimating) {
    return;
  }

  // Phase 3A-5: Handle highlight glow animation for highlightedPieceUid
  if (highlightedPieceUid && !highlightGlowState.has(highlightedPieceUid)) {
    const mesh = placedMeshesRef.current.get(highlightedPieceUid);
    const bondGroup = placedBondsRef.current.get(highlightedPieceUid);
    
    if (mesh) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const originalEmissive = material.emissive.getHex();
      
      // Start glow animation
      const glowState = {
        startTime: Date.now(),
        animationId: null as number | null,
        mesh,
        bondGroup,
        originalEmissive,
      };
      highlightGlowState.set(highlightedPieceUid, glowState);
      
      const animateGlow = () => {
        const elapsed = Date.now() - glowState.startTime;
        const t = Math.min(1, elapsed / HIGHLIGHT_GLOW_MS);
        
        // Pulse: ramp up then down (sine curve)
        const pulseT = Math.sin(t * Math.PI);
        const intensity = HIGHLIGHT_INTENSITY * pulseT;
        
        // Apply emissive glow
        const meshMat = glowState.mesh.material as THREE.MeshStandardMaterial;
        meshMat.emissive.copy(HIGHLIGHT_COLOR);
        meshMat.emissiveIntensity = intensity;
        meshMat.needsUpdate = true;
        
        // Apply to bonds too
        if (glowState.bondGroup) {
          glowState.bondGroup.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
              obj.material.emissive.copy(HIGHLIGHT_COLOR);
              obj.material.emissiveIntensity = intensity;
              obj.material.needsUpdate = true;
            }
          });
        }
        
        if (t < 1) {
          glowState.animationId = requestAnimationFrame(animateGlow);
        } else {
          // Reset emissive to original
          meshMat.emissive.setHex(glowState.originalEmissive);
          meshMat.emissiveIntensity = glowState.originalEmissive === 0 ? 0 : 0.3;
          meshMat.needsUpdate = true;
          
          if (glowState.bondGroup) {
            glowState.bondGroup.traverse((obj) => {
              if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
                obj.material.emissive.setHex(glowState.originalEmissive);
                obj.material.emissiveIntensity = glowState.originalEmissive === 0 ? 0 : 0.3;
                obj.material.needsUpdate = true;
              }
            });
          }
          
          highlightGlowState.delete(highlightedPieceUid!);
        }
      };
      
      glowState.animationId = requestAnimationFrame(animateGlow);
      console.log('✨ [renderPlacedPieces] Started highlight glow for:', highlightedPieceUid);
    }
  }

  const M = mat4ToThree(view.M_world);
  const radius = estimateSphereRadiusFromView(view);

  // Clean up removed pieces
  const currentUids = new Set(placedPieces.map((p) => p.uid));

  for (const [uid, mesh] of placedMeshesRef.current.entries()) {
    if (!currentUids.has(uid)) {
      if (placedGroup) placedGroup.remove(mesh);
      else scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      placedMeshesRef.current.delete(uid);
    }
  }

  for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
    if (!currentUids.has(uid)) {
      if (placedGroup) placedGroup.remove(bondGroup);
      else scene.remove(bondGroup);
      bondGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      placedBondsRef.current.delete(uid);
    }
  }

  const BOND_RADIUS_FACTOR = 0.35;

  // Create hash of M_world for change detection
  const M_flat = view.M_world.flat();
  const M_hash = M_flat.map(v => v.toFixed(6)).join(',');

  // Debug logging disabled to reduce console noise
  // console.log(`🔧 [renderPlacedPieces] Current M_hash (first 100 chars): ${M_hash.substring(0, 100)}...`);
  // console.log(`🔧 [renderPlacedPieces] Processing ${placedPieces.length} pieces`);

  for (const piece of placedPieces) {
    const isSelected = piece.uid === selectedPieceUid;

    // If already exists, check if we must recreate (selection, puzzleMode, or view changed)
    if (placedMeshesRef.current.has(piece.uid)) {
      const existingMesh = placedMeshesRef.current.get(piece.uid)!;
      const existingM_hash = existingMesh.userData.M_hash || 'undefined';
      const currentEmissive = (existingMesh.material as THREE.MeshStandardMaterial).emissive.getHex();
      const shouldBeEmissive = isSelected ? 0xffffff : 0x000000;

      const emissiveChanged = currentEmissive !== shouldBeEmissive;
      const puzzleModeChanged = existingMesh.userData.puzzleMode !== puzzleMode;
      const viewChanged = existingM_hash !== M_hash;

      const needsRecreate = emissiveChanged || puzzleModeChanged || viewChanged;

      if (viewChanged) {
        console.log(`🔄 [renderPlacedPieces] View changed for piece ${piece.uid.substring(0, 8)}`);
        console.log(`   Old M_hash (first 100): ${existingM_hash.substring(0, 100)}...`);
        console.log(`   New M_hash (first 100): ${M_hash.substring(0, 100)}...`);
        console.log(`   Will recreate: ${needsRecreate}`);
      }

      if (!needsRecreate) continue;

      // remove old mesh
      if (placedGroup) placedGroup.remove(existingMesh);
      else scene.remove(existingMesh);
      existingMesh.geometry.dispose();
      (existingMesh.material as THREE.Material).dispose();
      placedMeshesRef.current.delete(piece.uid);

      // remove old bonds
      const existingBonds = placedBondsRef.current.get(piece.uid);
      if (existingBonds) {
        if (placedGroup) placedGroup.remove(existingBonds);
        else scene.remove(existingBonds);
        existingBonds.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        placedBondsRef.current.delete(piece.uid);
      }
    }

    // Create new instanced mesh
    const geom = new THREE.SphereGeometry(radius, 64, 64);

    const colorKey = puzzleMode === 'oneOfEach' ? piece.pieceId : piece.uid;
    const targetColor = getPieceColor(colorKey, sphereColorTheme);
    
    // Check if this is a hint piece that should animate from gold to piece color
    const isHintPiece = piece.reason === 'hint';
    const timeSincePlacement = Date.now() - piece.placedAt;
    const shouldAnimateColor = isHintPiece && timeSincePlacement < HINT_COLOR_ANIMATION_MS;
    
    // Start with gold color for hint pieces, otherwise use target color
    const initialColor = shouldAnimateColor ? GOLD_COLOR.clone() : targetColor;

    // Check if this is a newly placed piece that needs fade-in animation
    const isNewPiece = timeSincePlacement < PIECE_APPEAR_MS;
    const initialOpacity = isNewPiece ? 0 : piecesOpacity;
    
    const mat = new THREE.MeshStandardMaterial({
      color: initialColor,
      metalness: piecesMetalness,
      roughness: piecesRoughness,
      transparent: true, // Always transparent for fade animation
      opacity: initialOpacity,
      envMapIntensity: 1.5,
      emissive: isSelected ? 0xffffff : 0x000000,
      emissiveIntensity: isSelected ? 0.3 : 0,
    });

    const mesh = new THREE.InstancedMesh(geom, mat, piece.cells.length);
    mesh.renderOrder = 1; // Render after container (renderOrder 0) for proper transparency
    
    // Start color animation for hint pieces
    if (shouldAnimateColor) {
      // Cancel any existing animation for this piece
      const existingAnim = hintAnimationState.get(piece.uid);
      if (existingAnim?.animationId) {
        cancelAnimationFrame(existingAnim.animationId);
      }
      
      const animState = {
        startTime: piece.placedAt,
        targetColor: new THREE.Color(targetColor),
        animationId: null as number | null
      };
      hintAnimationState.set(piece.uid, animState);
      
      const animateColor = () => {
        const elapsed = Date.now() - animState.startTime;
        const t = Math.min(1, elapsed / HINT_COLOR_ANIMATION_MS);
        
        // Lerp from gold to target color
        const currentColor = new THREE.Color().lerpColors(GOLD_COLOR, animState.targetColor, t);
        mat.color.copy(currentColor);
        mat.needsUpdate = true;
        
        if (t < 1) {
          animState.animationId = requestAnimationFrame(animateColor);
        } else {
          hintAnimationState.delete(piece.uid);
        }
      };
      
      animState.animationId = requestAnimationFrame(animateColor);
    }

    const spherePositions: THREE.Vector3[] = [];
    for (let i = 0; i < piece.cells.length; i++) {
      const cell = piece.cells[i];
      const p = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      spherePositions.push(p);

      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.puzzleMode = puzzleMode;
    mesh.userData.M_hash = M_hash; // Store M_world hash for change detection

    // Debug: Log first sphere position for first piece
    if (piece.uid.includes('-0') && spherePositions.length > 0) {
      console.log(`🔍 [renderPlacedPieces] First sphere of piece ${piece.uid.substring(0, 12)}: (${spherePositions[0].x.toFixed(3)}, ${spherePositions[0].y.toFixed(3)}, ${spherePositions[0].z.toFixed(3)})`);
    }

    if (placedGroup) placedGroup.add(mesh);
    else scene.add(mesh);

    placedMeshesRef.current.set(piece.uid, mesh);

    if (showBonds) {
      const { bondGroup } = buildBonds({
        spherePositions,
        radius,
        material: mat,
        bondRadiusFactor: BOND_RADIUS_FACTOR,
        thresholdFactor: 1.1,
        radialSegments: 48,
      });

      bondGroup.children.forEach((m) => {
        (m as any).castShadow = true;
        (m as any).receiveShadow = true;
        (m as any).renderOrder = 1; // Render after container for proper transparency
      });

      if (placedGroup) placedGroup.add(bondGroup);
      else scene.add(bondGroup);

      placedBondsRef.current.set(piece.uid, bondGroup);
      
      // Start fade-in animation for new pieces (includes bonds)
      if (isNewPiece && !pieceAppearState.has(piece.uid)) {
        const appearState = {
          startTime: piece.placedAt,
          targetOpacity: piecesOpacity,
          animationId: null as number | null,
          mesh,
          bondGroup,
        };
        pieceAppearState.set(piece.uid, appearState);
        
        const animateAppear = () => {
          const elapsed = Date.now() - appearState.startTime;
          const t = Math.min(1, elapsed / PIECE_APPEAR_MS);
          const currentOpacity = t * appearState.targetOpacity;
          
          // Update mesh material
          const meshMat = appearState.mesh.material as THREE.MeshStandardMaterial;
          meshMat.opacity = currentOpacity;
          meshMat.needsUpdate = true;
          
          // Update bond materials
          if (appearState.bondGroup) {
            appearState.bondGroup.traverse((obj) => {
              if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
                obj.material.opacity = currentOpacity;
                obj.material.needsUpdate = true;
              }
            });
          }
          
          if (t < 1) {
            appearState.animationId = requestAnimationFrame(animateAppear);
          } else {
            pieceAppearState.delete(piece.uid);
          }
        };
        
        appearState.animationId = requestAnimationFrame(animateAppear);
      }
    } else if (isNewPiece && !pieceAppearState.has(piece.uid)) {
      // No bonds case - still animate the mesh
      const appearState = {
        startTime: piece.placedAt,
        targetOpacity: piecesOpacity,
        animationId: null as number | null,
        mesh,
      };
      pieceAppearState.set(piece.uid, appearState);
      
      const animateAppear = () => {
        const elapsed = Date.now() - appearState.startTime;
        const t = Math.min(1, elapsed / PIECE_APPEAR_MS);
        const currentOpacity = t * appearState.targetOpacity;
        
        const meshMat = appearState.mesh.material as THREE.MeshStandardMaterial;
        meshMat.opacity = currentOpacity;
        meshMat.needsUpdate = true;
        
        if (t < 1) {
          appearState.animationId = requestAnimationFrame(animateAppear);
        } else {
          pieceAppearState.delete(piece.uid);
        }
      };
      
      appearState.animationId = requestAnimationFrame(animateAppear);
    }
  }
}
