import React, { useEffect } from 'react';
import { StudioCanvas } from '../../../components/StudioCanvas';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../../types/studio';
import type { IJK } from '../../../types/shape';
import type { ViewTransforms } from '../../../services/ViewTransforms';
import { computeViewTransforms } from '../../../services/ViewTransforms';
import { ijkToXyz } from '../../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import './CreateCanvas.css';

interface CreateCanvasProps {
  cells: IJK[];
  selectedIndex: number | null;
  onSelectCell: (index: number | null) => void;
  onAddSphere: (position?: IJK) => void;
  onPresetChange: (config: any) => void;
}

const CreateCanvas: React.FC<CreateCanvasProps> = ({
  cells,
  onPresetChange,
}) => {
  const [settings, setSettings] = React.useState<StudioSettings>({
    ...DEFAULT_STUDIO_SETTINGS,
    // Simple default preset for creation
    material: {
      ...DEFAULT_STUDIO_SETTINGS.material,
      color: '#4CAF50',
      metalness: 0.3,
      roughness: 0.4,
    },
  });
  
  const [view, setView] = React.useState<ViewTransforms | null>(null);
  
  // Compute view transforms when cells change
  useEffect(() => {
    if (cells.length === 0) {
      setView(null);
      return;
    }
    
    // Identity transform for FCC lattice (ijkToXyz already does the transform)
    const T_ijk_to_xyz = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
    
    try {
      // Compute view transforms for camera framing
      const transforms = computeViewTransforms(cells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(transforms);
    } catch (err) {
      console.error('Failed to compute view transforms:', err);
    }
  }, [cells]);
  
  // Notify parent of preset changes
  useEffect(() => {
    onPresetChange(settings);
  }, [settings, onPresetChange]);
  
  const handleSettingsChange = (newSettings: StudioSettings) => {
    setSettings(newSettings);
  };
  
  return (
    <div className="create-canvas">
      <StudioCanvas
        cells={cells}
        view={view || undefined}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
      
      <div className="canvas-hint">
        <p>Click <strong>+ Add Sphere</strong> to build your puzzle</p>
        <p className="hint-secondary">Camera controls: Left-click drag to rotate, Right-click drag to pan, Scroll to zoom</p>
      </div>
    </div>
  );
};

export default CreateCanvas;
