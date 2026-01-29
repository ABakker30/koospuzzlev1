import React, { useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { StudioSettings } from '../../types/studio';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';

const T_IJK_TO_XYZ = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  piece: PlacedPiece | null;
  settings: StudioSettings;
};

export const PieceViewerModal: React.FC<Props> = ({ isOpen, onClose, piece, settings }) => {
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [sceneObjects, setSceneObjects] = useState<{
    camera: THREE.PerspectiveCamera;
    controls: any;
  } | null>(null);
  const [resetCameraFlag, setResetCameraFlag] = useState(0);

  const centeredCells = useMemo((): IJK[] => {
    if (!piece?.cells?.length) return [];

    let sumI = 0;
    let sumJ = 0;
    let sumK = 0;
    for (const c of piece.cells) {
      sumI += c.i;
      sumJ += c.j;
      sumK += c.k;
    }
    const n = piece.cells.length;
    const ci = sumI / n;
    const cj = sumJ / n;
    const ck = sumK / n;

    return piece.cells.map((c) => ({ i: c.i - ci, j: c.j - cj, k: c.k - ck }));
  }, [piece]);

  const placedPieceForPreview = useMemo((): PlacedPiece | null => {
    if (!piece) return null;
    if (!centeredCells.length) return null;
    return {
      ...piece,
      cells: centeredCells,
    };
  }, [piece, centeredCells]);

  useEffect(() => {
    if (!isOpen) return;
    if (!centeredCells.length) {
      setView(null);
      return;
    }
    try {
      const v = computeViewTransforms(centeredCells, ijkToXyz, T_IJK_TO_XYZ, quickHullWithCoplanarMerge);
      setView(v);
      setResetCameraFlag((p) => p + 1);
    } catch {
      setView(null);
    }
  }, [isOpen, centeredCells]);

  useEffect(() => {
    if (!isOpen) return;
    if (!sceneObjects) return;
    if (!centeredCells.length) return;
    if (resetCameraFlag <= 0) return;

    const { camera, controls } = sceneObjects;

    const T = [
      [0.5, 0.5, 0],
      [0.5, 0, 0.5],
      [0, 0.5, 0.5],
    ];

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const cell of centeredCells) {
      const x = T[0][0] * cell.i + T[0][1] * cell.j + T[0][2] * cell.k;
      const y = T[1][0] * cell.i + T[1][1] * cell.j + T[1][2] * cell.k;
      const z = T[2][0] * cell.i + T[2][1] * cell.j + T[2][2] * cell.k;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const sphereRadius = 0.5;
    const size = Math.max(sizeX, sizeY, sizeZ) + sphereRadius * 2;

    const fov = camera.fov * (Math.PI / 180);
    const distance = (size / 2) / Math.tan(fov / 2) * 1.25;
    const cameraOffset = distance * 0.75;

    camera.position.set(cameraOffset, cameraOffset, cameraOffset);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.update();
  }, [isOpen, sceneObjects, centeredCells, resetCameraFlag]);

  if (!isOpen || !piece) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 92vw)',
          height: 'min(560px, 76vh)',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(236,233,255,0.90) 45%, rgba(219,234,254,0.88) 100%)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.35)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.20), rgba(59,130,246,0.16))',
            backdropFilter: 'blur(12px) saturate(180%)',
            borderBottom: '1px solid rgba(15, 23, 42, 0.12)',
            padding: '0.85rem 1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          }}
        >
          <div>
            <div style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 700 }}>
              📦 Piece {piece.pieceId}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.55rem 0.85rem',
                fontSize: '1.1rem',
                background: 'rgba(255, 255, 255, 0.55)',
                color: '#0f172a',
                border: '1px solid rgba(15, 23, 42, 0.18)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.75)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.55)';
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', background: 'rgba(0,0,0,0.92)' }}>
          {view && placedPieceForPreview ? (
            <SceneCanvas
              cells={centeredCells}
              view={view}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              layout="embedded"
              placedPieces={[placedPieceForPreview]}
              hidePlacedPieces={false}
              explosionFactor={0}
              settings={settings}
              puzzleMode="unlimited"
              showBonds={true}
              containerOpacity={0}
              containerColor="#888888"
              alwaysShowContainer={false}
              onSelectPiece={() => {}}
              onSceneReady={(objects) => {
                setSceneObjects({ camera: objects.camera, controls: objects.controls });
                setResetCameraFlag((p) => p + 1);
              }}
            />
          ) : (
            <div style={{ color: '#fff', padding: '1.5rem' }}>Unable to render piece preview.</div>
          )}
        </div>
      </div>
    </div>
  );
};
