import React from 'react';
import './CreateToolbar.css';

interface CreateToolbarProps {
  onAddSphere: () => void;
  onRemoveSphere: () => void;
  onClearAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  sphereCount: number;
}

const CreateToolbar: React.FC<CreateToolbarProps> = ({
  onAddSphere,
  onRemoveSphere,
  onClearAll,
  onUndo,
  onRedo,
  onSave,
  canUndo,
  canRedo,
  hasSelection,
  sphereCount,
}) => {
  return (
    <div className="create-toolbar">
      <div className="toolbar-section">
        <h1 className="toolbar-title">Create Puzzle</h1>
        <div className="sphere-count">
          {sphereCount} sphere{sphereCount !== 1 ? 's' : ''}
        </div>
      </div>
      
      <div className="toolbar-section toolbar-actions">
        <button
          className="toolbar-btn btn-primary"
          onClick={onAddSphere}
          title="Add sphere at origin"
        >
          + Add Sphere
        </button>
        
        <button
          className="toolbar-btn"
          onClick={onRemoveSphere}
          disabled={!hasSelection || sphereCount <= 1}
          title="Remove selected sphere"
        >
          Remove
        </button>
        
        <div className="toolbar-divider" />
        
        <button
          className="toolbar-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↷ Redo
        </button>
        
        <button
          className="toolbar-btn btn-danger"
          onClick={onClearAll}
          disabled={sphereCount <= 1}
          title="Clear all and start over"
        >
          Clear All
        </button>
        
        <div className="toolbar-divider" />
        
        <button
          className="toolbar-btn btn-success"
          onClick={onSave}
          disabled={sphereCount < 2}
          title="Save puzzle"
        >
          💾 Save Puzzle
        </button>
      </div>
    </div>
  );
};

export default CreateToolbar;
