// Piece Browser Modal with integrated 3D canvas for ManualSolvePage
// Shows 25 pieces in carousel with embedded Three.js preview

import React, { useState, useEffect, useCallback } from 'react';
import { GoldOrientationService } from '../../../services/GoldOrientationService';
import SceneCanvas from '../../../components/SceneCanvas';
import { computeViewTransforms } from '../../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import { ijkToXyz } from '../../../lib/ijk';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../../types/studio';
import type { VisibilitySettings } from '../../../types/lattice';

type Mode = 'oneOfEach' | 'single';

interface PieceBrowserModalProps {
  isOpen: boolean;
  pieces: string[];
  activePiece: string;
  settings?: StudioSettings; // Optional environment settings from parent
  mode: Mode; // Current placement mode
  placedCountByPieceId: Record<string, number>; // How many of each piece are placed
  onSelectPiece: (pieceId: string) => void; // No-op in read-only mode
  onClose: () => void;
}

export const PieceBrowserModal: React.FC<PieceBrowserModalProps> = ({
  isOpen,
  pieces,
  activePiece,
  settings = DEFAULT_STUDIO_SETTINGS,
  mode,
  placedCountByPieceId,
  onSelectPiece,
  onClose
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<GoldOrientationService | null>(null);
  const [previewCells, setPreviewCells] = useState<any[]>([]);
  const [previewView, setPreviewView] = useState<any>(null);
  const [previewPiece, setPreviewPiece] = useState<any>(null);
  const [resetCameraFlag, setResetCameraFlag] = useState(0);
  const [sceneObjects, setSceneObjects] = useState<any>(null);

  // FCC transform matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];

  // Load orientation service
  useEffect(() => {
    if (!isOpen) return;

    const loadService = async () => {
      try {
        setLoading(true);
        const svc = new GoldOrientationService();
        await svc.load();
        setService(svc);
        
        // Set initial index to active piece
        const initialIdx = pieces.indexOf(activePiece);
        setCurrentIndex(initialIdx >= 0 ? initialIdx : 0);
      } catch (err) {
        console.error('Failed to load orientation service:', err);
      } finally {
        setLoading(false);
      }
    };

    loadService();
  }, [isOpen, activePiece, pieces]);

  // Load piece preview when index changes
  useEffect(() => {
    if (!service || !isOpen) return;

    const pieceId = pieces[currentIndex];
    if (!pieceId) return;

    try {
      const orientations = service.getOrientations(pieceId);
      if (orientations.length === 0) {
        console.warn(`No orientations for piece ${pieceId}`);
        return;
      }

      const firstOrientation = orientations[0];
      const originalCells = firstOrientation.ijkOffsets;

      // Calculate centroid in IJK space
      let sumI = 0, sumJ = 0, sumK = 0;
      originalCells.forEach((cell: any) => {
        sumI += cell.i;
        sumJ += cell.j;
        sumK += cell.k;
      });
      const centroidI = sumI / originalCells.length;
      const centroidJ = sumJ / originalCells.length;
      const centroidK = sumK / originalCells.length;

      // Translate cells so centroid is at origin
      const centeredCells = originalCells.map((cell: any) => ({
        i: cell.i - centroidI,
        j: cell.j - centroidJ,
        k: cell.k - centroidK
      }));

      // Compute view transforms with centered cells
      const viewTransforms = computeViewTransforms(
        centeredCells,
        ijkToXyz,
        T_ijk_to_xyz,
        quickHullWithCoplanarMerge
      );

      setPreviewCells(centeredCells);
      setPreviewView(viewTransforms);
      
      // Create a placed piece for rendering with centered cells
      const placedPiece = {
        pieceId,
        orientationId: firstOrientation.orientationId,
        cells: centeredCells,
        anchorSphereIndex: 0,
        uid: `preview-${pieceId}`,
        placedAt: Date.now()
      };
      
      setPreviewPiece(placedPiece);
      
      // Trigger camera reset to frame the piece
      setResetCameraFlag(prev => prev + 1);
      
      console.log(`📦 Preview piece ${pieceId}: ${centeredCells.length} cells`);
    } catch (err) {
      console.error('Failed to load piece preview:', err);
    }
  }, [service, currentIndex, pieces, isOpen]);

  // Reset camera when piece changes
  useEffect(() => {
    if (resetCameraFlag > 0 && previewPiece && sceneObjects) {
      console.log('🎬 Attempting to frame piece in view...');
      
      const { camera, controls } = sceneObjects;
      
      if (!camera || !controls) {
        console.warn('⚠️ Camera or controls not available');
        return;
      }
      
      const cells = previewPiece.cells;

      console.log(`📐 Computing bounds for ${cells.length} cells...`);

      // Compute bounding box of the piece using FCC transform
      // Note: Piece is already centered at origin in IJK space
      const T = [
        [0.5, 0.5, 0],
        [0.5, 0, 0.5],
        [0, 0.5, 0.5]
      ];

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      cells.forEach((cell: any) => {
        const x = T[0][0] * cell.i + T[0][1] * cell.j + T[0][2] * cell.k;
        const y = T[1][0] * cell.i + T[1][1] * cell.j + T[1][2] * cell.k;
        const z = T[2][0] * cell.i + T[2][1] * cell.j + T[2][2] * cell.k;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      });

      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;
      
      // Add sphere radius to bounding box (spheres have radius ~0.5 in FCC)
      const sphereRadius = 0.5;
      const paddedSizeX = sizeX + sphereRadius * 2;
      const paddedSizeY = sizeY + sphereRadius * 2;
      const paddedSizeZ = sizeZ + sphereRadius * 2;
      const size = Math.max(paddedSizeX, paddedSizeY, paddedSizeZ);

      // Calculate distance to fit piece in view (maximum zoom)
      const fov = camera.fov * (Math.PI / 180);
      const distance = (size / 2) / Math.tan(fov / 2) * 1.1; // Maximum zoom while keeping piece fully visible

      // Position camera along (1,1,1) diagonal looking at origin
      // Piece is already centered at origin, so camera just needs to be at distance
      const cameraOffset = distance * 0.75;
      camera.position.set(cameraOffset, cameraOffset, cameraOffset);

      // Set orbit pivot to origin where piece is centered
      controls.target.set(0, 0, 0);
      
      // Ensure orbit controls are enabled
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.update();

      console.log(`✅ Camera fitted! Center: (0, 0, 0), Size: ${size.toFixed(2)}, Distance: ${distance.toFixed(2)}`);
      console.log(`📷 Camera position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
      console.log(`🎮 Orbit controls: enabled=${controls.enabled}, rotate=${controls.enableRotate}, zoom=${controls.enableZoom}, pan=${controls.enablePan}`);
    }
  }, [resetCameraFlag, previewPiece, sceneObjects]);

  // Navigation
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pieces.length - 1));
  }, [pieces.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < pieces.length - 1 ? prev + 1 : 0));
  }, [pieces.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrevious, handleNext, onClose]);

  if (!isOpen) return null;

  const currentPiece = pieces[currentIndex];
  const cellCount = previewCells.length;
  const placedCount = placedCountByPieceId[currentPiece] ?? 0;
  
  // Determine status display based on mode
  const statusText = mode === 'oneOfEach' 
    ? (placedCount > 0 ? '✓ Placed' : '○ Available')
    : `${placedCount} placed`;
  const statusColor = mode === 'oneOfEach'
    ? (placedCount > 0 ? '#4ade80' : '#94a3b8')
    : '#60a5fa';

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
        width: '90vw',
        height: '85vh',
        maxWidth: '1200px',
        maxHeight: '800px',
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      }}>
      {/* Top Bar */}
      <div style={{
        background: 'rgba(20, 20, 25, 0.92)',
        backdropFilter: 'blur(12px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}>
        <div>
          <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600 }}>
            📦 Piece {currentPiece}
          </div>
          <div style={{ color: '#999', fontSize: '0.9rem', marginTop: '4px' }}>
            🔵 {cellCount} cells • Standard Koos piece
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div
            style={{
              padding: '0.6rem 1.5rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.05)',
              color: statusColor,
              border: `1px solid ${statusColor}40`,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {statusText}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.6rem 1rem',
              fontSize: '1.1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 3D Preview Canvas */}
      <div style={{
        flex: 1,
        position: 'relative',
        background: '#000',
        minHeight: 0, // Important for flex child
        overflow: 'hidden',
        pointerEvents: 'auto', // Ensure events reach canvas
      }}>
        {loading ? (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff',
            fontSize: '1.2rem',
            zIndex: 10,
            pointerEvents: 'none',
          }}>
            Loading pieces...
          </div>
        ) : previewView && previewPiece ? (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto', // Critical for orbit controls
          }}>
            <SceneCanvas
              cells={[]}
              view={previewView}
              visibility={{
                showSpheres: true,
                showBonds: true,
                showConvexHull: false,
                showShadows: settings.lights.shadows.enabled,
                xray: false,
                emptyOnly: false,
                sliceY: null as any,
              } as VisibilitySettings}
              editMode={false}
              mode="add"
              settings={settings}
              onCellsChange={() => {}}
              onHoverCell={() => {}}
              onClickCell={undefined}
              anchor={null}
              previewOffsets={null}
              placedPieces={[previewPiece]}
              selectedPieceUid={null}
              onSelectPiece={() => {}}
              containerOpacity={0}
              containerColor="#ffffff"
              containerRoughness={0.35}
              puzzleMode="oneOfEach"
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={undefined}
              drawingCells={[]}
              onDrawCell={undefined}
              hidePlacedPieces={false}
              explosionFactor={0}
              turntableRotation={0}
              onInteraction={undefined}
              onSceneReady={(sceneObjs) => {
                console.log('🎬 Scene ready, saving scene objects');
                setSceneObjects(sceneObjs);
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Bottom Navigation Bar */}
      <div style={{
        background: 'rgba(20, 20, 25, 0.92)',
        backdropFilter: 'blur(12px) saturate(180%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.02), inset 0 -1px 0 rgba(255, 255, 255, 0.05)',
      }}>
        <button
          onClick={handlePrevious}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 500,
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          ◀ Previous
        </button>
        
        <div style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.95rem',
          fontWeight: 500,
        }}>
          {currentIndex + 1} / {pieces.length}
        </div>
        
        <button
          onClick={handleNext}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 500,
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Next ▶
        </button>
      </div>
      </div>
    </div>
  );
};
