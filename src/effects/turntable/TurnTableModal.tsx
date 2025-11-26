// Turn Table Modal - configuration UI with validation and presets
import { useState, useEffect, useRef } from 'react';
import { useDraggable } from '../../hooks/useDraggable';
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
  const draggable = useDraggable();
  
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Log when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('effect=turntable action=open-modal');
    }
  }, [isOpen]);

  // Focus management - removed auto-focus to prevent mobile keyboard opening

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
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .turntable-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .turntable-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(236, 72, 153, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .turntable-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #ec4899, #db2777);
          border-radius: 10px;
          border: 2px solid rgba(252, 231, 243, 0.5);
        }
        .turntable-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #db2777, #be185d);
        }
        .turntable-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #be185d;
        }
        .turntable-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #ec4899 rgba(236, 72, 153, 0.1);
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
        className="turntable-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f9a8d4 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(236,72,153,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable Header */}
        <div style={{
          background: 'linear-gradient(135deg, #ec4899, #db2777, #be185d)',
          padding: '1.25rem 1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(236,72,153,0.4)',
          position: 'relative',
          userSelect: 'none',
          ...draggable.headerStyle
        }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '20px', 
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            Turn Table Settings
          </h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCancel();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              handleCancel();
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
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
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
            padding: '0 24px 24px'
          }}
        >
          <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#9d174d', lineHeight: '1.5' }}>
          Rotation around Y through the sculpture's centroid. Camera orbits in camera mode; sculpture rotates in object mode.
        </p>

          {/* Parameters Section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#831843' }}>Parameters</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Duration */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Duration (seconds)
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  inputMode="decimal"
                  value={config.durationSec === 0 ? '' : config.durationSec}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      handleFieldChange('durationSec', numValue);
                    } else if (value === '') {
                      handleFieldChange('durationSec', 0);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.durationSec ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box'
                  }}
                  min="0.1"
                  max="600"
                  step="0.1"
                  aria-describedby={errors.durationSec ? 'duration-error' : undefined}
                />
                {errors.durationSec && (
                  <div id="duration-error" style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    {errors.durationSec}
                  </div>
                )}
              </div>

              {/* Degrees */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Degrees
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={config.degrees === 0 ? '' : config.degrees}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = parseInt(value);
                    if (!isNaN(numValue)) {
                      handleFieldChange('degrees', numValue);
                    } else if (value === '' || value === '-') {
                      handleFieldChange('degrees', 0);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.degrees ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box'
                  }}
                  step="1"
                  aria-describedby={errors.degrees ? 'degrees-error' : undefined}
                />
                {errors.degrees && (
                  <div id="degrees-error" style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                    {errors.degrees}
                  </div>
                )}
              </div>

              {/* Direction */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Direction
                </label>
                <select
                  value={config.direction}
                  onChange={(e) => handleFieldChange('direction', e.target.value as 'cw' | 'ccw')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.direction ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
                  }}
                >
                  <option value="cw">Clockwise (CW)</option>
                  <option value="ccw">Counter-clockwise (CCW)</option>
                </select>
              </div>

              {/* Mode */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Mode
                </label>
                <select
                  value={config.mode}
                  onChange={(e) => handleFieldChange('mode', e.target.value as 'camera' | 'object')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.mode ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
                  }}
                >
                  <option value="camera">Camera (orbit around)</option>
                  <option value="object">Object (rotate sculpture)</option>
                </select>
              </div>

              {/* Easing */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Easing
                </label>
                <select
                  value={config.easing}
                  onChange={(e) => handleFieldChange('easing', e.target.value as TurnTableConfig['easing'])}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.easing ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
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
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#9d174d' }}>
                  Finalization
                </label>
                <select
                  value={config.finalize}
                  onChange={(e) => handleFieldChange('finalize', e.target.value as TurnTableConfig['finalize'])}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: `2px solid ${errors.finalize ? '#dc2626' : 'rgba(236,72,153,0.3)'}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.9)',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
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
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '2px solid rgba(236,72,153,0.2)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#831843' }}>Presets</h3>
            <EffectPresetsSection<TurnTableConfig>
              effectType="turntable"
              currentConfig={config}
              onLoadPreset={(loadedConfig) => {
                setConfig(loadedConfig);
                console.log('✅ Loaded turntable preset');
              }}
            />
          </div>
        </div>

        {/* Action Buttons - Fixed Footer */}
        <div style={{ 
          padding: '0 24px 24px',
          display: 'flex', 
          gap: '12px', 
          justifyContent: 'flex-end' 
        }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: '#fff',
              border: '2px solid rgba(236,72,153,0.3)',
              borderRadius: '10px',
              color: '#9d174d',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: isValid ? '#ec4899' : '#d1d5db',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isValid ? 'pointer' : 'not-allowed',
              boxShadow: isValid ? '0 4px 12px rgba(236,72,153,0.4)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
};
