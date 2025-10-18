// Turn Table Modal - configuration UI with validation and presets
import { useState, useEffect, useRef } from 'react';
import { 
  TurnTableConfig, 
  DEFAULT_CONFIG, 
  validateConfig 
} from './presets';
import { EffectPresetsSection } from '../../components/EffectPresetsSection';

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
  
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  
  // Drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  // Log when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('effect=turntable action=open-modal');
    }
  }, [isOpen]);

  // Focus management - removed auto-focus to prevent mobile keyboard opening

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

  console.log('🔍 TurnTableModal: isOpen=', isOpen);
  
  if (!isOpen) return null;
  
  const isValid = Object.keys(errors).length === 0;

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
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        zIndex: 5000,
        cursor: isDragging ? 'grabbing' : 'default',
        border: '2px solid #28a745'
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
          Turn Table Settings
        </h2>
        <button
          onClick={handleCancel}
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
        ref={modalRef}
        style={{
          padding: '1.5rem',
          maxHeight: 'calc(90vh - 120px)',
          overflow: 'auto'
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
                value={config.durationSec === 0 ? '' : config.durationSec}
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
                value={config.degrees === 0 ? '' : config.degrees}
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

        {/* Presets Section - Database-backed presets */}
        <EffectPresetsSection<TurnTableConfig>
          effectType="turntable"
          currentConfig={config}
          onLoadPreset={(loadedConfig) => {
            setConfig(loadedConfig);
            console.log('✅ Loaded turntable preset');
          }}
        />

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
