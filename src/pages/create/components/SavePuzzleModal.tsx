import React, { useState } from 'react';
import './SavePuzzleModal.css';

interface SavePuzzleModalProps {
  onSave: (metadata: {
    name: string;
    creatorName: string;
    description?: string;
    visibility: 'public' | 'private';
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
  puzzleStats: {
    sphereCount: number;
    creationTimeMs: number;
  };
}

const SavePuzzleModal: React.FC<SavePuzzleModalProps> = ({
  onSave,
  onCancel,
  isSaving,
  puzzleStats,
}) => {
  const [name, setName] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Please enter a puzzle name');
      return;
    }
    
    if (!creatorName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    onSave({
      name: name.trim(),
      creatorName: creatorName.trim(),
      description: description.trim() || undefined,
      visibility,
    });
  };
  
  const formatTime = (ms: number) => {
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
        <h2 className="modal-title">Save Your Puzzle</h2>
        
        <div className="puzzle-stats">
          <div className="stat">
            <span className="stat-label">Spheres:</span>
            <span className="stat-value">{puzzleStats.sphereCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Creation Time:</span>
            <span className="stat-value">{formatTime(puzzleStats.creationTimeMs)}</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="save-form">
          <div className="form-group">
            <label htmlFor="puzzle-name">Puzzle Name *</label>
            <input
              id="puzzle-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Puzzle"
              maxLength={100}
              disabled={isSaving}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="creator-name">Your Name *</label>
            <input
              id="creator-name"
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="Anonymous Creator"
              maxLength={50}
              disabled={isSaving}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell others about your puzzle..."
              maxLength={500}
              rows={3}
              disabled={isSaving}
            />
          </div>
          
          <div className="form-group">
            <label>Visibility</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={(e) => setVisibility(e.target.value as 'public')}
                  disabled={isSaving}
                />
                <span>Public (appears in gallery)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={(e) => setVisibility(e.target.value as 'private')}
                  disabled={isSaving}
                />
                <span>Private (only you have the link)</span>
              </label>
            </div>
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
              {isSaving ? 'Saving...' : 'Save Puzzle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavePuzzleModal;
