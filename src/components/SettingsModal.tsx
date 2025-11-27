import React, { useState, useEffect } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import type { StudioSettings } from '../types/studio';
import { HDRLoader } from '../services/HDRLoader';
import type { StudioPreset } from '../api/studioPresets';
import { 
  saveStudioPreset, 
  getUserPresets, 
  deleteStudioPreset
} from '../api/studioPresets';

interface SettingsModalProps {
  settings: StudioSettings;
  onSettingsChange: (settings: StudioSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSettingsChange,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'material' | 'lighting' | 'camera' | 'emptyCells' | 'presets'>('material');
  
  // Presets state
  const [presetsMode, setPresetsMode] = useState<'list' | 'save'>('list');
  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const draggable = useDraggable();

  const updateSettings = (updates: Partial<StudioSettings>) => {
    console.log('⚙️ SettingsModal: Updating settings with:', updates);
    const newSettings = { ...settings, ...updates };
    console.log('⚙️ SettingsModal: New settings:', newSettings);
    onSettingsChange(newSettings);
  };

  const updateMaterial = (updates: Partial<StudioSettings['material']>) => {
    updateSettings({ material: { ...settings.material, ...updates } });
  };

  const updateEmptyCells = (updates: Partial<StudioSettings['emptyCells']>) => {
    // Ensure emptyCells exists with defaults
    const current = settings.emptyCells || {
      linkToEnvironment: false,
      customMaterial: {
        color: '#4a4a4a',
        metalness: 0.02,
        roughness: 0.0,
        opacity: 0.48
      }
    };
    updateSettings({ emptyCells: { ...current, ...updates } });
  };

  const updateEmptyCellMaterial = (updates: Partial<StudioSettings['emptyCells']['customMaterial']>) => {
    // Ensure emptyCells exists with defaults
    const current = settings.emptyCells || {
      linkToEnvironment: false,
      customMaterial: {
        color: '#4a4a4a',
        metalness: 0.02,
        roughness: 0.0,
        opacity: 0.48
      }
    };
    updateSettings({ 
      emptyCells: { 
        ...current,
        customMaterial: { ...current.customMaterial, ...updates }
      } 
    });
  };

  const updateLights = (updates: Partial<StudioSettings['lights']>) => {
    console.log('💡 SettingsModal: Updating lights with:', updates);
    const newLights = {
      ...settings.lights,
      ...updates,
      // Deep merge nested objects
      hdr: updates.hdr ? { ...settings.lights.hdr, ...updates.hdr } : settings.lights.hdr,
      shadows: updates.shadows ? { ...settings.lights.shadows, ...updates.shadows } : settings.lights.shadows
    };
    console.log('💡 SettingsModal: New lights:', newLights);
    updateSettings({ lights: newLights });
  };

  const updateCamera = (updates: Partial<StudioSettings['camera']>) => {
    updateSettings({ camera: { ...settings.camera, ...updates } });
  };

  // Load presets when presets tab is opened
  useEffect(() => {
    if (activeTab === 'presets' && presetsMode === 'list') {
      loadPresets();
    }
  }, [activeTab, presetsMode]);

  const loadPresets = async () => {
    setLoadingPresets(true);
    setPresetsError(null);
    try {
      const data = await getUserPresets();
      setPresets(data);
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoadingPresets(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setPresetsError('Please enter a preset name');
      return;
    }

    setLoadingPresets(true);
    setPresetsError(null);
    try {
      await saveStudioPreset({
        name: presetName.trim(),
        description: presetDescription.trim() || undefined,
        settings: settings,
        is_public: isPublic
      });
      
      // Reset form
      setPresetName('');
      setPresetDescription('');
      setIsPublic(false);
      
      // Switch to list mode
      setPresetsMode('list');
      await loadPresets();
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setLoadingPresets(false);
    }
  };

  const handleLoadPreset = (preset: StudioPreset) => {
    console.log('📥 Loading preset:', preset.name);
    console.log('📥 Preset settings:', JSON.stringify(preset.settings, null, 2));
    console.log('📥 Preset brightness:', preset.settings.lights?.brightness);
    
    // Fix: If brightness is 0, use a reasonable default
    const fixedSettings = {
      ...preset.settings,
      lights: {
        ...preset.settings.lights,
        brightness: preset.settings.lights?.brightness || 2.7  // Default brightness if 0 or missing
      }
    };
    
    console.log('📥 Fixed brightness:', fixedSettings.lights.brightness);
    onSettingsChange(fixedSettings);
    console.log('✅ Preset loaded and saved:', preset.name);
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) {
      return;
    }

    setLoadingPresets(true);
    setPresetsError(null);
    try {
      await deleteStudioPreset(id);
      await loadPresets();
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : 'Failed to delete preset');
    } finally {
      setLoadingPresets(false);
    }
  };

