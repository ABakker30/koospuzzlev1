// Integration wrapper for ShapeBrowserModal to show individual pieces in 3D
// Connects the carousel browser to show the 25 standard pieces (A-Y)

import React, { useState, useEffect } from 'react';
import { ShapeBrowserModal } from '../../../components/ShapeBrowserModal';
import { GoldOrientationService } from '../../../services/GoldOrientationService';
import { computeViewTransforms } from '../../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import { ijkToXyz } from '../../../lib/ijk';

interface PieceShape {
  pieceId: string;
  cells: { i: number; j: number; k: number }[];
  orientationId: string;
}

interface PieceBrowserIntegrationProps {
  isOpen: boolean;
  pieces: string[]; // e.g., ['A', 'B', 'C', ...]
  activePiece: string;
  onClose: () => void;
  onSelectPiece: (pieceId: string) => void;
  onLoadPreview: (piece: PieceShape) => Promise<void>;
}

export const PieceBrowserIntegration: React.FC<PieceBrowserIntegrationProps> = ({
  isOpen,
  pieces,
  activePiece,
  onClose,
  onSelectPiece,
  onLoadPreview
}) => {
  const [pieceFiles, setPieceFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState<GoldOrientationService | null>(null);

  // Load orientation service
  useEffect(() => {
    if (!isOpen) return;

    const loadService = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const svc = new GoldOrientationService();
        await svc.load();
        setService(svc);
        
        // Transform pieces into file format for browser
        const files = pieces.map((pieceId) => {
          const orientations = svc.getOrientations(pieceId);
          const firstOrientation = orientations[0];
          
          return {
            filename: `Piece ${pieceId}`,
            path: pieceId,
            pieceCount: 1,
            cellCount: firstOrientation?.ijkOffsets.length || 4,
            dateModified: new Date(),
            description: `Standard Koos piece ${pieceId}`,
            tags: ['piece', 'standard'],
            _pieceId: pieceId,
            _orientations: orientations
          };
        });
        
        setPieceFiles(files);
        console.log(`💾 Loaded ${files.length} pieces for browser`);
      } catch (err: any) {
        console.error('❌ Failed to load pieces:', err);
        setError(err.message || 'Failed to load pieces');
      } finally {
        setLoading(false);
      }
    };

    loadService();
  }, [isOpen, pieces]);

  // Load piece for preview in carousel
  const handleLoadPiece = async (file: any) => {
    try {
      if (!service) {
        throw new Error('Orientation service not loaded');
      }

      const pieceId = file._pieceId;
      const orientations = service.getOrientations(pieceId);
      
      if (orientations.length === 0) {
        throw new Error(`No orientations found for piece ${pieceId}`);
      }

      // Use first orientation for preview
      const firstOrientation = orientations[0];
      const cells = firstOrientation.ijkOffsets;

      console.log(`📦 Preview piece ${pieceId}: ${cells.length} cells`);

      // FCC transform matrix
      const T_ijk_to_xyz = [
        [0.5, 0.5, 0, 0],
        [0.5, 0, 0.5, 0],
        [0, 0.5, 0.5, 0],
        [0, 0, 0, 1]
      ];

      // Compute orientation transforms for preview
      try {
        const viewTransforms = computeViewTransforms(
          cells,
          ijkToXyz,
          T_ijk_to_xyz,
          quickHullWithCoplanarMerge
        );
        
        const pieceShape: PieceShape = {
          pieceId,
          cells,
          orientationId: firstOrientation.orientationId
        };
        
        // Store view transforms for canvas
        (pieceShape as any).viewTransforms = viewTransforms;
        
        // Call preview handler
        await onLoadPreview(pieceShape);
      } catch (err) {
        console.warn(`⚠️ Failed to compute orientation for piece ${pieceId}:`, err);
        
        // Still preview even if orientation fails
        await onLoadPreview({
          pieceId,
          cells,
          orientationId: firstOrientation.orientationId
        });
      }
    } catch (err) {
      console.error('❌ Failed to load piece preview:', err);
      throw err;
    }
  };

  // User selected a piece
  const handleSelectPiece = (file: any) => {
    const pieceId = file._pieceId;
    console.log(`✅ User selected piece: ${pieceId}`);
    onSelectPiece(pieceId);
    onClose();
  };

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fee',
        color: '#c33',
        padding: '1rem 2rem',
        borderRadius: '8px',
        zIndex: 10000
      }}>
        <p>Error loading pieces: {error}</p>
        <button onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
      </div>
    );
  }

  if (loading && pieceFiles.length === 0) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#fff',
        fontSize: '1.2rem',
        zIndex: 10000
      }}>
        Loading pieces...
      </div>
    );
  }

  // Find initial index based on activePiece
  const initialIndex = Math.max(0, pieceFiles.findIndex(f => f._pieceId === activePiece));

  return (
    <ShapeBrowserModal
      isOpen={isOpen && pieceFiles.length > 0}
      files={pieceFiles}
      initialIndex={initialIndex}
      title="Select Piece"
      onSelect={handleSelectPiece}
      onClose={onClose}
      onLoadShape={handleLoadPiece}
    />
  );
};
