// Gravity Effect Configuration Modal
import { useState, useEffect } from 'react';
import { useDraggable } from '../../hooks/useDraggable';
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
  const [config, setConfig] = useState<GravityEffectConfig>(() => {
    const base = initialConfig || DEFAULT_GRAVITY;
    return {
      ...DEFAULT_GRAVITY,
      ...base,
      loop: base.loop ?? { enabled: false, count: 0 }
    };
  });
  const [showCustomGravity, setShowCustomGravity] = useState(
    typeof initialConfig.gravity === 'number'
  );
  const [gravityInputValue, setGravityInputValue] = useState(
    typeof initialConfig.gravity === 'number' ? String(initialConfig.gravity) : '-9.81'
  );
  const [error, setError] = useState<string | null>(null);
  const draggable = useDraggable();

  // Log when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('effect=gravity action=open-modal');
    }
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      setGravityInputValue('-9.81');
      setConfig({ ...config, gravity: -9.81 });
    } else {
      setShowCustomGravity(false);
      setConfig({ ...config, gravity: value as 'low' | 'earth' | 'high' });
    }
  };

  const currentPreset = typeof config.gravity === 'number' ? 'custom' : config.gravity;

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .gravity-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .gravity-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(16, 185, 129, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .gravity-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #10b981, #059669);
          border-radius: 10px;
          border: 2px solid rgba(209, 250, 229, 0.5);
        }
        .gravity-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #059669, #047857);
        }
        .gravity-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #047857;
        }
        .gravity-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #10b981 rgba(16, 185, 129, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="gravity-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(16,185,129,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{ 
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.08) 100%)',
            borderBottom: '2px solid rgba(16,185,129,0.3)',
            borderTopLeftRadius: '17px',
            borderTopRightRadius: '17px',
            ...draggable.headerStyle
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>
            🌍 Gravity Effect Settings
          </h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#065f46',
              fontWeight: 700,
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.4)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          flex: 1,
          padding: '1.5rem',
          backgroundColor: 'rgba(255,255,255,0.5)'
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
              type="text"
              inputMode="decimal"
              value={config.durationSec}
              onChange={(e) => {
                const value = e.target.value;
                // Allow any input
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  setConfig({ ...config, durationSec: numValue });
                } else if (value === '') {
                  setConfig({ ...config, durationSec: 0 });
                }
              }}
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
                Custom Gravity (m/s², negative = down, positive = up)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={gravityInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow user to type ANYTHING
                  setGravityInputValue(value);
                  
                  // Try to parse and update config if it's a valid number
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setConfig({ ...config, gravity: numValue });
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  const numValue = parseFloat(value);
                  if (isNaN(numValue) || value === '' || value === '-' || value === '.' || value === '-.') {
                    // Reset to default if invalid
                    setGravityInputValue('-9.81');
                    setConfig({ ...config, gravity: -9.81 });
                  } else {
                    // Update display to show the parsed number
                    setGravityInputValue(String(numValue));
                  }
                }}
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
                type="text"
                inputMode="numeric"
                value={config.release.staggerMs || 150}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow any input
                  const numValue = parseInt(value);
                  if (!isNaN(numValue)) {
                    setConfig({
                  ...config,
                      release: {
                        ...config.release,
                        staggerMs: parseInt(value) || 150
                      }
                    });
                  }
                }}
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
                    min="0"
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

          {/* Loop Settings */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!config.loop?.enabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setConfig({
                    ...config,
                    loop: {
                      ...(config.loop || {}),
                      enabled,
                      count: config.loop?.count ?? 0
                    }
                  });
                }}
              />
              <span style={{ fontWeight: 500 }}>Loop this effect</span>
            </label>
            {config.loop?.enabled && (
              <div style={{ marginTop: '0.75rem', marginLeft: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  Loop count (0 = infinite / page-controlled):
                </label>
                <input
                  type="number"
                  min={0}
                  style={{
                    width: '100px',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem'
                  }}
                  value={config.loop?.count ?? 0}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10) || 0;
                    setConfig({
                      ...config,
                      loop: {
                        enabled: true,  // Must be true if we're showing this input
                        count: value
                      }
                    });
                  }}
                />
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
                type="text"
                inputMode="numeric"
                value={config.seed}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow any input
                  const numValue = parseInt(value);
                  if (!isNaN(numValue)) {
                    setConfig({ ...config, seed: numValue });
                  } else if (value === '') {
                    setConfig({ ...config, seed: 0 });
                  }
                }}
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
          borderTop: '2px solid rgba(16,185,129,0.3)',
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.08) 100%)',
          borderBottomLeftRadius: '17px',
          borderBottomRightRadius: '17px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.625rem 1.5rem',
              border: '2px solid rgba(16,185,129,0.3)',
              borderRadius: '12px',
              backgroundColor: 'rgba(255,255,255,0.9)',
              color: '#065f46',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.625rem 1.5rem',
              border: 'none',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,185,129,0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16,185,129,0.3)';
            }}
          >
            ✓ Apply
          </button>
        </div>
      </div>
    </>
  );
};
