import React from 'react';

type ManualSolveSaveModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
};

export const ManualSolveSaveModal: React.FC<ManualSolveSaveModalProps> = ({
  isOpen,
  isSaving,
  onCancel,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 1000,
      }}
    >
      <h2>Save Solution</h2>
      <p>Save your solution to the database?</p>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <button onClick={onCancel} className="btn">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="btn btn-primary"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};
