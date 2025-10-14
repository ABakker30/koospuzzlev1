// View Pieces Modal - Minimal 3D piece picker with swipe navigation
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GoldOrientationService } from '../../services/GoldOrientationService';

// Generate highly distinct colors for up to 25+ pieces (copied from SceneCanvas)
function getPieceColor(pieceId: string): number {
  let hash = 0;
  for (let i = 0; i < pieceId.length; i++) {
    hash = (hash * 31 + pieceId.charCodeAt(i)) >>> 0;
  }
  const hueOffsets = [0, 137, 205, 49, 173, 25, 198, 90, 156, 64, 220, 104, 12, 180, 88, 244, 32, 142, 76, 212, 108, 40, 164, 196, 120];
  const hue = hueOffsets[hash % hueOffsets.length];
  const saturation = 75 + (hash % 20);
  const lightness = 52 + ((hash >> 4) % 12);
  const r = hslToRgb(hue / 360, saturation / 100, lightness / 100);
  return (r[0] << 16) | (r[1] << 8) | r[2];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export interface ViewPiecesModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (pieceId: string) => void;
  piecesAll: string[];
  mode: 'oneOfEach' | 'unlimited' | 'single';
  placedCountByPieceId: Record<string, number>;
  lastViewedPiece?: string;
}

