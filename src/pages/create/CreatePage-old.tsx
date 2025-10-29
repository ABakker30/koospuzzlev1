import React, { useState, useRef, useEffect } from 'react';
import ShapeEditorCanvas from '../../components/ShapeEditorCanvas';
import CreateToolbar from './components/CreateToolbar';
import SavePuzzleModal from './components/SavePuzzleModal';
import { useActionTracker } from './hooks/useActionTracker';
import { savePuzzleToSupabase } from './services/puzzleService';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { ijkToXyz } from '../../lib/ijk';
import type { IJK } from '../../types/shape';
import './CreatePage.css';

const CreatePage: React.FC = () => {
  
  // State
  // Start with 2 spheres so convex hull works and you can see something
  const [cells, setCells] = useState<IJK[]>([
    { i: 0, j: 0, k: 0 },
    { i: 1, j: 0, k: 0 }
  ]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editEnabled] = useState(true); // Edit mode always on in create
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [view, setView] = useState<ViewTransforms | null>(null);
  
  console.log('🎨 CreatePage render - cells:', cells.length, 'view:', view ? 'ready' : 'null', 'editEnabled:', editEnabled);
  
  // Action tracking
  const { actions, trackAction, undo, redo, canUndo, canRedo, clearHistory } = useActionTracker(cells, setCells);
  
  // Refs for timing
  const creationStartTime = useRef(Date.now());
  
  // Compute view transforms when cells change
  useEffect(() => {
    if (cells.length === 0) {
      setView(null);
      return;
    }
    
    const T_ijk_to_xyz = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
    
    try {
      const transforms = computeViewTransforms(cells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(transforms);
      console.log('✅ View transforms computed successfully for', cells.length, 'cells');
    } catch (err) {
      console.error('❌ Failed to compute view transforms:', err);
      // Fallback: use identity transform if hull fails (e.g., single point)
      setView({
        M_world: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1]
        ]
      });
      console.log('⚠️ Using fallback identity transform');
    }
  }, [cells]);
  
  // Handle cell changes from ShapeEditorCanvas
  const handleCellsChange = (newCells: IJK[]) => {
    // Determine action type by comparing with previous state
    if (newCells.length > cells.length) {
      trackAction('ADD_SPHERE', { count: newCells.length - cells.length });
    } else if (newCells.length < cells.length) {
      trackAction('REMOVE_SPHERE', { count: cells.length - newCells.length });
    }
    setCells(newCells);
  };
  
  // Clear all (reset to single sphere)
  const handleClearAll = () => {
    if (cells.length === 1) return;
    
    if (!window.confirm('Clear all spheres and start over?')) return;
    
    setCells([{ i: 0, j: 0, k: 0 }]);
    clearHistory();
    creationStartTime.current = Date.now();
    trackAction('CLEAR_ALL', {});
  };
  
  // Toggle mode
  const handleToggleMode = () => {
    setMode(prev => prev === 'add' ? 'remove' : 'add');
  };
  
  // Save puzzle
  const handleSave = () => {
    if (cells.length < 2) {
      alert('Add at least 2 spheres before saving');
      return;
    }
    setShowSaveModal(true);
  };
  
  // Save to Supabase
  const handleConfirmSave = async (metadata: {
    name: string;
    creatorName: string;
    description?: string;
    visibility: 'public' | 'private';
  }) => {
    setIsSaving(true);
    
    try {
      const creationTimeMs = Date.now() - creationStartTime.current;
      
      const puzzleData = {
        ...metadata,
        geometry: cells,
        actions,
        presetConfig: null, // TODO: Add preset configuration later
        sphereCount: cells.length,
        creationTimeMs,
      };
      
      const savedPuzzle = await savePuzzleToSupabase(puzzleData);
      
      console.log('Puzzle saved:', savedPuzzle);
      alert(`Puzzle saved! ID: ${savedPuzzle.id}`);
      
      setShowSaveModal(false);
      
      // TODO: Navigate to gallery or show shareable link
      // navigate(`/solve/${savedPuzzle.id}`);
      
    } catch (error) {
      console.error('Failed to save puzzle:', error);
      alert('Failed to save puzzle. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="create-page">
      <CreateToolbar
        mode={mode}
        onToggleMode={handleToggleMode}
        onClearAll={handleClearAll}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        canUndo={canUndo}
        canRedo={canRedo}
        sphereCount={cells.length}
      />
      
      {!view && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '18px'
        }}>
          Loading canvas...
        </div>
      )}
      
      {view && (
        <ShapeEditorCanvas
          cells={cells}
          view={view}
          mode={mode}
          editEnabled={editEnabled}
          onCellsChange={handleCellsChange}
        />
      )}
      
      {showSaveModal && (
        <SavePuzzleModal
          onSave={handleConfirmSave}
          onCancel={() => setShowSaveModal(false)}
          isSaving={isSaving}
          puzzleStats={{
            sphereCount: cells.length,
            creationTimeMs: Date.now() - creationStartTime.current,
          }}
        />
      )}
    </div>
  );
};

export default CreatePage;
