import { useState, useEffect } from 'react';
import type { EffectType, EffectPreset } from '../api/effectPresets';
import { 
  saveEffectPreset, 
  getEffectPresets, 
  deleteEffectPreset
} from '../api/effectPresets';

interface EffectPresetsSectionProps<T> {
  effectType: EffectType;
  currentConfig: T;
  onLoadPreset: (config: T) => void;
}

export function EffectPresetsSection<T>({
  effectType,
  currentConfig,
  onLoadPreset
}: EffectPresetsSectionProps<T>) {
  const [mode, setMode] = useState<'list' | 'save'>('list');
  const [presets, setPresets] = useState<EffectPreset<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Save form state
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Load presets when component mounts or mode changes to list
  useEffect(() => {
    if (mode === 'list') {
      loadPresets();
    }
  }, [mode, effectType]);

  const loadPresets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEffectPresets<T>(effectType);
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
      await saveEffectPreset({
        effect_type: effectType,
        name: presetName.trim(),
        description: presetDescription.trim() || undefined,
        config: currentConfig,
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

  const handleLoadPreset = (preset: EffectPreset<T>) => {
    onLoadPreset(preset.config);
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteEffectPreset(id);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h4 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>Presets</h4>
      
      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          backgroundColor: '#fee',
          color: '#c33',
          borderRadius: '4px',
          border: '1px solid #fcc',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {mode === 'list' ? (
        <>
          <button
            onClick={() => setMode('save')}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.95rem',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '1rem'
            }}
          >
            💾 Save Current Configuration
          </button>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#666', fontSize: '0.875rem' }}>
              Loading presets...
            </div>
          ) : presets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#666', fontSize: '0.875rem' }}>
              No presets saved yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '120px', overflowY: 'auto' }}>
              {presets.map(preset => (
                <div key={preset.id} style={{
                  padding: '0.875rem',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  backgroundColor: '#fafafa'
                }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {preset.name}
                      {preset.is_public && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#28a745' }}>
                          🌐
                        </span>
                      )}
                    </div>
                    {preset.description && (
                      <div style={{ fontSize: '0.75rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preset.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#dc3545',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
              Preset Name *
            </label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g., Fast Spin"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
              Description (optional)
            </label>
            <textarea
              value={presetDescription}
              onChange={(e) => setPresetDescription(e.target.value)}
              placeholder="Describe this preset..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.875rem',
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
              id="effectPresetPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
            />
            <label htmlFor="effectPresetPublic" style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
              Make public (visible to all users)
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setMode('list')}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '0.875rem',
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
                fontSize: '0.875rem',
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
}
