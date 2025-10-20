// Gravity Effect Configuration Modal
import { useState } from 'react';
import { GravityEffectConfig, validateGravityConfig, DEFAULT_GRAVITY } from './types';
import { EffectPresetsSection } from '../../components/EffectPresetsSection';

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
  // Merge initialConfig with defaults to handle backward compatibility
  const mergedConfig: GravityEffectConfig = {
    ...DEFAULT_GRAVITY,
    ...initialConfig,
    animation: {
      ...DEFAULT_GRAVITY.animation,
      ...(initialConfig.animation || {}),
      // Ensure new fields have defaults if missing
      magneticForce: initialConfig.animation?.magneticForce ?? DEFAULT_GRAVITY.animation.magneticForce,
      damping: initialConfig.animation?.damping ?? DEFAULT_GRAVITY.animation.damping
    }
  };
  
  const [config, setConfig] = useState<GravityEffectConfig>(mergedConfig);
  const [showCustomGravity, setShowCustomGravity] = useState(
    typeof initialConfig.gravity === 'object'
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!validateGravityConfig(config)) {
      setError('Invalid configuration - please check all fields');
      return;
    }
    setError(null);
    onSave(config);
    onClose();
  };

  const handleGravityPresetChange = (value: string) => {
    if (value === 'custom') {
      setShowCustomGravity(true);
      setConfig({ ...config, gravity: { custom: -9.81 } });
    } else {
      setShowCustomGravity(false);
      setConfig({ ...config, gravity: value as "earth" | "moon" | "micro" });
    }
  };

  const currentGravityPreset = typeof config.gravity === 'string' ? config.gravity : 'custom';

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
              value={currentGravityPreset}
              onChange={(e) => handleGravityPresetChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            >
              <option value="earth">Earth (-9.81 m/s²)</option>
              <option value="moon">Moon (-1.62 m/s²)</option>
              <option value="micro">Micro (-0.2 m/s²)</option>
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
                value={typeof config.gravity === 'object' ? config.gravity.custom : -9.81}
                onChange={(e) => setConfig({
                  ...config,
                  gravity: { custom: parseFloat(e.target.value) }
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

          {/* Auto-break */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.autoBreak.enabled}
                onChange={(e) => setConfig({
                  ...config,
                  autoBreak: { ...config.autoBreak, enabled: e.target.checked }
                })}
              />
              <span style={{ fontWeight: 500 }}>Auto-break joints</span>
            </label>
          </div>

          {/* Auto-break Level */}
          {config.autoBreak.enabled && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                Break Level
              </label>
              <select
                value={config.autoBreak.level}
                onChange={(e) => setConfig({
                  ...config,
                  autoBreak: {
                    ...config.autoBreak,
                    level: e.target.value as "low" | "medium" | "high"
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
                <option value="low">Low (breaks easily)</option>
                <option value="medium">Medium (balanced)</option>
                <option value="high">High (holds tight)</option>
              </select>
            </div>
          )}

          {/* Environment */}
          <div>
            <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Environment</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.25rem' }}>
              <input
                type="checkbox"
                checked={config.environment.walls}
                onChange={(e) => setConfig({
                  ...config,
                  environment: { ...config.environment, walls: e.target.checked }
                })}
              />
              <span>Boundary walls</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.environment.startOnGround}
                onChange={(e) => setConfig({
                  ...config,
                  environment: { ...config.environment, startOnGround: e.target.checked }
                })}
              />
              <span>Start on ground</span>
            </label>
          </div>

          {/* Animation */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Animation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={config.animation.loop}
                onChange={(e) => setConfig({
                  ...config,
                  animation: { ...config.animation, loop: e.target.checked }
                })}
              />
              <span>Loop animation</span>
            </label>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
              Start mode:
            </label>
            <select
              value={config.animation.startMode}
              onChange={(e) => setConfig({
                ...config,
                animation: { ...config.animation, startMode: e.target.value as "shape" | "scattered" }
              })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                marginBottom: '0.5rem'
              }}
            >
              <option value="shape">Start as shape (fall apart)</option>
              <option value="scattered">Start scattered (assemble)</option>
            </select>
            {config.animation.loop && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                  Pause between loops (seconds):
                </label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={config.animation.pauseBetweenLoops || 1}
                  onChange={(e) => setConfig({
                    ...config,
                    animation: { ...config.animation, pauseBetweenLoops: parseFloat(e.target.value) }
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
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Easing:
            </label>
            <select
              value={config.animation.easing}
              onChange={(e) => setConfig({
                ...config,
                animation: { ...config.animation, easing: e.target.value as "none" | "in" | "out" | "in-out" }
              })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            >
              <option value="none">None (constant)</option>
              <option value="in">Ease In (slow start)</option>
              <option value="out">Ease Out (slow end)</option>
              <option value="in-out">Ease In-Out (smooth)</option>
            </select>
            {config.animation.loop && (
              <>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Magnetic Force: {config.animation.magneticForce}
                </label>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="10"
                  value={config.animation.magneticForce}
                  onChange={(e) => setConfig({
                    ...config,
                    animation: { ...config.animation, magneticForce: parseFloat(e.target.value) }
                  })}
                  style={{
                    width: '100%',
                    marginBottom: '0.5rem'
                  }}
                />
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                  Damping: {config.animation.damping.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={config.animation.damping}
                  onChange={(e) => setConfig({
                    ...config,
                    animation: { ...config.animation, damping: parseFloat(e.target.value) }
                  })}
                  style={{
                    width: '100%'
                  }}
                />
              </>
            )}
          </div>

          {/* Variation */}
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

          {/* Seed */}
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

          {/* Presets Section */}
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
            <EffectPresetsSection<GravityEffectConfig>
              effectType="gravity"
              currentConfig={config}
              onLoadPreset={(loadedConfig) => {
                setConfig(loadedConfig);
                console.log('✅ Loaded gravity preset');
              }}
            />
          </div>
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