  // Drag functionality handled by useDraggable hook

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .settings-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .settings-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(16, 185, 129, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .settings-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #10b981, #059669);
          border-radius: 10px;
          border: 2px solid rgba(209, 250, 229, 0.5);
        }
        .settings-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #059669, #047857);
        }
        .settings-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #047857;
        }
        .settings-modal-scrollable {
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
        className="settings-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)',
          borderRadius: '20px',
          padding: '0',
          width: '90vw',
          maxWidth: '800px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
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
            background: 'linear-gradient(135deg, #10b981, #059669, #047857)',
            padding: '1.25rem 1.5rem',
            borderRadius: '17px 17px 0 0',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
            position: 'relative',
            userSelect: 'none',
            ...draggable.headerStyle
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '20px',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>Settings</h3>
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
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          padding: '12px 16px 0',
          gap: '8px',
          borderBottom: '2px solid rgba(16,185,129,0.2)',
          background: 'rgba(255,255,255,0.3)'
        }}>
          {(['material', 'lighting', 'camera', 'emptyCells', 'presets'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px 8px 0 0',
                background: activeTab === tab ? '#10b981' : 'rgba(255,255,255,0.6)',
                color: activeTab === tab ? '#fff' : '#065f46',
                transition: 'all 0.2s',
                boxShadow: activeTab === tab ? '0 -2px 8px rgba(16,185,129,0.3)' : 'none'
              }}
            >
              {tab === 'emptyCells' ? 'Empty Cells' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1,
          color: '#064e3b'
        }}>
          {activeTab === 'material' && (
            <div>
              <h4>Material Properties</h4>
              
              <div style={fieldStyle}>
                <label>Color:</label>
                <input
                  type="color"
                  value={settings.material.color}
                  onChange={(e) => updateMaterial({ color: e.target.value })}
                  style={colorInputStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>Metalness: {settings.material.metalness.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.material.metalness}
                  onChange={(e) => updateMaterial({ metalness: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>Roughness: {settings.material.roughness.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.material.roughness}
                  onChange={(e) => updateMaterial({ roughness: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>Opacity: {settings.material.opacity.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.material.opacity}
                  onChange={(e) => updateMaterial({ opacity: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>Sphere Color Theme:</label>
                <select
                  value={settings.sphereColorTheme ?? 'default'}
                  onChange={(e) => updateSettings({
                    sphereColorTheme: e.target.value as 'default' | 'whiteMarbleCluster'
                  })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: '#fff'
                  }}
                >
                  <option value="default">Default (Colorful)</option>
                  <option value="whiteMarbleCluster">White Marble Cluster</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'lighting' && (
            <div>
              <h4>Lighting</h4>
              
              <div style={fieldStyle}>
                <label>Global Brightness: {settings.lights.brightness.toFixed(2)}</label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={settings.lights.brightness}
                  onChange={(e) => updateLights({ brightness: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.lights.hdr.enabled}
                    onChange={(e) => updateLights({ 
                      hdr: { ...settings.lights.hdr, enabled: e.target.checked } 
                    })}
                  />
                  HDR Environment
                </label>
                {settings.lights.hdr.enabled && (
                  <>
                    <select
                      value={settings.lights.hdr.envId || ''}
                      onChange={(e) => {
                        console.log('🌅 SettingsModal: HDR environment selected:', e.target.value);
                        updateLights({ 
                          hdr: { ...settings.lights.hdr, envId: e.target.value } 
                        });
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select HDR...</option>
                      {HDRLoader.getInstance().getAvailableEnvironments().map(env => (
                        <option key={env.id} value={env.id}>{env.name}</option>
                      ))}
                    </select>
                    
                    <div style={{ marginTop: '8px' }}>
                      <label>HDR Intensity: {settings.lights.hdr.intensity.toFixed(2)}</label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={settings.lights.hdr.intensity}
                        onChange={(e) => updateLights({ 
                          hdr: { ...settings.lights.hdr, intensity: parseFloat(e.target.value) } 
                        })}
                        style={sliderStyle}
                      />
                    </div>
                  </>
                )}
              </div>

              <div style={fieldStyle}>
                <label>Background Color:</label>
                <input
                  type="color"
                  value={settings.lights.backgroundColor}
                  onChange={(e) => updateLights({ backgroundColor: e.target.value })}
                  style={{ width: '60px', height: '30px', border: 'none', borderRadius: '4px' }}
                />
              </div>

              <div style={fieldStyle}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.lights.shadows.enabled}
                    onChange={(e) => updateLights({ 
                      shadows: { ...settings.lights.shadows, enabled: e.target.checked } 
                    })}
                  />
                  Enable Shadows
                </label>
                {settings.lights.shadows.enabled && (
                  <div style={{ marginTop: '8px' }}>
                    <label>Shadow Intensity: {settings.lights.shadows.intensity.toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={settings.lights.shadows.intensity}
                      onChange={(e) => updateLights({ 
                        shadows: { ...settings.lights.shadows, intensity: parseFloat(e.target.value) } 
                      })}
                      style={sliderStyle}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'camera' && (
            <div>
              <h4>Camera</h4>
              
              <div style={fieldStyle}>
                <label>Focal Length: {settings.camera.fovDeg}mm</label>
                <input
                  type="range"
                  min="14"
                  max="200"
                  step="1"
                  value={settings.camera.fovDeg}
                  onChange={(e) => updateCamera({ fovDeg: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>
            </div>
          )}

          {activeTab === 'emptyCells' && (
            <div>
              <h4>Empty Cell Appearance</h4>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '16px' }}>
                Control the appearance of neighbor cells (green spheres in add mode)
              </p>

              {/* Link to Environment Toggle */}
              <div style={{ ...fieldStyle, marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.emptyCells?.linkToEnvironment || false}
                    onChange={(e) => updateEmptyCells({ linkToEnvironment: e.target.checked })}
                    style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    Link to Environment Material
                  </span>
                </label>
                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '8px', marginLeft: '32px' }}>
                  {settings.emptyCells?.linkToEnvironment 
                    ? 'Empty cells will match your environment material settings'
                    : 'Empty cells use custom material settings below'}
                </p>
              </div>

              {/* Custom Material Controls (only when not linked) */}
              {!settings.emptyCells?.linkToEnvironment && (
                <>
                  <h5 style={{ marginTop: '20px', marginBottom: '12px', fontSize: '0.95rem' }}>Custom Material</h5>

                  <div style={fieldStyle}>
                    <label>Color</label>
                    <input
                      type="color"
                      value={settings.emptyCells?.customMaterial?.color || '#4a4a4a'}
                      onChange={(e) => updateEmptyCellMaterial({ color: e.target.value })}
                      style={{ width: '100%', height: '40px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <label>Metalness: {(settings.emptyCells?.customMaterial?.metalness || 0).toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.emptyCells?.customMaterial?.metalness || 0}
                      onChange={(e) => updateEmptyCellMaterial({ metalness: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <label>Roughness: {(settings.emptyCells?.customMaterial?.roughness || 0).toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.emptyCells?.customMaterial?.roughness || 0}
                      onChange={(e) => updateEmptyCellMaterial({ roughness: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <label>Opacity: {(settings.emptyCells?.customMaterial?.opacity || 0).toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.emptyCells?.customMaterial?.opacity || 0}
                      onChange={(e) => updateEmptyCellMaterial({ opacity: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>

                  {/* Quick Action: Copy from Environment */}
                  <button
                    onClick={() => {
                      updateEmptyCellMaterial({
                        color: settings.material.color,
                        metalness: settings.material.metalness,
                        roughness: settings.material.roughness,
                        opacity: settings.material.opacity
                      });
                    }}
                    style={{
                      marginTop: '16px',
                      padding: '10px 16px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      width: '100%'
                    }}
                  >
                    📋 Copy from Environment Material
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'presets' && (
            <div>
              {presetsError && (
                <div style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  backgroundColor: '#fee',
                  color: '#c33',
                  borderRadius: '4px',
                  border: '1px solid #fcc',
                  fontSize: '0.875rem'
                }}>
                  {presetsError}
                </div>
              )}

              {presetsMode === 'list' ? (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      onClick={() => setPresetsMode('save')}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.95rem',
                        backgroundColor: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      💾 Save Current Settings
                    </button>
                  </div>

                  {loadingPresets ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                      Loading presets...
                    </div>
                  ) : presets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#666', fontSize: '0.875rem' }}>
                      No presets saved yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                      {presets.map(preset => (
                        <div key={preset.id} style={{
                          padding: '0.75rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.875rem'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                              {preset.name}
                              {preset.is_public && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#28a745' }}>
                                  🌐 Public
                                </span>
                              )}
                            </div>
                            {preset.description && (
                              <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                {preset.description}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleLoadPreset(preset)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.8rem',
                                backgroundColor: '#28a745',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              Load
                            </button>
                            <button
                              onClick={() => handleDeletePreset(preset.id)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.8rem',
                                backgroundColor: '#dc3545',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Preset Name *
                    </label>
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g., Metallic Gold"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '0.875rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
                      Description (optional)
                    </label>
                    <textarea
                      value={presetDescription}
                      onChange={(e) => setPresetDescription(e.target.value)}
                      placeholder="Describe this preset..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '0.875rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                    />
                    <label htmlFor="isPublic" style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                      Make public (visible to all users)
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setPresetsMode('list')}
                      disabled={loadingPresets}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.875rem',
                        backgroundColor: '#6c757d',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loadingPresets ? 'not-allowed' : 'pointer',
                        opacity: loadingPresets ? 0.6 : 1
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePreset}
                      disabled={loadingPresets || !presetName.trim()}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        fontSize: '0.875rem',
                        backgroundColor: !presetName.trim() ? '#ccc' : '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loadingPresets || !presetName.trim() ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {loadingPresets ? 'Saving...' : 'Save Preset'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div style={{
          padding: '0 20px 20px',
          borderTop: '2px solid rgba(16,185,129,0.2)',
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button 
            onClick={() => {
              console.log('💾 SettingsModal: Save button clicked - settings should already be auto-saved');
              onClose();
            }}
            style={{
              padding: '14px 32px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(16,185,129,0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            Save & Close
          </button>
        </div>
      </div>
    </>
  );
};

// Inline styles for form elements
const fieldStyle: React.CSSProperties = {
  marginBottom: '16px'
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '4px'
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px',
  marginTop: '4px'
};

const colorInputStyle: React.CSSProperties = {
  width: '40px',
  height: '30px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
