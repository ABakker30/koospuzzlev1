import { useState, useEffect } from 'react';
import { ModalBase } from '../../components/ModalBase';
import { CATEGORY_META, CATEGORY_ORDER, type PuzzleCategory } from '../../utils/puzzleCategory';

interface EditMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Record<string, any>) => Promise<void>;
  itemType: 'puzzle' | 'solution';
  initialData: {
    name: string;
    description?: string;
    /** Stored category (null/undefined = auto-derived). */
    category?: string | null;
    [key: string]: any;
  };
  /** Manager mode: show the category re-assign selector (puzzles only). */
  showCategory?: boolean;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.85)',
  fontSize: '0.9rem',
  fontWeight: 600,
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: 'rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

export function EditMetadataModal({
  isOpen,
  onClose,
  onSave,
  itemType,
  initialData,
  showCategory = false,
}: EditMetadataModalProps) {
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description || '');
  const [category, setCategory] = useState<string>(initialData.category || 'auto');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData.name);
      setDescription(initialData.description || '');
      setCategory(initialData.category || 'auto');
    }
  }, [isOpen, initialData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        ...(showCategory && itemType === 'puzzle'
          ? { category: category === 'auto' ? null : (category as PuzzleCategory) }
          : {}),
      });
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${itemType === 'puzzle' ? 'Puzzle' : 'Solution'}`}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{
              background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
              border: 'none',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: isSaving || !name.trim() ? 0.5 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      {/* Name Field */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="edit-meta-name" style={labelStyle}>
          Name
        </label>
        <input
          id="edit-meta-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          placeholder="Enter name..."
        />
      </div>

      {/* Description Field */}
      <div>
        <label htmlFor="edit-meta-description" style={labelStyle}>
          Description (optional)
        </label>
        <textarea
          id="edit-meta-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Enter description..."
        />
      </div>

      {/* Category re-assign — manager mode, puzzles only */}
      {showCategory && itemType === 'puzzle' && (
        <div style={{ marginTop: '20px' }}>
          <label htmlFor="edit-meta-category" style={labelStyle}>
            Category <span style={{ fontWeight: 400, opacity: 0.6 }}>(manager)</span>
          </label>
          <select
            id="edit-meta-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
          >
            <option value="auto">Auto (derived from shape)</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
        </div>
      )}
    </ModalBase>
  );
}
