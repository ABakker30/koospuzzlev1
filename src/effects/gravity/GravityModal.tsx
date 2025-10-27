// Gravity Effect Configuration Modal
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
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '0',
        maxWidth: '500px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#fff',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            Gravity Effect Settings
          </h2>
        </div>

        {/* Content */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1.5rem',
          backgroundColor: '#fff'
        }}>
          {error && (
            <div style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#fee',
              color: '#c00',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Duration */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Duration (seconds)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              step="0.1"
              value={config.durationSec}
              onChange={(e) => setConfig({ ...config, durationSec: parseFloat(e.target.value) })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>

          {/* Gravity Preset */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Gravity
            </label>
            <select
              value={currentPreset}
              onChange={(e) => handleGravityChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            >
              <option value="low">Low (-3.0 m/s²)</option>
              <option value="earth">Earth (-9.81 m/s²)</option>
              <option value="high">High (-20.0 m/s²)</option>
              <option value="custom">Custom...</option>
            </select>
          </div>

          {/* Custom Gravity Value */}
          {showCustomGravity && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Custom Gravity (m/s², negative = downward)
              </label>
              <input
                type="number"
                min="-50"
                max="0"
                step="0.1"
                value={typeof config.gravity === 'number' ? config.gravity : -9.81}
                onChange={(e) => setConfig({
                  ...config,
                  gravity: parseFloat(e.target.value)
                })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {/* Release Mode */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Release Mode
            </label>
            <select
              value={config.release.mode}
              onChange={(e) => setConfig({
                ...config,
                release: {
                  ...config.release,
                  mode: e.target.value as "all" | "staggered"
                }
              })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            >
              <option value="all">All at once</option>
              <option value="staggered">Staggered</option>
            </select>
          </div>

          {/* Stagger Time */}
          {config.release.mode === 'staggered' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Stagger Time (ms)
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                step="10"
                value={config.release.staggerMs || 150}
                onChange={(e) => setConfig({
                  ...config,
                  release: {
                    ...config.release,
                    staggerMs: parseInt(e.target.value)
                  }
                })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {/* Environment */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.environment.walls || false}
                onChange={(e) => setConfig({
                  ...config,
                  environment: { ...config.environment, walls: e.target.checked }
                })}
              />
              <span style={{ fontWeight: 500 }}>Boundary walls</span>
            </label>
          </div>

          {/* Loop */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.loop?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  loop: e.target.checked ? { enabled: true, pauseMs: 1000 } : { enabled: false }
                })}
              />
              <span style={{ fontWeight: 500 }}>Enable reverse reassembly</span>
            </label>
            {config.loop?.enabled && (
              <div style={{ marginTop: '0.75rem', marginLeft: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                  Pieces will fall, pause, then reverse back to starting position
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: 500 }}>
                    Pause duration (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="100"
                    value={config.loop?.pauseMs ?? 1000}
                    onChange={(e) => setConfig({
                      ...config,
                      loop: { ...config.loop!, pauseMs: parseInt(e.target.value) }
                    })}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Explosion */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.explosion?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  explosion: e.target.checked ? { enabled: true, strength: 20 } : { enabled: false }
                })}
              />
              <span style={{ fontWeight: 500 }}>Mini explosion before fall</span>
            </label>
            {config.explosion?.enabled && (
              <div style={{ marginTop: '0.75rem', marginLeft: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                  Apply a small outward impulse to spread pieces apart before gravity
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: 500 }}>
                    Explosion strength: {config.explosion?.strength ?? 20}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={config.explosion?.strength ?? 20}
                    onChange={(e) => setConfig({
                      ...config,
                      explosion: { ...config.explosion!, strength: parseInt(e.target.value) }
                    })}
                    style={{
                      width: '100%'
                    }}
                  />
                  <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                    Low values (1-30) for subtle spread, high values (50-100) for dramatic explosion
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Variation */}
          {config.variation !== undefined && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Variation: {config.variation.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={config.variation}
                onChange={(e) => setConfig({ ...config, variation: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Seed */}
          {config.seed !== undefined && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Random Seed
              </label>
              <input
                type="number"
                value={config.seed}
                onChange={(e) => setConfig({ ...config, seed: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'flex-end',
          backgroundColor: '#fff',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '1rem'
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
              backgroundColor: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 500
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
