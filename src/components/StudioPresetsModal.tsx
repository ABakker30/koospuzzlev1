import { useState, useEffect } from 'react';
import type { StudioSettings } from '../types/studio';
import type { StudioPreset } from '../api/studioPresets';
import { 
  saveStudioPreset, 
  getUserPresets, 
  deleteStudioPreset
} from '../api/studioPresets';
import { useDraggable } from '../hooks/useDraggable';

export interface StudioPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: StudioSettings;
  onLoadPreset: (settings: StudioSettings) => void;
}

export const StudioPresetsModal: React.FC<StudioPresetsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onLoadPreset
}) => {
  const draggable = useDraggable();
  const [mode, setMode] = useState<'list' | 'save'>('list');
  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Save form state
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // DEV MODE: Always consider as logged in for development
  useEffect(() => {
    setIsLoggedIn(true);
  }, []);

  // Load presets when modal opens
  useEffect(() => {
    if (isOpen && mode === 'list') {
      loadPresets();
    }
  }, [isOpen, mode]);

  const loadPresets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserPresets();
      setPresets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError('Please enter a preset name');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await saveStudioPreset({
        name: presetName.trim(),
        description: presetDescription.trim() || undefined,
        settings: currentSettings,
        is_public: isPublic
      });
      
      // Reset form
      setPresetName('');
      setPresetDescription('');
      setIsPublic(false);
      
      // Switch to list mode
      setMode('list');
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = (preset: StudioPreset) => {
    onLoadPreset(preset.settings);
    onClose();
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteStudioPreset(id);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (!isLoggedIn) {
    return (
      <div
        ref={draggable.ref}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          ...draggable.style,
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: '1px solid #d1d5db',
          zIndex: 10000
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.5rem' }}>Login Required</h2>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            You must be logged in to save and load studio presets.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
      </div>
    );
  }

  return (
    <div
      ref={draggable.ref}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        ...draggable.style,
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: '1px solid #d1d5db',
        zIndex: 10000
      }}>
        <div style={{ ...draggable.headerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', userSelect: 'none', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            {mode === 'list' ? 'Studio Presets' : 'Save Preset'}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              fontSize: '1.25rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#fee',
            color: '#c33',
            borderRadius: '4px',
            border: '1px solid #fcc'
          }}>
            {error}
          </div>
        )}

        {mode === 'list' && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setMode('save')}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontSize: '1rem',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                💾 Save Current Settings
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                Loading presets...
              </div>
            ) : presets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                No presets saved yet. Save your current settings to get started!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {presets.map(preset => (
                  <div key={preset.id} style={{
                    padding: '1rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {preset.name}
                        {preset.is_public && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#28a745' }}>
                            🌐 Public
                          </span>
                        )}
                      </div>
                      {preset.description && (
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>
                          {preset.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                        {new Date(preset.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleLoadPreset(preset)}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          backgroundColor: '#28a745',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          backgroundColor: '#dc3545',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'save' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Preset Name *
              </label>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., Metallic Gold Look"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Description (optional)
              </label>
              <textarea
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="Describe this preset..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
              />
              <label htmlFor="isPublic" style={{ cursor: 'pointer' }}>
                Make this preset public (visible to all users)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setMode('list')}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontSize: '1rem',
                  backgroundColor: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={loading || !presetName.trim()}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  fontSize: '1rem',
                  backgroundColor: !presetName.trim() ? '#ccc' : '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading || !presetName.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          </div>
        )}
      </div>
  );
};
