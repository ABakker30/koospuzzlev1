import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../components/ModalBase';

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
  const { t } = useTranslation();
  const [title, setTitle] = useState(solution.title);
  const [description, setDescription] = useState(solution.description || '');
  const [challengeText, setChallengeText] = useState(solution.challenge_text);
  const [isPublic, setIsPublic] = useState(solution.is_public);
  const [isSaving, setIsSaving] = useState(false);

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
      alert(t('edit.solution.saveFailed'));
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
      title={<>🎬 {t('edit.solution.title')}</>}
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
            {isSaving ? t('save.saving') : t('edit.solution.saveButton')}
          </button>
        </>
      }
    >
      {/* Title */}
      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="edit-solution-title"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.solution.titleLabel')}
        </label>
        <input
          id="edit-solution-title"
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
          placeholder={t('edit.solution.titlePlaceholder')}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="edit-solution-description"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.solution.descriptionLabel')}
        </label>
        <textarea
          id="edit-solution-description"
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
          placeholder={t('edit.solution.descriptionPlaceholder')}
        />
      </div>

      {/* Challenge Text */}
      <div style={{ marginBottom: '16px' }}>
        <label
          htmlFor="edit-solution-challenge"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.solution.challengeLabel')}
        </label>
        <textarea
          id="edit-solution-challenge"
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
          placeholder={t('edit.solution.challengePlaceholder')}
        />
      </div>

      {/* Visibility */}
      <div style={{ marginBottom: '24px' }}>
        <label
          htmlFor="edit-solution-visibility"
          style={{
            display: 'block',
            color: '#aaa',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '6px'
          }}
        >
          {t('edit.solution.visibilityLabel')}
        </label>
        <select
          id="edit-solution-visibility"
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
          <option value="public">{t('edit.solution.publicOption')}</option>
          <option value="private">{t('edit.solution.privateOption')}</option>
        </select>
      </div>
    </ModalBase>
  );
}
