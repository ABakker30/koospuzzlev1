import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../components/ModalBase';

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
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={500}
      surface="#1a1a1a"
      title={<>✏️ {t('edit.puzzle.title')}</>}
      footer={
        <>
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
        </>
      }
    >
      {/* Name */}
      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="edit-puzzle-name"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.puzzle.nameLabel')}
        </label>
        <input
          id="edit-puzzle-name"
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
        <label
          htmlFor="edit-puzzle-description"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.puzzle.descriptionLabel')}
        </label>
        <textarea
          id="edit-puzzle-description"
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
        <label
          htmlFor="edit-puzzle-challenge"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.puzzle.challengeLabel')}
        </label>
        <textarea
          id="edit-puzzle-challenge"
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
        <label
          htmlFor="edit-puzzle-visibility"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.puzzle.visibilityLabel')}
        </label>
        <select
          id="edit-puzzle-visibility"
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
    </ModalBase>
  );
}
