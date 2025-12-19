import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      alert(t('edit.puzzle.saveFailed'));
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
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px',
            color: 'rgba(255, 255, 255, 0.8)',
            padding: '4px',
            lineHeight: 1,
            transition: 'all 0.2s',
            opacity: isSaving ? 0.5 : 1,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
          }}
        >
          ✕
        </button>
        <h2 style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 600,
          margin: '0 0 20px 0'
        }}>
          ✏️ {t('edit.puzzle.title')}
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
            {t('edit.puzzle.nameLabel')}
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
            placeholder={t('edit.puzzle.namePlaceholder')}
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
            {t('edit.puzzle.descriptionLabel')}
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
            placeholder={t('edit.puzzle.descriptionPlaceholder')}
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
            {t('edit.puzzle.challengeLabel')}
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
            placeholder={t('edit.puzzle.challengePlaceholder')}
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
            {t('edit.puzzle.visibilityLabel')}
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
            <option value="public">{t('edit.puzzle.publicOption')}</option>
            <option value="private">{t('edit.puzzle.privateOption')}</option>
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
            {t('button.cancel')}
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
            {isSaving ? t('save.saving') : t('edit.puzzle.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
