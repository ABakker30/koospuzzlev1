// Simplified Gravity Effect Configuration Modal
import { useState } from 'react';
import { GravityEffectConfig, validateGravityConfig, DEFAULT_GRAVITY } from './types';

interface GravityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: GravityEffectConfig) => void;
  initialConfig?: GravityEffectConfig;
}

export const GravityModal: React.FC<GravityModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig = DEFAULT_GRAVITY
}) => {
  const [config, setConfig] = useState<GravityEffectConfig>({
    ...DEFAULT_GRAVITY,
    ...initialConfig
  });
  const [showCustomGravity, setShowCustomGravity] = useState(
    typeof initialConfig.gravity === 'number'
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!validateGravityConfig(config)) {
      setError('Invalid configuration');
      return;
    }
    setError(null);
    onSave(config);
    onClose();
  };

  const handleGravityChange = (value: string) => {
    if (value === 'custom') {
      setShowCustomGravity(true);
      setConfig({ ...config, gravity: -9.81 });
    } else {
      setShowCustomGravity(false);
      setConfig({ ...config, gravity: value as 'low' | 'earth' | 'high' });
    }
  };

  const currentPreset = typeof config.gravity === 'number' ? 'custom' : config.gravity;

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Gravity Effect
          </h2>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#fee',
              color: '#c33',
              borderRadius: '4px',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          {/* Gravity Strength */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Gravity Strength
            </label>
            <select
              value={currentPreset}
              onChange={(e) => handleGravityChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              <option value="low">Low (-3 m/s²)</option>
              <option value="earth">Earth (-9.81 m/s²)</option>
              <option value="high">High (-20 m/s²)</option>
              <option value="custom">Custom</option>
            </select>

            {showCustomGravity && (
              <input
                type="number"
                value={typeof config.gravity === 'number' ? config.gravity : -9.81}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || value === '-') return;
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setConfig({ ...config, gravity: numValue });
                  }
                }}
                onBlur={(e) => {
                  const value = parseFloat(e.target.value);
                  if (isNaN(value) || e.target.value === '' || e.target.value === '-') {
                    setConfig({ ...config, gravity: -9.81 });
                  } else {
                    const clamped = Math.max(-50, Math.min(50, value));
                    setConfig({ ...config, gravity: clamped });
                  }
                }}
                step="any"
                placeholder="Negative = down, Positive = up"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  marginTop: '0.5rem',
                  fontSize: '0.875rem'
                }}
              />
            )}
          </div>

          {/* Release Mode */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Release Mode
            </label>
            <select
              value={config.release.mode}
              onChange={(e) => setConfig({ 
                ...config, 
                release: { ...config.release, mode: e.target.value as 'allAtOnce' | 'staggered' }
              })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            >
              <option value="allAtOnce">All at Once</option>
              <option value="staggered">Staggered</option>
            </select>

            {config.release.mode === 'staggered' && (
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                  Stagger Delay (ms)
                </label>
                <input
                  type="number"
                  value={config.release.staggerMs || 150}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    release: { ...config.release, staggerMs: parseInt(e.target.value) }
                  })}
                  min="50"
                  max="500"
                  step="10"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            )}
          </div>

          {/* Walls */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.environment.walls ?? true}
                onChange={(e) => setConfig({
                  ...config,
                  environment: { ...config.environment, walls: e.target.checked }
                })}
                style={{ marginRight: '0.5rem' }}
              />
              <span style={{ fontWeight: 500 }}>Boundary Walls</span>
            </label>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
              Prevent spheres from falling off edges
            </div>
          </div>

          {/* Variation */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Variation
            </label>
            <input
              type="range"
              value={config.variation ?? 0.25}
              onChange={(e) => setConfig({ ...config, variation: parseFloat(e.target.value) })}
              min="0"
              max="1"
              step="0.05"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
              {((config.variation ?? 0.25) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              background: '#6366f1',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
