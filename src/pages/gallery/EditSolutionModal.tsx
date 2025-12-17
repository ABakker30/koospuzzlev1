import { useState } from 'react';

interface EditSolutionModalProps {
  isOpen: boolean;
  solution: {
    id: string;
    title: string;
    description?: string;
    challenge_text: string;
    is_public: boolean;
  };
  onClose: () => void;
  onSave: (updates: {
    title?: string;
    description?: string;
    challenge_text?: string;
    is_public?: boolean;
  }) => Promise<void>;
}

export function EditSolutionModal({ isOpen, solution, onClose, onSave }: EditSolutionModalProps) {
  const [title, setTitle] = useState(solution.title);
  const [description, setDescription] = useState(solution.description || '');
  const [challengeText, setChallengeText] = useState(solution.challenge_text);
  const [isPublic, setIsPublic] = useState(solution.is_public);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        title,
        description,
        challenge_text: challengeText,
        is_public: isPublic
      });
      onClose();
    } catch (error) {
      console.error('Failed to save movie:', error);
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
        border: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative'
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            onClose();
          }}
          disabled={isSaving}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontSize: '20px',
            color: '#fff',
            fontWeight: 700,
            transition: 'all 0.2s',
            opacity: isSaving ? 0.5 : 1,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseEnter={(e) => !isSaving && (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => !isSaving && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          title="Close"
        >
          ×
        </button>
        <h2 style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 600,
          margin: '0 0 20px 0'
        }}>
          🎬 Edit Movie
        </h2>

        {/* Title */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem'
            }}
            placeholder="Movie title"
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

        {/* Challenge Text */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            Challenge Text *
          </label>
          <textarea
            value={challengeText}
            onChange={(e) => setChallengeText(e.target.value)}
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
            placeholder="Challenge for viewers"
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
            value={isPublic ? 'public' : 'private'}
            onChange={(e) => setIsPublic(e.target.value === 'public')}
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
            disabled={isSaving || !title.trim() || !challengeText.trim()}
            style={{
              padding: '10px 20px',
              background: (title.trim() && challengeText.trim()) ? '#2196F3' : 'rgba(33, 150, 243, 0.5)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: (isSaving || !title.trim() || !challengeText.trim()) ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
