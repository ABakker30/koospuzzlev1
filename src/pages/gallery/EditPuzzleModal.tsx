import { useState } from 'react';

interface EditPuzzleModalProps {
  isOpen: boolean;
  puzzle: {
    id: string;
    name: string;
    description?: string;
    challenge_message?: string;
    visibility: 'public' | 'private';
  };
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    description?: string;
    challenge_message?: string;
    visibility?: 'public' | 'private';
  }) => Promise<void>;
}

export function EditPuzzleModal({ isOpen, puzzle, onClose, onSave }: EditPuzzleModalProps) {
  const [name, setName] = useState(puzzle.name);
  const [description, setDescription] = useState(puzzle.description || '');
  const [challengeMessage, setChallengeMessage] = useState(puzzle.challenge_message || '');
  const [visibility, setVisibility] = useState<'public' | 'private'>(puzzle.visibility);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name,
        description,
        challenge_message: challengeMessage,
        visibility
      });
      onClose();
    } catch (error) {
      console.error('Failed to save puzzle:', error);
      alert('Failed to save changes. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: '#1a1a1a',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '500px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h2 style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 600,
          margin: '0 0 20px 0'
        }}>
          ✏️ Edit Puzzle
        </h2>

        {/* Name */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem'
            }}
            placeholder="Puzzle name"
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem',
              resize: 'vertical'
            }}
            placeholder="Optional description"
          />
        </div>

        {/* Challenge Message */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Challenge Message
          </label>
          <textarea
            value={challengeMessage}
            onChange={(e) => setChallengeMessage(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem',
              resize: 'vertical'
            }}
            placeholder="Challenge message for solvers"
          />
        </div>

        {/* Visibility */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Visibility
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem'
            }}
          >
            <option value="public">Public - Visible to everyone</option>
            <option value="private">Private - Only visible to you</option>
          </select>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              padding: '10px 20px',
              background: name.trim() ? '#2196F3' : 'rgba(33, 150, 243, 0.5)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: (isSaving || !name.trim()) ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
