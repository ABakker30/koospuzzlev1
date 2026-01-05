import React, { useState, useEffect } from 'react';
import type { StudioSettings } from '../../../types/studio';
import { DEFAULT_STUDIO_SETTINGS } from '../../../types/studio';
import { ENVIRONMENT_PRESETS, PRESET_LABELS, PRESET_ORDER } from '../../../constants/environmentPresets';
import { StudioSettingsService } from '../../../services/StudioSettingsService';
import { supabase } from '../../../lib/supabase';

interface MaterialSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StudioSettings;
  onSettingsChange: (settings: StudioSettings) => void;
  currentPreset?: string;
  onPresetChange?: (presetKey: string) => void;
}

const HDR_OPTIONS = [
  { id: 'studio', name: 'Studio' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'forest', name: 'Forest' },
  { id: 'night', name: 'Night' },
  { id: 'warehouse', name: 'Warehouse' },
];

export const MaterialSettingsModal: React.FC<MaterialSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  currentPreset,
  onPresetChange,
}) => {
  const [localSettings, setLocalSettings] = useState<StudioSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const settingsService = new StudioSettingsService();

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const updateEmptyCells = (key: keyof StudioSettings['emptyCells']['customMaterial'], value: number | string) => {
    const newSettings = {
      ...localSettings,
      emptyCells: {
        ...localSettings.emptyCells,
        customMaterial: {
          ...localSettings.emptyCells.customMaterial,
          [key]: value,
        },
      },
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const updateLights = (key: string, value: any) => {
    const newSettings = {
      ...localSettings,
      lights: {
        ...localSettings.lights,
        [key]: value,
      },
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const updateHDR = (key: string, value: any) => {
    const newSettings = {
      ...localSettings,
      lights: {
        ...localSettings.lights,
        hdr: {
          ...localSettings.lights.hdr,
          [key]: value,
        },
      },
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const selectPreset = (presetKey: string) => {
    const preset = ENVIRONMENT_PRESETS[presetKey];
    if (preset) {
      setLocalSettings(preset);
      onSettingsChange(preset);
      onPresetChange?.(presetKey);
    }
  };

  const resetToDefaults = () => {
    setLocalSettings(DEFAULT_STUDIO_SETTINGS);
    onSettingsChange(DEFAULT_STUDIO_SETTINGS);
  };

  const saveToDatabase = async () => {
    setSaving(true);
    setSaveMessage(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setSaveMessage('Please sign in to save settings');
        setSaving(false);
        return;
      }

      const success = await settingsService.saveSettingsToDB(session.user.id, localSettings);
      if (success) {
        setSaveMessage('Settings saved!');
        // Also save to localStorage
        settingsService.saveSettings(localSettings);
        localStorage.setItem('studioSettings.vs', JSON.stringify(localSettings));
      } else {
        setSaveMessage('Failed to save');
      }
    } catch (err) {
      setSaveMessage('Error saving');
    }
    
    setSaving(false);
    setTimeout(() => setSaveMessage(null), 2000);
  };

  const sliderStyle: React.CSSProperties = {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    background: '#333',
    cursor: 'pointer',
    WebkitAppearance: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: '#aaa',
    marginBottom: '4px',
    display: 'flex',
    justifyContent: 'space-between',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: '8px',
  };

  return (
    <>
      <style>{`
        .mat-settings-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #60a5fa;
          cursor: pointer;
          border: 2px solid #fff;
        }
        .mat-settings-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #60a5fa;
          cursor: pointer;
          border: 2px solid #fff;
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(145deg, #1a1a2e, #16162a)',
          borderRadius: '16px',
          padding: '20px',
          width: 'min(420px, 90vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          zIndex: 9999,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>⚙️ Material Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '1.2rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Presets */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Quick Presets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {PRESET_ORDER.map((key) => (
              <button
                key={key}
                onClick={() => selectPreset(key)}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  border: currentPreset === key ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                  background: currentPreset === key ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                  color: currentPreset === key ? '#60a5fa' : '#ccc',
                  cursor: 'pointer',
                }}
              >
                {PRESET_LABELS[key] || key}
              </button>
            ))}
          </div>
        </div>

        {/* Empty Cells Material */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Empty Cells</div>
          
          <div style={{ marginBottom: '12px' }}>
            <div style={labelStyle}>
              <span>Opacity</span>
              <span>{(localSettings.emptyCells.customMaterial.opacity * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localSettings.emptyCells.customMaterial.opacity}
              onChange={(e) => updateEmptyCells('opacity', parseFloat(e.target.value))}
              className="mat-settings-slider"
              style={sliderStyle}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={labelStyle}>
              <span>Metalness</span>
              <span>{(localSettings.emptyCells.customMaterial.metalness * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localSettings.emptyCells.customMaterial.metalness}
              onChange={(e) => updateEmptyCells('metalness', parseFloat(e.target.value))}
              className="mat-settings-slider"
              style={sliderStyle}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={labelStyle}>
              <span>Roughness</span>
              <span>{(localSettings.emptyCells.customMaterial.roughness * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={localSettings.emptyCells.customMaterial.roughness}
              onChange={(e) => updateEmptyCells('roughness', parseFloat(e.target.value))}
              className="mat-settings-slider"
              style={sliderStyle}
            />
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={labelStyle}>
              <span>Color</span>
              <span>{localSettings.emptyCells.customMaterial.color}</span>
            </div>
            <input
              type="color"
              value={localSettings.emptyCells.customMaterial.color}
              onChange={(e) => updateEmptyCells('color', e.target.value)}
              style={{
                width: '100%',
                height: '32px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>

        {/* Lighting */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Lighting</div>
          
          <div style={{ marginBottom: '12px' }}>
            <div style={labelStyle}>
              <span>Brightness</span>
              <span>{localSettings.lights.brightness.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={localSettings.lights.brightness}
              onChange={(e) => updateLights('brightness', parseFloat(e.target.value))}
              className="mat-settings-slider"
              style={sliderStyle}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={labelStyle}>
              <span>Background Color</span>
            </div>
            <input
              type="color"
              value={localSettings.lights.backgroundColor}
              onChange={(e) => updateLights('backgroundColor', e.target.value)}
              style={{
                width: '100%',
                height: '32px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>

        {/* HDR Environment */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>HDR Environment</div>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localSettings.lights.hdr.enabled}
                onChange={(e) => updateHDR('enabled', e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ color: '#ccc', fontSize: '0.9rem' }}>Enable HDR Lighting</span>
            </label>
          </div>

          {localSettings.lights.hdr.enabled && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <div style={labelStyle}>
                  <span>Environment</span>
                </div>
                <select
                  value={localSettings.lights.hdr.envId || 'studio'}
                  onChange={(e) => updateHDR('envId', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: '#222',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                >
                  {HDR_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <div style={labelStyle}>
                  <span>HDR Intensity</span>
                  <span>{localSettings.lights.hdr.intensity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={localSettings.lights.hdr.intensity}
                  onChange={(e) => updateHDR('intensity', parseFloat(e.target.value))}
                  className="mat-settings-slider"
                  style={sliderStyle}
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            onClick={resetToDefaults}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#ccc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.9rem',
            }}
          >
            🔄 Reset
          </button>
          
          <button
            onClick={saveToDatabase}
            disabled={saving}
            style={{
              flex: 2,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              cursor: saving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.9rem',
              fontWeight: 500,
              opacity: saving ? 0.7 : 1,
            }}
          >
            💾 {saving ? 'Saving...' : 'Save to Account'}
          </button>
        </div>

        {saveMessage && (
          <div style={{
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: saveMessage.includes('saved') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
            color: saveMessage.includes('saved') ? '#22c55e' : '#ef4444',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}>
            {saveMessage}
          </div>
        )}

        {/* Keyboard hint */}
        <div style={{
          marginTop: '12px',
          padding: '8px',
          borderRadius: '6px',
          background: 'rgba(255,255,255,0.03)',
          color: '#666',
          fontSize: '0.75rem',
          textAlign: 'center',
        }}>
          Press <kbd style={{ background: '#333', padding: '2px 6px', borderRadius: '3px' }}>S</kbd> to toggle this panel
        </div>
      </div>
    </>
  );
};
