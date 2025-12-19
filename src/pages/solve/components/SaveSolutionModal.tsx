import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [solverName, setSolverName] = useState('');
  const [notes, setNotes] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!solverName.trim()) {
      alert(t('save.errors.solverNameRequired'));
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
        <h2 className="modal-title">🎉 {t('save.solution.title')}</h2>
        
        <div className="puzzle-stats">
          <div className="stat">
            <span className="stat-label">{t('save.solution.puzzleLabel')}</span>
            <span className="stat-value">{solutionStats.puzzleName}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('save.solution.movesLabel')}</span>
            <span className="stat-value">{solutionStats.moveCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('save.solution.timeLabel')}</span>
            <span className="stat-value">{formatTime(solutionStats.solveTimeMs)}</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="save-form">
          <div className="form-group">
            <label htmlFor="solver-name">{t('save.solution.solverNameLabel')}</label>
            <input
              id="solver-name"
              type="text"
              value={solverName}
              onChange={(e) => setSolverName(e.target.value)}
              placeholder={t('save.solution.solverNamePlaceholder')}
              maxLength={50}
              disabled={isSaving}
              required
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="notes">{t('save.solution.notesLabel')}</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('save.solution.notesPlaceholder')}
              maxLength={500}
              rows={3}
              disabled={isSaving}
            />
            <small style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', display: 'block' }}>
              {t('save.solution.notesHint')}
            </small>
          </div>
          
          <div className="modal-actions">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              disabled={isSaving}
            >
              {t('button.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? t('save.saving') : t('save.solution.saveButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveSolutionModal;
