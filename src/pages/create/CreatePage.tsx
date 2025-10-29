import React, { useState, useRef } from 'react';
import CreateCanvas from './components/CreateCanvas';
import CreateToolbar from './components/CreateToolbar';
import SavePuzzleModal from './components/SavePuzzleModal';
import { useActionTracker } from './hooks/useActionTracker';
import { savePuzzleToSupabase } from './services/puzzleService';
import type { IJK } from '../../types/shape';
import './CreatePage.css';

const CreatePage: React.FC = () => {
  
  // State
  const [cells, setCells] = useState<IJK[]>([{ i: 0, j: 0, k: 0 }]); // Start with one sphere
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Action tracking
  const { actions, trackAction, undo, redo, canUndo, canRedo, clearHistory } = useActionTracker(cells, setCells);
  
  // Refs for external data (presets, timing)
  const creationStartTime = useRef(Date.now());
  const presetConfigRef = useRef<any>(null); // Will store current preset config
  
  // Add sphere at position
  const handleAddSphere = (position?: IJK) => {
    const newCell = position || { i: 0, j: 0, k: 0 }; // Default to origin if no position
    
    // Check if sphere already exists at this position
    const exists = cells.some(c => c.i === newCell.i && c.j === newCell.j && c.k === newCell.k);
    if (exists) {
      console.warn('Sphere already exists at this position');
      return;
    }
    
    const newCells = [...cells, newCell];
    setCells(newCells);
    trackAction('ADD_SPHERE', { position: newCell });
  };
  
  // Remove selected sphere
  const handleRemoveSphere = () => {
    if (selectedCellIndex === null) {
      console.warn('No sphere selected');
      return;
    }
    
    if (cells.length <= 1) {
      console.warn('Cannot remove last sphere');
      return;
    }
    
    const removedCell = cells[selectedCellIndex];
    const newCells = cells.filter((_, idx) => idx !== selectedCellIndex);
    setCells(newCells);
    setSelectedCellIndex(null);
    trackAction('REMOVE_SPHERE', { position: removedCell, index: selectedCellIndex });
  };
  
  // Clear all (reset to single sphere)
  const handleClearAll = () => {
    if (cells.length === 1) return;
    
    if (!window.confirm('Clear all spheres and start over?')) return;
    
    setCells([{ i: 0, j: 0, k: 0 }]);
    setSelectedCellIndex(null);
    clearHistory();
    creationStartTime.current = Date.now();
    trackAction('CLEAR_ALL', {});
  };
  
  // Undo/Redo
  const handleUndo = () => {
    undo();
    setSelectedCellIndex(null);
  };
  
  const handleRedo = () => {
    redo();
    setSelectedCellIndex(null);
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
        presetConfig: presetConfigRef.current,
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
        onAddSphere={handleAddSphere}
        onRemoveSphere={handleRemoveSphere}
        onClearAll={handleClearAll}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelection={selectedCellIndex !== null}
        sphereCount={cells.length}
      />
      
      <CreateCanvas
        cells={cells}
        selectedIndex={selectedCellIndex}
        onSelectCell={setSelectedCellIndex}
        onAddSphere={handleAddSphere}
        onPresetChange={(config: any) => { presetConfigRef.current = config; }}
      />
      
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
