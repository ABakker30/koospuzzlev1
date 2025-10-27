// Integration wrapper for ShapeBrowserModal with Shape Editor
// Connects the carousel browser to the existing Three.js canvas

import React, { useState, useEffect } from 'react';
import { ShapeBrowserModal } from './ShapeBrowserModal';
import { 
  listContractShapes, 
  getContractShapeSignedUrl, 
  deleteContractShape, 
  updateContractShapeMetadata 
} from '../api/contracts';
import { computeViewTransforms } from '../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../lib/quickhull-adapter';
import { ijkToXyz } from '../lib/ijk';

interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}

interface ShapeBrowserIntegrationProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectShape: (shape: KoosShape, shapeName: string) => void;
  onLoadPreview: (shape: KoosShape) => Promise<void>;
  onClearCanvas?: () => void;
}

export const ShapeBrowserIntegration: React.FC<ShapeBrowserIntegrationProps> = ({
  isOpen,
  onClose,
  onSelectShape,
  onLoadPreview
}) => {
  const [shapeFiles, setShapeFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load shape list when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadShapeList = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔍 ShapeBrowserIntegration: Loading SHAPES only...');
        const contractShapes = await listContractShapes();
        console.log(`📊 Received ${contractShapes.length} records from contracts_shapes table`);
        
        if (contractShapes.length > 0) {
          console.log('📄 First record sample:', {
            id: contractShapes[0].id?.substring(0, 12),
            file_name: contractShapes[0].file_name,
            size: contractShapes[0].size,
            created_at: contractShapes[0].created_at
          });
        }
        
        // Transform to ShapeFile format with metadata
        const files = contractShapes.map((shape: any) => ({
          filename: shape.file_name || shape.metadata?.name || `Shape_${shape.size}cells.json`,
          path: shape.id, // Use ID as path
          pieceCount: undefined, // We don't know pieces until we load
          cellCount: shape.size,
          fileSize: shape.file_size,
          dateModified: new Date(shape.created_at),
          description: shape.description || shape.metadata?.description,
          tags: shape.metadata?.tags,
          _rawShape: shape // Store raw shape data
        }));
        
        setShapeFiles(files);
        console.log(`💾 Loaded ${files.length} shapes for browser`);
      } catch (err: any) {
        console.error('❌ Failed to load shapes:', err);
        setError(err.message || 'Failed to load shapes');
      } finally {
        setLoading(false);
      }
    };

    loadShapeList();
  }, [isOpen]);

  // Load shape for preview in carousel
  const handleLoadShape = async (file: any) => {
    try {
      // Get signed URL and download
      const url = await getContractShapeSignedUrl(file.path);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to download shape');
      }
      
      const koosShape = await response.json() as KoosShape;
      
      // Validate format
      if (koosShape.schema !== 'koos.shape' || koosShape.version !== 1) {
        throw new Error('Invalid shape format. Expected koos.shape@1');
      }
      
      console.log(`📦 Preview shape: ${koosShape.id.substring(0, 24)}... (${koosShape.cells.length} cells)`);
      
      // Compute orientation transforms before rendering
      const cells = koosShape.cells.map(([i, j, k]) => ({ i, j, k }));
      
      // FCC transform matrix
      const T_ijk_to_xyz = [
        [0.5, 0.5, 0, 0],    // FCC basis vector 1
        [0.5, 0, 0.5, 0],    // FCC basis vector 2
        [0, 0.5, 0.5, 0],    // FCC basis vector 3
        [0, 0, 0, 1]         // Homogeneous coordinate
      ];
      
      console.log("🔄 Computing orientation for preview...");
      try {
        const viewTransforms = computeViewTransforms(
          cells,
          ijkToXyz,
          T_ijk_to_xyz,
          quickHullWithCoplanarMerge
        );
        console.log("🎯 Orientation computed successfully");
        
        // Store view transforms in shape for canvas to use
        (koosShape as any).viewTransforms = viewTransforms;
      } catch (err) {
        console.warn("⚠️ Failed to compute orientation, using default:", err);
      }
      
      // Call preview handler (renders in main canvas with orientation)
      await onLoadPreview(koosShape);
      
      // Update file metadata if we discovered new info
      if (file.pieceCount === undefined) {
        // Could extract piece count here if needed
        setShapeFiles(prev => prev.map(f => 
          f.path === file.path 
            ? { ...f, _loadedShape: koosShape }
            : f
        ));
      }
    } catch (err) {
      console.error('❌ Failed to load shape preview:', err);
      throw err; // Let modal handle the error
    }
  };

  // User confirmed selection
  const handleSelectShape = async (file: any) => {
    try {
      // Load the shape if not already loaded
      let koosShape: KoosShape;
      
      if (file._loadedShape) {
        koosShape = file._loadedShape;
      } else {
        const url = await getContractShapeSignedUrl(file.path);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download shape');
        koosShape = await response.json() as KoosShape;
      }
      
      const shapeName = file.filename.replace('.json', '');
      console.log(`✅ User selected shape: ${shapeName}`);
      
      onSelectShape(koosShape, shapeName);
    } catch (err) {
      console.error('❌ Failed to select shape:', err);
      alert(`Failed to load shape: ${(err as Error).message}`);
    }
  };

  // Delete shape
  const handleDelete = async (file: any) => {
    try {
      await deleteContractShape(file.path);
      
      // Remove from local list
      setShapeFiles(prev => prev.filter(f => f.path !== file.path));
      
      console.log(`✅ Deleted shape: ${file.filename}`);
    } catch (err) {
      console.error('❌ Failed to delete shape:', err);
      throw err;
    }
  };

  // Rename shape
  const handleRename = async (file: any, newName: string) => {
    try {
      await updateContractShapeMetadata(file.path, {
        file_name: newName
      });
      
      // Update local list
      setShapeFiles(prev => prev.map(f => 
        f.path === file.path 
          ? { ...f, filename: newName }
          : f
      ));
      
      console.log(`✅ Renamed shape to: ${newName}`);
    } catch (err) {
      console.error('❌ Failed to rename shape:', err);
      throw err;
    }
  };

  // Update metadata (description, tags)
  const handleUpdateMetadata = async (file: any, metadata: any) => {
    try {
      const updates: any = {};
      
      if (metadata.description !== undefined) {
        updates.description = metadata.description;
      }
      
      if (metadata.tags !== undefined) {
        // Store tags in metadata field as JSON
        updates.metadata = {
          ...file._rawShape?.metadata,
          tags: metadata.tags
        };
      }
      
      await updateContractShapeMetadata(file.path, updates);
      
      // Update local list
      setShapeFiles(prev => prev.map(f => 
        f.path === file.path 
          ? { ...f, description: metadata.description, tags: metadata.tags }
          : f
      ));
      
      console.log(`✅ Updated metadata for: ${file.filename}`);
    } catch (err) {
      console.error('❌ Failed to update metadata:', err);
      throw err;
    }
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
        <p>Error loading shapes: {error}</p>
        <button onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
      </div>
    );
  }

  if (loading && shapeFiles.length === 0) {
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
        Loading shapes...
      </div>
    );
  }

  return (
    <ShapeBrowserModal
      isOpen={isOpen && shapeFiles.length > 0}
      files={shapeFiles}
      initialIndex={0}
      title="Browse Shapes"
      onSelect={handleSelectShape}
      onClose={onClose}
      onLoadShape={handleLoadShape}
      onDelete={handleDelete}
      onRename={handleRename}
      onUpdateMetadata={handleUpdateMetadata}
    />
  );
};
