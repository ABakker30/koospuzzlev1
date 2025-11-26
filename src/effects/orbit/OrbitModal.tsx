// Orbit Modal - Clean Rewrite
// Mobile-optimized UI for keyframe camera animation settings

import React, { useState, useRef, useEffect } from 'react';
import { OrbitConfig, OrbitKeyframe } from './types';
import { DEFAULT_CONFIG, validateConfig } from './presets';
import { EffectPresetsSection } from '../../components/EffectPresetsSection';

interface OrbitModalProps {
  isOpen: boolean;
  config: OrbitConfig;
  onSave: (config: OrbitConfig) => void;
  onClose: () => void;
  currentCameraState?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  } | null;
  onJumpToKeyframe?: (keyIndex: number, keys: OrbitKeyframe[]) => void;
  centroid?: [number, number, number];
}

export const OrbitModal: React.FC<OrbitModalProps> = ({
  isOpen,
  config: initialConfig,
  onSave,
  onClose,
  currentCameraState,
  onJumpToKeyframe,
  centroid = [0, 0, 0]
}) => {
  const [config, setConfig] = useState<OrbitConfig>(() => ({ ...DEFAULT_CONFIG, ...initialConfig }));
  const [errors, setErrors] = useState<any>({});
  
  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && initialConfig) {
      setConfig({ ...initialConfig });
    }
  }, [isOpen]); // Only update when modal opens, not on every config change

  // Drag event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    
    // Calculate offset from current position, not from modal bounds
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragOffset.x,
      y: touch.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Drag event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragOffset]);

  // Validation effect - use JSON.stringify to prevent infinite loops from object references
  useEffect(() => {
    const validation = validateConfig(config, centroid);
    const newErrors = validation.errors;
    setErrors(prevErrors => {
      // Only update if errors actually changed
      if (JSON.stringify(prevErrors) !== JSON.stringify(newErrors)) {
        return newErrors;
      }
      return prevErrors;
    });
  }, [config, centroid]);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Don't render if not open
  if (!isOpen) return null;

  const handleSave = () => {
    const validation = validateConfig(config, centroid);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Distribute times if needed
    const finalConfig = { ...config };
    let needsDistribution = false;
    for (const key of finalConfig.keys) {
      if (key.t === undefined) {
        needsDistribution = true;
        break;
      }
    }

    if (needsDistribution) {
      for (let i = 0; i < finalConfig.keys.length; i++) {
        finalConfig.keys[i].t = (i / (finalConfig.keys.length - 1)) * finalConfig.durationSec;
      }
    }

    // Telemetry
    console.log(`orbit:save keys=${finalConfig.keys.length} duration=${finalConfig.durationSec}s lockedTarget=${finalConfig.lockTargetToCentroid} mode=${finalConfig.mode}`);

    onSave(finalConfig);
    onClose();
  };

  const handleAddKeyframe = () => {
    // Get fresh camera state from the global window object (if available)
    let freshCameraState = currentCameraState;
    
    // Try to get live camera state from Three.js scene if available
    if ((window as any).getCurrentCameraState) {
      freshCameraState = (window as any).getCurrentCameraState();
      console.log('🎥 OrbitModal: Got fresh camera state:', freshCameraState);
    } else {
      console.log('🎥 OrbitModal: Using provided camera state:', freshCameraState);
    }
    
    if (!freshCameraState) return;

    const newKey: OrbitKeyframe = {
      pos: [...freshCameraState.position],
      fov: freshCameraState.fov,
      easeToNext: false,
      pauseSec: 0.0
    };

    // Add target if not locked to centroid
    if (!config.lockTargetToCentroid && config.mode !== 'locked') {
      newKey.target = [...freshCameraState.target];
    }

    setConfig(prev => ({
      ...prev,
      keys: [...(prev.keys || []), newKey]
    }));
  };

  const handleDeleteKeyframe = (index: number) => {
    setConfig(prev => ({
      ...prev,
      keys: (prev.keys || []).filter((_, i) => i !== index)
    }));
  };

  const handleDistributeTimes = () => {
    if (!config.keys || config.keys.length === 0) return;
    
    const newKeys = config.keys.map((key, i) => {
      let time: number;
      if (config.loop) {
        // For loop mode: distribute evenly across all segments including loop-back
        time = (i / config.keys.length) * config.durationSec;
      } else {
        // For non-loop mode: distribute from first to last keyframe
        time = config.keys.length === 1 ? 0 : (i / (config.keys.length - 1)) * config.durationSec;
      }
      return {
        ...key,
        t: parseFloat(time.toFixed(1))
      };
    });
    
    setConfig(prev => ({ ...prev, keys: newKeys }));
  };

  const updateKeyframe = (index: number, updates: Partial<OrbitKeyframe>) => {
    setConfig(prev => ({
      ...prev,
      keys: prev.keys.map((key, i) => i === index ? { ...key, ...updates } : key)
    }));
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .orbit-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .orbit-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .orbit-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          border-radius: 10px;
          border: 2px solid rgba(219, 234, 254, 0.5);
        }
        .orbit-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
        }
        .orbit-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #1d4ed8;
        }
        .orbit-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #3b82f6 rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      <div 
        ref={dragRef}
        className="orbit-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)',
          borderRadius: '20px',
          padding: 0,
          maxWidth: '420px',
          width: '95%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          zIndex: 10001,
          cursor: isDragging ? 'grabbing' : 'default',
          border: '3px solid rgba(59,130,246,0.6)'
        }}
      >
      {/* Draggable Header */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          setDragOffset({
            x: touch.clientX - position.x,
            y: touch.clientY - position.y
          });
          setIsDragging(true);
        }}
        style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.08) 100%)',
          borderBottom: '2px solid rgba(59,130,246,0.3)',
          borderRadius: '17px 17px 0 0',
          cursor: 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          touchAction: 'none'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e3a8a' }}>
          🎥 Orbit Settings
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.25rem',
            color: '#6c757d'
          }}
          title="Close"
        >
          ×
        </button>
      </div>
      
      {/* Modal Content - Scrollable */}
      <div style={{
        flex: 1,
        padding: '1.5rem',
        backgroundColor: 'rgba(255,255,255,0.5)'
      }}>
        
        {/* Duration and Seamless Loop - Same Line */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              Duration
              <input
                type="text"
                inputMode="decimal"
                value={config.durationSec}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    setConfig(prev => ({ ...prev, durationSec: numValue }));
                  } else if (value === '') {
                    setConfig(prev => ({ ...prev, durationSec: 0.1 }));
                  }
                }}
                style={{
                  width: '60px',
                  padding: '0.25rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              <input
                type="checkbox"
                checked={config.loop}
                onChange={(e) => setConfig(prev => ({ ...prev, loop: e.target.checked }))}
              />
              Seamless Loop
            </label>
          </div>
          {errors.durationSec && (
            <div style={{ color: '#d32f2f', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {errors.durationSec}
            </div>
          )}
        </div>

        {/* Orbit-Locked and Lock Target - Same Line */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              <input
                type="checkbox"
                checked={config.mode === 'locked'}
                onChange={(e) => setConfig(prev => ({ ...prev, mode: e.target.checked ? 'locked' : 'free' }))}
              />
              Orbit-Locked
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              <input
                type="checkbox"
                checked={config.lockTargetToCentroid}
                disabled={config.mode === 'locked'}
                onChange={(e) => setConfig(prev => ({ ...prev, lockTargetToCentroid: e.target.checked }))}
              />
              Lock target to centroid
            </label>
          </div>
        </div>

        {/* Keyframes Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500' }}>
              Keyframes ({config.keys?.length ?? 0})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleAddKeyframe}
                disabled={!currentCameraState && !(window as any).getCurrentCameraState}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (currentCameraState || (window as any).getCurrentCameraState) ? 'pointer' : 'not-allowed',
                  opacity: (currentCameraState || (window as any).getCurrentCameraState) ? 1 : 0.5
                }}
              >
                Add Keyframe
              </button>
              {(config.keys?.length ?? 0) > 0 && (
                <button
                  onClick={handleDistributeTimes}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8rem',
                    backgroundColor: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Distribute times evenly
                </button>
              )}
            </div>
          </div>

          {/* Error Messages */}
          {errors.keys && (
            <div style={{ color: '#d32f2f', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {errors.keys}
            </div>
          )}
          {errors.keyTimes && (
            <div style={{ color: '#d32f2f', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {errors.keyTimes}
            </div>
          )}
          {errors.identicalKeys && (
            <div style={{ color: '#d32f2f', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {errors.identicalKeys}
            </div>
          )}
          {errors.centroid && (
            <div style={{ color: '#d32f2f', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {errors.centroid}
            </div>
          )}

          {/* Keyframes List - Optimized for 5 keyframes */}
          <div style={{ 
            maxHeight: '150px', 
            overflow: 'auto', 
            border: '1px solid #e0e0e0', 
            borderRadius: '4px',
            backgroundColor: '#fafafa'
          }}>
            {(!config.keys || config.keys.length === 0) ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center', 
                color: '#666', 
                fontSize: '0.9rem' 
              }}>
                No keyframes yet. Add keyframes to create camera path.
              </div>
            ) : (
              config.keys.map((key, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.5rem',
                  borderBottom: index < (config.keys?.length ?? 0) - 1 ? '1px solid #e0e0e0' : 'none',
                  backgroundColor: '#fff',
                  fontSize: '0.75rem',
                  flexWrap: 'nowrap',
                  minWidth: 0
                }}>
                  {/* Jump Button */}
                  <button
                    onClick={() => onJumpToKeyframe && onJumpToKeyframe(index, config.keys)}
                    disabled={!onJumpToKeyframe}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.7rem',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: onJumpToKeyframe ? 'pointer' : 'not-allowed',
                      opacity: onJumpToKeyframe ? 1 : 0.5
                    }}
                    title="Preview this keyframe"
                  >
                    Jump
                  </button>

                  {/* Ease Checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={key.easeToNext || false}
                      onChange={(e) => updateKeyframe(index, { easeToNext: e.target.checked })}
                      style={{ transform: 'scale(0.8)' }}
                    />
                    <span>Ease</span>
                  </label>

                  {/* Time Input */}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={key.t !== undefined ? parseFloat(key.t.toFixed(1)) : ''}
                    placeholder="auto"
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        updateKeyframe(index, { t: undefined });
                      } else {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                          updateKeyframe(index, { t: numValue });
                        }
                      }
                    }}
                    style={{
                      width: '40px',
                      padding: '0.2rem',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      fontSize: '0.65rem'
                    }}
                  />
                  <span style={{ fontSize: '0.65rem' }}>s</span>

                  {/* Pause Input */}
                  <span style={{ fontSize: '0.65rem' }}>Pause</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={key.pauseSec !== undefined ? (key.pauseSec === 0 ? '' : parseFloat(key.pauseSec.toFixed(1))) : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const value = e.target.value;
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        updateKeyframe(index, { pauseSec: numValue });
                      } else if (value === '') {
                        updateKeyframe(index, { pauseSec: 0.0 });
                      }
                    }}
                    style={{
                      width: '35px',
                      padding: '0.2rem',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      fontSize: '0.65rem'
                    }}
                  />
                  <span style={{ fontSize: '0.65rem' }}>s</span>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteKeyframe(index)}
                    style={{
                      padding: '0.25rem',
                      fontSize: '0.7rem',
                      backgroundColor: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      marginLeft: 'auto'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Presets Section */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
          <EffectPresetsSection<OrbitConfig>
            effectType="orbit"
            currentConfig={config}
            onLoadPreset={(loadedConfig) => {
              setConfig(loadedConfig);
              console.log('✅ Loaded orbit preset');
            }}
          />
        </div>
      </div>

      {/* Action Buttons - Fixed Footer */}
      <div style={{ 
        padding: '1rem 1.5rem',
        borderTop: '2px solid rgba(59,130,246,0.3)',
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'flex-end',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.08) 100%)',
        borderRadius: '0 0 17px 17px'
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '0.625rem 1.5rem',
            border: '2px solid rgba(59,130,246,0.3)',
            borderRadius: '12px',
            backgroundColor: 'rgba(255,255,255,0.9)',
            color: '#1e3a8a',
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
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.3)';
          }}
        >
          ✓ Apply
        </button>
      </div>
    </div>
    </>
  );
};
