// Explosion Modal - configuration UI for Explosion effect
import React, { useState, useEffect, useRef } from 'react';
import { 
  ExplosionConfig, 
  DEFAULT_CONFIG, 
  validateConfig 
} from './presets';

export interface ExplosionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ExplosionConfig) => void;
  initialConfig?: ExplosionConfig;
}

export const ExplosionModal: React.FC<ExplosionModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialConfig = DEFAULT_CONFIG 
}) => {
  const [config, setConfig] = useState<ExplosionConfig>(initialConfig);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  // Drag event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    
    setDragOffset({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
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
    if (!isDragging || e.touches.length !== 1) return;
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
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragOffset]);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
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

  const handleFieldChange = (field: keyof ExplosionConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    console.log(`effect=explosion action=change field=${field} value=${JSON.stringify(value)}`);
  };

  const handleSave = () => {
    const validation = validateConfig(config);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    console.log(`effect=explosion action=save config=${JSON.stringify(config)}`);
    onSave(config);
    onClose();
  };

  const handleCancel = () => {
    console.log('effect=explosion action=cancel');
    onClose();
  };
  
  if (!isOpen) return null;
  
  const isValid = Object.keys(errors).length === 0;

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 4999
        }}
        onClick={handleCancel}
      />
      
      {/* Modal */}
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
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          zIndex: 5000,
          cursor: isDragging ? 'grabbing' : 'default',
          border: '2px solid #ff5722'
        }}
      >
        {/* Draggable Header */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{
            padding: '1rem 1.5rem',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
          borderRadius: '8px 8px 0 0',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
          💥 Explosion Settings
        </h2>
      </div>

      {/* Modal Content */}
      <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
        
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
            onChange={(e) => handleFieldChange('durationSec', parseFloat(e.target.value) || 0.1)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: errors.durationSec ? '1px solid #d32f2f' : '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
          {errors.durationSec && (
            <div style={{ color: '#d32f2f', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {errors.durationSec}
            </div>
          )}
        </div>

        {/* Loop */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={config.loop}
              onChange={(e) => handleFieldChange('loop', e.target.checked)}
            />
            Loop (0 → max → 0)
          </label>
        </div>

        {/* Pause Between Loops */}
        {config.loop && (
          <div style={{ marginBottom: '1rem', marginLeft: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Pause Between Loops (seconds)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.pauseBetweenLoops}
              onChange={(e) => handleFieldChange('pauseBetweenLoops', parseFloat(e.target.value) || 0)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: errors.pauseBetweenLoops ? '1px solid #d32f2f' : '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
            {errors.pauseBetweenLoops && (
              <div style={{ color: '#d32f2f', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.pauseBetweenLoops}
              </div>
            )}
          </div>
        )}

        {/* Max Explosion Factor */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Max Explosion Factor (0 = assembled, 1 = 1.5x spacing, higher = more)
          </label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={config.maxExplosionFactor}
            onChange={(e) => handleFieldChange('maxExplosionFactor', parseFloat(e.target.value) || 0)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: errors.maxExplosionFactor ? '1px solid #d32f2f' : '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
          {errors.maxExplosionFactor && (
            <div style={{ color: '#d32f2f', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              {errors.maxExplosionFactor}
            </div>
          )}
        </div>

        {/* Explosion Easing */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Explosion Easing
          </label>
          <select
            value={config.explosionEasing}
            onChange={(e) => handleFieldChange('explosionEasing', e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          >
            <option value="linear">Linear</option>
            <option value="ease-in">Ease In</option>
            <option value="ease-out">Ease Out</option>
            <option value="ease-in-out">Ease In/Out</option>
          </select>
        </div>

        {/* Rotation Section */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
            Rotation (Y-Axis)
          </h3>

          {/* Rotation Enabled */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
              <input
                type="checkbox"
                checked={config.rotationEnabled}
                onChange={(e) => handleFieldChange('rotationEnabled', e.target.checked)}
              />
              Enable Rotation
            </label>
          </div>

          {/* Rotation Degrees */}
          {config.rotationEnabled && (
            <>
              <div style={{ marginBottom: '1rem', marginLeft: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Rotation Degrees
                </label>
                <input
                  type="number"
                  step="1"
                  value={config.rotationDegrees}
                  onChange={(e) => handleFieldChange('rotationDegrees', parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: errors.rotationDegrees ? '1px solid #d32f2f' : '1px solid #ccc',
                    borderRadius: '4px'
                  }}
                />
                {errors.rotationDegrees && (
                  <div style={{ color: '#d32f2f', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {errors.rotationDegrees}
                  </div>
                )}
              </div>

              {/* Rotation Easing */}
              <div style={{ marginBottom: '1rem', marginLeft: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Rotation Easing
                </label>
                <select
                  value={config.rotationEasing}
                  onChange={(e) => handleFieldChange('rotationEasing', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px'
                  }}
                >
                  <option value="linear">Linear</option>
                  <option value="ease-in">Ease In</option>
                  <option value="ease-out">Ease Out</option>
                  <option value="ease-in-out">Ease In/Out</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
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
            disabled={!isValid}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: isValid ? '#ff5722' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isValid ? 'pointer' : 'not-allowed',
              opacity: isValid ? 1 : 0.6
            }}
          >
            Save & Activate
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
