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
  const [config, setConfig] = useState<OrbitConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [errors, setErrors] = useState<any>({});
  
  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...initialConfig });
    }
  }, [initialConfig]);

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

  // Validation effect
  useEffect(() => {
    const validation = validateConfig(config, centroid);
    setErrors(validation.errors);
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
      keys: [...prev.keys, newKey]
    }));
  };

  const handleDeleteKeyframe = (index: number) => {
    setConfig(prev => ({
      ...prev,
      keys: prev.keys.filter((_, i) => i !== index)
    }));
  };

  const handleDistributeTimes = () => {
    if (config.keys.length === 0) return;
    
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
    <div 
      ref={dragRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: 0,
        maxWidth: '420px',
        width: '95%',
        maxHeight: '60vh',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        zIndex: 5000,
        cursor: isDragging ? 'grabbing' : 'default',
        border: '2px solid #007bff'
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
          padding: '0.75rem 1rem',
          backgroundColor: '#f8f9fa',
          borderBottom: '1px solid #dee2e6',
          borderRadius: '8px 8px 0 0',
          cursor: 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          touchAction: 'none'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
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
      
      {/* Modal Content */}
      <div style={{
        padding: '1rem',
        maxHeight: 'calc(60vh - 80px)',
        overflowY: 'auto',
        scrollbarWidth: 'thin'
      }}>
        
        {/* Duration and Seamless Loop - Same Line */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              Duration
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={config.durationSec}
                onChange={(e) => setConfig(prev => ({ ...prev, durationSec: parseFloat(e.target.value) || 0.1 }))}
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
              Keyframes ({config.keys.length})
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
              {config.keys.length > 0 && (
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
            maxHeight: '250px', 
            overflow: 'auto', 
            border: '1px solid #e0e0e0', 
            borderRadius: '4px',
            backgroundColor: '#fafafa'
          }}>
            {config.keys.length === 0 ? (
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
                  borderBottom: index < config.keys.length - 1 ? '1px solid #e0e0e0' : 'none',
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
                    type="number"
                    min="0"
                    max={config.durationSec}
                    step="0.1"
                    value={key.t !== undefined ? parseFloat(key.t.toFixed(1)) : ''}
                    placeholder="auto"
                    onChange={(e) => updateKeyframe(index, { t: e.target.value ? parseFloat(e.target.value) : undefined })}
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
                    type="number"
                    min="0"
                    step="0.1"
                    value={key.pauseSec !== undefined ? (key.pauseSec === 0 ? '' : parseFloat(key.pauseSec.toFixed(1))) : ''}
                    placeholder="0"
                    onChange={(e) => updateKeyframe(index, { pauseSec: parseFloat(e.target.value) || 0.0 })}
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

        {/* Presets Section - Database-backed presets */}
        <EffectPresetsSection<OrbitConfig>
          effectType="orbit"
          currentConfig={config}
          onLoadPreset={(loadedConfig) => {
            setConfig(loadedConfig);
            console.log('✅ Loaded orbit preset');
          }}
        />

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              backgroundColor: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.9rem',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