export const ViewPiecesModal: React.FC<ViewPiecesModalProps> = ({
  open,
  onClose,
  onSelect,
  piecesAll,
  mode,
  placedCountByPieceId,
  lastViewedPiece
}) => {
  // Derive available pieces based on mode
  const availablePieces = mode === 'oneOfEach'
    ? piecesAll.filter(p => (placedCountByPieceId[p] ?? 0) === 0)
    : piecesAll;

  // Find initial index
  const initialIndex = lastViewedPiece && availablePieces.includes(lastViewedPiece)
    ? availablePieces.indexOf(lastViewedPiece)
    : 0;

  const [index, setIndex] = useState(initialIndex);
  const currentPieceId = availablePieces[index] || '';

  // Reset index when modal opens
  useEffect(() => {
    if (open) {
      const newIndex = lastViewedPiece && availablePieces.includes(lastViewedPiece)
        ? availablePieces.indexOf(lastViewedPiece)
        : 0;
      setIndex(newIndex);
    }
  }, [open, lastViewedPiece, availablePieces]);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const orientationServiceRef = useRef<GoldOrientationService>();
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  
  // Draggable modal state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Navigation functions
  const goNext = () => {
    if (availablePieces.length === 0) return;
    setIndex((prev) => (prev + 1) % availablePieces.length);
  };

  const goPrev = () => {
    if (availablePieces.length === 0) return;
    setIndex((prev) => (prev - 1 + availablePieces.length) % availablePieces.length);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goPrev();
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        goNext();
        e.preventDefault();
      } else if (e.key === 'Enter' && currentPieceId) {
        onSelect(currentPieceId);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentPieceId, availablePieces.length]);

  // Dragging logic for modal window (desktop and mobile)
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag from the top part (header area)
      const target = e.target as HTMLElement;
      if (target.closest('.piece-info-header') || target.classList.contains('modal-drag-handle')) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.piece-info-header') || target.classList.contains('modal-drag-handle')) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
      } else {
        // Track start position for swipe detection on 3D viewer area
        const touch = e.touches[0];
        touchStartXRef.current = touch.clientX;
        touchStartYRef.current = touch.clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isDragging) {
        setIsDragging(false);
      } else {
        // Handle swipe for navigation - only if it's a clear horizontal swipe
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartXRef.current - touchEndX;
        const diffY = touchStartYRef.current - touchEndY;
        
        const horizontalThreshold = 80; // Increased from 50
        const verticalToHorizontalRatio = 0.5; // Max 50% vertical movement relative to horizontal
        
        // Only navigate if:
        // 1. Horizontal movement exceeds threshold
        // 2. Vertical movement is small relative to horizontal (not orbiting)
        if (Math.abs(diffX) > horizontalThreshold && 
            Math.abs(diffY) < Math.abs(diffX) * verticalToHorizontalRatio) {
          if (diffX > 0) {
            goNext();
          } else {
            goPrev();
          }
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [open, isDragging, dragStart, position, availablePieces.length]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!open || !mountRef.current) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // White background
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(3, 3, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lighting (Solution Viewer parity)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    // Key directional light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(10, 10, 5);
    scene.add(keyLight);

    // Fill lights for better illumination
    const fillLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight1.position.set(-5, 5, 5);
    scene.add(fillLight1);

    const fillLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight2.position.set(5, -5, -5);
    scene.add(fillLight2);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Load orientation service
    (async () => {
      try {
        const svc = new GoldOrientationService();
        await svc.load();
        orientationServiceRef.current = svc;
      } catch (error) {
        console.error('Failed to load orientation service:', error);
      }
    })();

    // Handle resize
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [open]);

  // Render current piece
  useEffect(() => {
    if (!open || !sceneRef.current || !orientationServiceRef.current || !currentPieceId) return;

    const scene = sceneRef.current;
    
    // Clear previous piece (keep lights)
    const lightsToKeep = scene.children.filter(
      child => child instanceof THREE.AmbientLight || child instanceof THREE.DirectionalLight
    );
    scene.children = [...lightsToKeep];

    // Get piece geometry
    const svc = orientationServiceRef.current;
    const orientations = svc.getOrientations(currentPieceId);
    if (!orientations || orientations.length === 0) return;

    // Use first orientation - access ijkOffsets array
    const cells = orientations[0].ijkOffsets;
    const color = getPieceColor(currentPieceId);

    // Convert IJK to world positions
    const positions: THREE.Vector3[] = [];
    for (const cell of cells) {
      const { i, j, k } = cell;
      const x = 0.5 * i + 0.5 * j;
      const y = 0.5 * i + 0.5 * k;
      const z = 0.5 * j + 0.5 * k;
      positions.push(new THREE.Vector3(x, y, z));
    }

    // Compute sphere radius: 0.5 * minimum distance between any two centers
    let minDistance = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = positions[i].distanceTo(positions[j]);
        if (dist > 0 && dist < minDistance) {
          minDistance = dist;
        }
      }
    }
    const radius = minDistance > 0 && isFinite(minDistance) ? minDistance * 0.5 : 0.5;

    // Calculate centroid for centering
    const centroid = new THREE.Vector3();
    positions.forEach(p => centroid.add(p));
    centroid.multiplyScalar(1 / positions.length);

    // Center positions
    const centeredPositions: THREE.Vector3[] = [];
    positions.forEach(p => {
      centeredPositions.push(new THREE.Vector3(p.x - centroid.x, p.y - centroid.y, p.z - centroid.z));
    });

    // Create spheres with Solution Viewer material settings
    const geom = new THREE.SphereGeometry(radius, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.40,  // Solution Viewer parity
      roughness: 0.10,  // Solution Viewer parity
      transparent: false,
      opacity: 1.0,
      envMapIntensity: 1.5  // Solution Viewer parity
    });

    centeredPositions.forEach(pos => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(pos);
      scene.add(mesh);
    });

    // Create bonds with Solution Viewer settings
    const bondRadius = 0.35 * radius; // Solution Viewer BOND_RADIUS_FACTOR
    const bondGeom = new THREE.CylinderGeometry(bondRadius, bondRadius, 1, 48);
    const bondMat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.40,
      roughness: 0.10,
      envMapIntensity: 1.5
    });

    const sphereDiameter = 2 * radius;
    const bondThreshold = 1.1 * sphereDiameter; // Solution Viewer bond detection

    for (let i = 0; i < centeredPositions.length; i++) {
      for (let j = i + 1; j < centeredPositions.length; j++) {
        const dist = centeredPositions[i].distanceTo(centeredPositions[j]);
        if (dist <= bondThreshold) {
          const midpoint = new THREE.Vector3()
            .addVectors(centeredPositions[i], centeredPositions[j])
            .multiplyScalar(0.5);
          
          const bondMesh = new THREE.Mesh(bondGeom, bondMat);
          bondMesh.position.copy(midpoint);
          bondMesh.scale.y = dist;
          
          const direction = new THREE.Vector3()
            .subVectors(centeredPositions[j], centeredPositions[i])
            .normalize();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
          );
          bondMesh.setRotationFromQuaternion(quaternion);
          
          scene.add(bondMesh);
        }
      }
    }

    // Fit camera
    if (controlsRef.current && cameraRef.current) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      
      const boundingRadius = Math.max(...centeredPositions.map(p => p.length())) + radius;
      const distance = boundingRadius / Math.tan((camera.fov / 2) * (Math.PI / 180));
      camera.position.set(distance, distance, distance);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [open, currentPieceId]);

  // Telemetry
  useEffect(() => {
    if (open) {
      console.log('manual:viewPiecesOpen', { available: availablePieces.length });
    }
  }, [open]);

  const handleClose = () => {
    console.log('manual:viewPiecesClose');
    onClose();
  };

  const handleSelect = () => {
    if (currentPieceId) {
      onSelect(currentPieceId);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Floating Modal Window */}
      <div
        ref={modalRef}
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          width: '90%',
          maxWidth: '600px',
          height: '70vh',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable Header */}
        <div
          className="modal-drag-handle piece-info-header"
          style={{
            padding: '0.5rem 1rem',
            background: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            cursor: 'grab',
            userSelect: 'none',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: '#666',
              cursor: 'pointer',
              padding: '0 0.5rem'
            }}
          >
            ×
          </button>
        </div>
        {/* 3D Viewer */}
        <div
          ref={mountRef}
          style={{
            flex: 1,
            position: 'relative',
            touchAction: 'pan-y' // Allow vertical scroll but capture horizontal swipes
          }}
        />

        {/* Bottom Controls */}
        <div
          style={{
            padding: '1.5rem',
            background: '#f9f9f9',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center'
          }}
        >
        {availablePieces.length === 0 ? (
          <div style={{ color: '#333', fontSize: '1.1rem' }}>
            No pieces available
          </div>
        ) : (
          <>
            {/* Piece Info */}
            <div
              style={{
                color: '#333',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <button
                onClick={goPrev}
                style={{
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  color: '#333',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1.2rem'
                }}
              >
                ←
              </button>
              
              <div style={{ minWidth: '100px', textAlign: 'center' }}>
                <div>{currentPieceId}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                  {index + 1} / {availablePieces.length}
                </div>
              </div>
              
              <button
                onClick={goNext}
                style={{
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  color: '#333',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1.2rem'
                }}
              >
                →
              </button>
            </div>

            {/* Select Button */}
            <button
              onClick={handleSelect}
              className="btn primary"
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1.1rem',
                minWidth: '150px'
              }}
            >
              Select Piece
            </button>
          </>
        )}

        {/* Close hint */}
        <div style={{ color: '#666', fontSize: '0.85rem' }}>
          {availablePieces.length > 0 && 'Swipe or use ← → to browse • '}Press Esc to cancel
        </div>
      </div>
      </div>
    </div>
  );
};
