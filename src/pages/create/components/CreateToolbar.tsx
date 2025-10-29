import React from 'react';
import './CreateToolbar.css';

interface CreateToolbarProps {
  mode: 'add' | 'remove';
  onToggleMode: () => void;
  onClearAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sphereCount: number;
}

const CreateToolbar: React.FC<CreateToolbarProps> = ({
  mode,
  onToggleMode,
  onClearAll,
  onUndo,
  onRedo,
  onSave,
  canUndo,
  canRedo,
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
          className={`toolbar-btn ${mode === 'add' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleMode}
          title={mode === 'add' ? 'Switch to Remove mode' : 'Switch to Add mode'}
        >
          {mode === 'add' ? '✚ Add Mode' : '✖ Remove Mode'}
        </button>
        
        <div className="mode-hint">
          {mode === 'add' 
            ? 'Double-click ghost spheres to add' 
            : 'Double-click spheres to remove'}
        </div>
        
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
