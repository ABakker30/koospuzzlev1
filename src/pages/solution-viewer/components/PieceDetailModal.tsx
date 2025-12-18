import React, { useMemo } from 'react';
import SceneCanvas from '../../../components/SceneCanvas';
import { computeViewTransforms } from '../../../services/ViewTransforms';
import { ijkToXyz } from '../../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import type { IJK } from '../../../types/shape';
import type { StudioSettings } from '../../../types/studio';

// FCC lattice transform matrix (IJK → XYZ)
const T_ijk_to_xyz = [
  [1, 0, 0],
  [0.5, Math.sqrt(3) / 2, 0],
  [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3],
];

interface PieceDetailModalProps {
  isOpen: boolean;
  pieceId: string;
  cells: IJK[];
  envSettings: StudioSettings;
  onClose: () => void;
}

export const PieceDetailModal: React.FC<PieceDetailModalProps> = ({
  isOpen,
  pieceId,
  cells,
  envSettings,
  onClose,
}) => {
  // Compute view for this single piece
  const view = useMemo(() => {
    if (cells.length === 0) return null;
    try {
      return computeViewTransforms(cells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
    } catch (err) {
      console.error('Failed to compute view for piece:', err);
      return null;
    }
  }, [cells]);

  if (!isOpen || !view) return null;

  return (
    <>
      <style>{`
        .piece-detail-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .piece-detail-modal {
          width: 90%;
          max-width: 600px;
          height: 70vh;
          max-height: 600px;
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .piece-detail-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .piece-detail-title {
          font-size: 24px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .piece-detail-close {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #fff;
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .piece-detail-close:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }

        .piece-detail-canvas {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .piece-detail-info {
          padding: 16px 24px;
          border-top: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(0, 0, 0, 0.2);
          color: rgba(226, 232, 240, 0.8);
          font-size: 13px;
          text-align: center;
        }
      `}</style>

      <div className="piece-detail-overlay" onClick={onClose}>
        <div className="piece-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="piece-detail-header">
            <div className="piece-detail-title">Piece {pieceId}</div>
            <button className="piece-detail-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="piece-detail-canvas">
            <SceneCanvas
              cells={cells}
              view={view}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              placedPieces={[]}
              hidePlacedPieces={false}
              settings={envSettings}
              containerOpacity={0}
              containerColor="#888888"
              visibility={{
                xray: false,
                emptyOnly: false,
                sliceY: { center: 0.5, thickness: 1.0 }
              }}
              puzzleMode="oneOfEach"
              onSelectPiece={() => {}}
            />
          </div>

          <div className="piece-detail-info">
            Use mouse to orbit • Scroll to zoom
          </div>
        </div>
      </div>
    </>
  );
};
