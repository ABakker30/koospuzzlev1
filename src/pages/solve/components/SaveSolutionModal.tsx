import React, { useState } from 'react';
import '../../create/components/SavePuzzleModal.css'; // Reuse styles

interface SaveSolutionModalProps {
  onSave: (metadata: {
    solverName: string;
    notes?: string;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
  solutionStats: {
    puzzleName: string;
    moveCount: number;
    solveTimeMs: number | null;
  };
}

const SaveSolutionModal: React.FC<SaveSolutionModalProps> = ({
  onSave,
  onCancel,
  isSaving,
  solutionStats,
}) => {
  const [solverName, setSolverName] = useState('');
  const [notes, setNotes] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!solverName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    onSave({
      solverName: solverName.trim(),
      notes: notes.trim() || undefined,
    });
  };
  
  const formatTime = (ms: number | null) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };
  
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">🎉 Puzzle Solved!</h2>
        
        <div className="puzzle-stats">
          <div className="stat">
            <span className="stat-label">Puzzle:</span>
            <span className="stat-value">{solutionStats.puzzleName}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Moves:</span>
            <span className="stat-value">{solutionStats.moveCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Solve Time:</span>
            <span className="stat-value">{formatTime(solutionStats.solveTimeMs)}</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="save-form">
          <div className="form-group">
            <label htmlFor="solver-name">Your Name *</label>
            <input
              id="solver-name"
              type="text"
              value={solverName}
              onChange={(e) => setSolverName(e.target.value)}
              placeholder="Anonymous Solver"
              maxLength={50}
              disabled={isSaving}
              required
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Share your thoughts about solving this puzzle..."
              maxLength={500}
              rows={3}
              disabled={isSaving}
            />
            <small style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', display: 'block' }}>
              Optional: Strategy, difficulty rating, or comments
            </small>
          </div>
          
          <div className="modal-actions">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Solution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveSolutionModal;
