// Turn Table Modal - configuration UI with validation and presets
import { useState, useEffect, useRef } from 'react';
import { 
  TurnTableConfig, 
  TurnTablePreset, 
  DEFAULT_CONFIG, 
  loadPresets, 
  savePreset, 
  deletePreset, 
  validateConfig 
} from './presets';

export interface TurnTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: TurnTableConfig) => void;
  initialConfig?: TurnTableConfig;
}

export const TurnTableModal: React.FC<TurnTableModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialConfig = DEFAULT_CONFIG 
}) => {
  const [config, setConfig] = useState<TurnTableConfig>(initialConfig);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<TurnTablePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Load presets on mount
  useEffect(() => {
    if (isOpen) {
      setPresets(loadPresets());
      console.log('effect=turntable action=open-modal');
    }
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Validate on config change
  useEffect(() => {
    const validation = validateConfig(config);
    setErrors(validation.errors);
  }, [config]);

  const handleFieldChange = (field: keyof TurnTableConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    console.log(`effect=turntable action=change field=${field} value=${JSON.stringify(value)}`);
  };

  const handleSave = () => {
    const validation = validateConfig(config);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    console.log(`effect=turntable action=save config=${JSON.stringify(config)}`);
    onSave(config);
    onClose();
  };

  const handleCancel = () => {
    console.log('effect=turntable action=cancel');
    onClose();
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    
    try {
      savePreset(presetName.trim(), config);
      setPresets(loadPresets());
      setPresetName('');
      console.log(`effect=turntable action=save-preset name="${presetName.trim()}"`);
    } catch (error) {
      console.error('Failed to save preset:', error);
    }
  };

  const handleLoadPreset = (preset: TurnTablePreset) => {
    setConfig(preset.config);
    console.log(`effect=turntable action=load-preset name="${preset.name}"`);
  };

  const handleDeletePreset = (name: string) => {
    try {
      deletePreset(name);
      setPresets(loadPresets());
      console.log(`effect=turntable action=delete-preset name="${name}"`);
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  };

  if (!isOpen) return null;

  const isValid = Object.keys(errors).length === 0;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-label="Turn Table Configuration"
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          width: '480px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
          Turn Table Configuration
        </h2>
        
        <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', color: '#666', lineHeight: '1.4' }}>
          Rotation around Y through the sculpture's centroid. Camera orbits in camera mode; sculpture rotates in object mode.
        </p>

        {/* Parameters Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '500' }}>Parameters</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Duration */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Duration (seconds)
              </label>
              <input
                ref={firstInputRef}
                type="number"
                value={config.durationSec}
                onChange={(e) => handleFieldChange('durationSec', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.durationSec ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
                min="0.1"
                max="600"
                step="0.1"
                aria-describedby={errors.durationSec ? 'duration-error' : undefined}
              />
              {errors.durationSec && (
                <div id="duration-error" style={{ fontSize: '0.75rem', color: '#dc3545', marginTop: '0.25rem' }}>
                  {errors.durationSec}
                </div>
              )}
            </div>

            {/* Degrees */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Degrees
              </label>
              <input
                type="number"
                value={config.degrees}
                onChange={(e) => handleFieldChange('degrees', parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.degrees ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
                step="1"
                aria-describedby={errors.degrees ? 'degrees-error' : undefined}
              />
              {errors.degrees && (
                <div id="degrees-error" style={{ fontSize: '0.75rem', color: '#dc3545', marginTop: '0.25rem' }}>
                  {errors.degrees}
                </div>
              )}
            </div>

            {/* Direction */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Direction
              </label>
              <select
                value={config.direction}
                onChange={(e) => handleFieldChange('direction', e.target.value as 'cw' | 'ccw')}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.direction ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="cw">Clockwise (CW)</option>
                <option value="ccw">Counter-clockwise (CCW)</option>
              </select>
            </div>

            {/* Mode */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Mode
              </label>
              <select
                value={config.mode}
                onChange={(e) => handleFieldChange('mode', e.target.value as 'camera' | 'object')}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.mode ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="camera">Camera (orbit around sculpture)</option>
                <option value="object">Object (rotate sculpture)</option>
              </select>
            </div>

            {/* Easing */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Easing
              </label>
              <select
                value={config.easing}
                onChange={(e) => handleFieldChange('easing', e.target.value as TurnTableConfig['easing'])}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.easing ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="linear">Linear</option>
                <option value="ease-in">Ease In</option>
                <option value="ease-out">Ease Out</option>
                <option value="ease-in-out">Ease In-Out</option>
              </select>
            </div>

            {/* Finalization */}
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>
                Finalization
              </label>
              <select
                value={config.finalize}
                onChange={(e) => handleFieldChange('finalize', e.target.value as TurnTableConfig['finalize'])}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: `1px solid ${errors.finalize ? '#dc3545' : '#ccc'}`,
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="leaveAsEnded">Leave as ended</option>
                <option value="returnToStart">Return to start</option>
                <option value="snapToPose">Snap to pose</option>
              </select>
            </div>
          </div>
        </div>

        {/* Presets Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500' }}>Presets</h3>
            <button
              onClick={() => setShowPresets(!showPresets)}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              {showPresets ? 'Hide' : 'Show'} ({presets.length})
            </button>
          </div>

          {/* Save Preset */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: showPresets ? '1rem' : 0 }}>
            <input
              type="text"
              placeholder="Preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
              onKeyDown={(e) => e.key === 'Enter' && presetName.trim() && handleSavePreset()}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                border: '1px solid #007bff',
                borderRadius: '4px',
                backgroundColor: presetName.trim() ? '#007bff' : '#e9ecef',
                color: presetName.trim() ? '#fff' : '#6c757d',
                cursor: presetName.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Save
            </button>
          </div>

          {/* Load Presets */}
          {showPresets && (
            <div style={{ maxHeight: '120px', overflow: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
              {presets.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
                  No presets saved yet
                </div>
              ) : (
                presets.map((preset) => (
                  <div
                    key={preset.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem',
                      borderBottom: '1px solid #eee'
                    }}
                  >
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        padding: '0.25rem 0.5rem',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.name)}
                      style={{
                        padding: '0.25rem',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        color: '#dc3545',
                        fontSize: '0.75rem'
                      }}
                      title="Delete preset"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid #6c757d',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#6c757d',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: '1px solid #28a745',
              borderRadius: '4px',
              backgroundColor: isValid ? '#28a745' : '#e9ecef',
              color: isValid ? '#fff' : '#6c757d',
              cursor: isValid ? 'pointer' : 'not-allowed'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
