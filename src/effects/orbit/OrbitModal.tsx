// Orbit Modal - Keyframe Settings UI

import React, { useState, useEffect, useRef } from 'react';
import { OrbitConfig, OrbitKeyframe } from './types';
import { DEFAULT_CONFIG, validateConfig, VALIDATION_MESSAGES } from './presets';

interface OrbitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: OrbitConfig) => void;
  initialConfig?: OrbitConfig;
  centroid?: [number, number, number];
  currentCameraState?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  onJumpToKeyframe?: (keyIndex: number, keyframes: OrbitKeyframe[]) => void;
}

export const OrbitModal: React.FC<OrbitModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig,
  centroid,
  currentCameraState,
  onJumpToKeyframe
}) => {
  const [config, setConfig] = useState<OrbitConfig>(initialConfig || { ...DEFAULT_CONFIG });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(null);
  
  // Drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Drag event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

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
      easeToNext: false
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

  const handleUpdateSelectedKeyframe = () => {
    if (!currentCameraState || selectedKeyframeIndex === null) return;

    const updates: Partial<OrbitKeyframe> = {
      pos: [...currentCameraState.position],
      fov: currentCameraState.fov
    };

    // Add target if not locked to centroid
    if (!config.lockTargetToCentroid && config.mode !== 'locked') {
      updates.target = [...currentCameraState.target];
    }

    updateKeyframe(selectedKeyframeIndex, updates);
  };

  const handleDeleteKeyframe = (index: number) => {
    setConfig(prev => ({
      ...prev,
      keys: prev.keys.filter((_, i) => i !== index)
    }));
  };


  const handleDistributeTimes = () => {
    const newKeys = config.keys.map((key, i) => ({
      ...key,
      t: (i / (config.keys.length - 1)) * config.durationSec
    }));
    
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
        maxWidth: '600px',
        width: '90%',
        maxHeight: '95vh',
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
          style={{
            padding: '1rem 1.5rem',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            borderRadius: '8px 8px 0 0',
            cursor: 'grab',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            🎥 Orbit — Keyframe Settings
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
        <div 
          className="orbit-modal-content"
          style={{
            padding: '1.5rem',
            maxHeight: 'calc(95vh - 140px)', // Adjusted for new modal height and header/footer
            overflowY: 'scroll',
            scrollbarWidth: 'thin',
            scrollbarColor: '#007bff #f1f1f1'
          }}
        >

        {/* Duration */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Duration (seconds)
          </label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={config.durationSec}
            onChange={(e) => setConfig(prev => ({ ...prev, durationSec: parseFloat(e.target.value) || 0 }))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          />
          {errors.durationSec && (
            <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {errors.durationSec}
            </div>
          )}
        </div>

        {/* Loop */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={config.loop}
              onChange={(e) => setConfig(prev => ({ ...prev, loop: e.target.checked }))}
            />
            <span style={{ fontWeight: '500' }}>Loop</span>
          </label>
        </div>

        {/* Mode */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Authoring Mode
          </label>
          <select
            value={config.mode}
            onChange={(e) => setConfig(prev => ({ ...prev, mode: e.target.value as 'free' | 'locked' }))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="free">Free-Path</option>
            <option value="locked">Orbit-Locked</option>
          </select>
        </div>

        {/* Lock Target */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={config.lockTargetToCentroid}
              disabled={config.mode === 'locked'}
              onChange={(e) => setConfig(prev => ({ ...prev, lockTargetToCentroid: e.target.checked }))}
            />
            <span style={{ fontWeight: '500' }}>Lock target to centroid</span>
            {config.mode === 'locked' && (
              <span style={{ fontSize: '0.75rem', color: '#666' }}>(forced ON in Orbit-Locked)</span>
            )}
          </label>
        </div>

        {/* Keyframes */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500' }}>
              Keyframes ({config.keys.length})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleAddKeyframe}
                disabled={!currentCameraState}
                style={{
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentCameraState ? 'pointer' : 'not-allowed',
                  opacity: currentCameraState ? 1 : 0.5
                }}
              >
                Add Keyframe
              </button>
              {config.keys.length > 0 && (
                <button
                  onClick={handleDistributeTimes}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
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

          {errors.keys && (
            <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              {errors.keys}
            </div>
          )}

          {errors.keyTimes && (
            <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              {errors.keyTimes}
            </div>
          )}

          {errors.identicalKeys && (
            <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              {errors.identicalKeys}
            </div>
          )}

          {errors.centroid && (
            <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              {errors.centroid}
            </div>
          )}

          <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
            {config.keys.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
                No keyframes yet. Add keyframes to create camera path.
              </div>
            ) : (
              config.keys.map((key, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  borderBottom: index < config.keys.length - 1 ? '1px solid #e0e0e0' : 'none',
                  fontSize: '0.75rem'
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
                    title="Preview this keyframe (pauses if currently playing)"
                  >
                    Jump ▸
                  </button>

                  {/* Ease Checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={key.easeToNext || false}
                      onChange={(e) => updateKeyframe(index, { easeToNext: e.target.checked })}
                      style={{ transform: 'scale(0.8)' }}
                    />
                    <span title="Smooths this segment (key → next) with ease-in-out">Ease</span>
                  </label>

                  {/* Time Input */}
                  <input
                    type="number"
                    min="0"
                    max={config.durationSec}
                    step="0.1"
                    value={key.t !== undefined ? key.t : ''}
                    placeholder="auto"
                    onChange={(e) => updateKeyframe(index, { t: e.target.value ? parseFloat(e.target.value) : undefined })}
                    style={{
                      width: '60px',
                      padding: '0.25rem',
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      fontSize: '0.7rem'
                    }}
                  />
                  <span>s</span>

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
                      cursor: 'pointer'
                    }}
                  >
                    ⓧ
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Finalize */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            When animation ends
          </label>
          <select
            value={config.finalize}
            onChange={(e) => setConfig(prev => ({ ...prev, finalize: e.target.value as any }))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="leaveAsEnded">Leave as ended</option>
            <option value="returnToStart">Return to start</option>
            <option value="snapToPose">Snap to pose</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
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
              fontSize: '0.875rem',
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
