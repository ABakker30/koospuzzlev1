// Reveal Modal - configuration UI for Reveal effect
import { useState, useEffect } from 'react';
import { useDraggable } from '../../hooks/useDraggable';
import { 
  RevealConfig, 
  DEFAULT_CONFIG, 
  validateConfig 
} from './presets';
import { EffectPresetsSection } from '../../components/EffectPresetsSection';

export interface RevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: RevealConfig) => void;
  initialConfig?: RevealConfig;
}

export const RevealModal: React.FC<RevealModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialConfig = DEFAULT_CONFIG 
}) => {
  const [config, setConfig] = useState<RevealConfig>(initialConfig);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const draggable = useDraggable();

  // Log when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('effect=reveal action=open-modal');
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

  const handleFieldChange = (field: keyof RevealConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    console.log(`effect=reveal action=change field=${field} value=${JSON.stringify(value)}`);
  };

  const handleSave = (e?: React.MouseEvent) => {
    // Prevent event bubbling and default
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const validation = validateConfig(config);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    console.log(`effect=reveal action=save config=${JSON.stringify(config)}`);
    onSave(config);
    onClose();
  };

  const handleCancel = () => {
    console.log('effect=reveal action=cancel');
    onClose();
  };
  
  if (!isOpen) return null;
  
  const isValid = Object.keys(errors).length === 0;

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .reveal-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .reveal-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(251, 191, 36, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .reveal-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #fbbf24, #f59e0b);
          border-radius: 10px;
          border: 2px solid rgba(254, 243, 199, 0.5);
        }
        .reveal-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #f59e0b, #d97706);
        }
        .reveal-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #d97706;
        }
        .reveal-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #fbbf24 rgba(251, 191, 36, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="reveal-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(251,191,36,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{ 
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.08) 100%)',
            borderBottom: '2px solid rgba(251,191,36,0.3)',
            borderTopLeftRadius: '17px',
            borderTopRightRadius: '17px',
            ...draggable.headerStyle
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#92400e' }}>
            ✨ Reveal Settings
          </h2>
        </div>

      {/* Content */}
      <div style={{ 
        flex: 1,
        padding: '1.5rem',
        backgroundColor: 'rgba(255,255,255,0.5)'
      }}>
        
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

        {/* Reveal Easing */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Reveal Easing
          </label>
          <select
            value={config.revealEasing}
            onChange={(e) => handleFieldChange('revealEasing', e.target.value)}
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

        {/* Presets Section */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
          <EffectPresetsSection<RevealConfig>
            effectType="reveal"
            currentConfig={config}
            onLoadPreset={(loadedConfig) => {
              setConfig(loadedConfig);
              console.log('✅ Loaded reveal preset');
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '2px solid rgba(251,191,36,0.3)',
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'flex-end',
        background: 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.08) 100%)',
        borderBottomLeftRadius: '17px',
        borderBottomRightRadius: '17px'
      }}>
        <button
          onClick={handleCancel}
          style={{
            padding: '0.625rem 1.5rem',
            border: '2px solid rgba(251,191,36,0.3)',
            borderRadius: '12px',
            backgroundColor: 'rgba(255,255,255,0.9)',
            color: '#92400e',
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
          onClick={(e) => handleSave(e)}
          disabled={!isValid}
          style={{
            padding: '0.625rem 1.5rem',
            border: 'none',
            borderRadius: '12px',
            background: isValid ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : '#e9ecef',
            color: isValid ? '#fff' : '#6c757d',
            cursor: isValid ? 'pointer' : 'not-allowed',
            fontSize: '1rem',
            fontWeight: 700,
            boxShadow: isValid ? '0 2px 8px rgba(251,191,36,0.3)' : 'none',
            transition: 'all 0.2s ease',
            opacity: isValid ? 1 : 0.6
          }}
          onMouseOver={(e) => {
            if (isValid) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(251,191,36,0.4)';
            }
          }}
          onMouseOut={(e) => {
            if (isValid) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(251,191,36,0.3)';
            }
          }}
        >
          ✓ Apply
        </button>
      </div>
    </div>
    </>
  );
};
