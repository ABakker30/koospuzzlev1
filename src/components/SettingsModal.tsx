import React, { useState, useEffect, useRef } from 'react';
import type { StudioSettings, EffectId } from '../types/studio';
import { HDRLoader } from '../services/HDRLoader';

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
  const [activeTab, setActiveTab] = useState<'material' | 'lighting' | 'camera' | 'effect'>('material');
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const updateSettings = (updates: Partial<StudioSettings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const updateMaterial = (updates: Partial<StudioSettings['material']>) => {
    updateSettings({ material: { ...settings.material, ...updates } });
  };

  const updateLights = (updates: Partial<StudioSettings['lights']>) => {
    updateSettings({ lights: { ...settings.lights, ...updates } });
  };

  const updateCamera = (updates: Partial<StudioSettings['camera']>) => {
    updateSettings({ camera: { ...settings.camera, ...updates } });
  };

  const updateEffect = (updates: Partial<StudioSettings['effect']>) => {
    updateSettings({ effect: { ...settings.effect, ...updates } });
  };

  // Drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  return (
    <div style={backdropStyle}>
      <div 
        ref={modalRef}
        style={{
          ...modalStyle,
          position: 'fixed',
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'grabbing' : 'default',
          pointerEvents: 'auto' // Re-enable pointer events on modal
        }}
      >
        {/* Header */}
        <div 
          style={{
            ...headerStyle,
            cursor: 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
          <h3 style={{ margin: 0, userSelect: 'none' }}>Settings</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Tabs */}
        <div style={tabsStyle}>
          {(['material', 'lighting', 'camera', 'effect'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...tabButtonStyle,
                backgroundColor: activeTab === tab ? '#007bff' : '#f8f9fa',
                color: activeTab === tab ? 'white' : '#333'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={contentStyle}>
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
                  max="3"
                  step="0.1"
                  value={settings.lights.brightness}
                  onChange={(e) => updateLights({ brightness: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label>Directional Lights:</label>
                {settings.lights.directional.map((intensity, i) => (
                  <div key={i} style={{ marginTop: '8px' }}>
                    <label>Light {i + 1}: {intensity.toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={intensity}
                      onChange={(e) => {
                        const newDirectional = [...settings.lights.directional];
                        newDirectional[i] = parseFloat(e.target.value);
                        updateLights({ directional: newDirectional });
                      }}
                      style={sliderStyle}
                    />
                  </div>
                ))}
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
                      onChange={(e) => updateLights({ 
                        hdr: { ...settings.lights.hdr, envId: e.target.value } 
                      })}
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
                <label>
                  <input
                    type="checkbox"
                    checked={settings.camera.projection === 'orthographic'}
                    onChange={(e) => updateCamera({ 
                      projection: e.target.checked ? 'orthographic' : 'perspective' 
                    })}
                  />
                  Orthographic Projection
                </label>
              </div>

              {settings.camera.projection === 'perspective' ? (
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
              ) : (
                <div style={fieldStyle}>
                  <label>Zoom: {settings.camera.orthoZoom.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={settings.camera.orthoZoom}
                    onChange={(e) => updateCamera({ orthoZoom: parseFloat(e.target.value) })}
                    style={sliderStyle}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'effect' && (
            <div>
              <h4>Special Effects</h4>
              
              <div style={fieldStyle}>
                <label>Effect:</label>
                <select
                  value={settings.effect.id}
                  onChange={(e) => {
                    const effectId = e.target.value as EffectId;
                    let newEffect: any = { 
                      ...settings.effect, 
                      id: effectId 
                    };
                    
                    // Set default params for each effect
                    switch (effectId) {
                      case 'orbitSweep':
                        newEffect = { ...newEffect, arcDeg: 90, ease: 0.5 };
                        break;
                      case 'explode':
                        newEffect = { ...newEffect, magnitude: 2, ease: 0.5, holdSec: 1 };
                        break;
                      case 'ripple':
                        newEffect = { ...newEffect, amplitude: 0.5, wavelength: 2, speed: 1 };
                        break;
                      case 'sparkle':
                        newEffect = { ...newEffect, frequency: 2, amplitude: 0.3 };
                        break;
                    }
                    
                    updateEffect(newEffect);
                  }}
                  style={selectStyle}
                >
                  <option value="none">None</option>
                  <option value="orbitSweep">Orbit Sweep</option>
                  <option value="explode">Explode/Assemble</option>
                  <option value="ripple">Ripple</option>
                  <option value="sparkle">Sparkle</option>
                </select>
              </div>

              <div style={fieldStyle}>
                <label>Duration: {settings.effect.durationSec}s</label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={settings.effect.durationSec}
                  onChange={(e) => updateEffect({ durationSec: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              {/* Effect-specific parameters */}
              {settings.effect.id === 'orbitSweep' && 'arcDeg' in settings.effect && (
                <>
                  <div style={fieldStyle}>
                    <label>Arc Degrees: {settings.effect.arcDeg}°</label>
                    <input
                      type="range"
                      min="30"
                      max="360"
                      step="10"
                      value={settings.effect.arcDeg}
                      onChange={(e) => updateEffect({ arcDeg: parseInt(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label>Ease: {settings.effect.ease.toFixed(2)}</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.effect.ease}
                      onChange={(e) => updateEffect({ ease: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>
                </>
              )}

              {settings.effect.id === 'explode' && 'magnitude' in settings.effect && (
                <>
                  <div style={fieldStyle}>
                    <label>Magnitude: {settings.effect.magnitude.toFixed(1)}</label>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.1"
                      value={settings.effect.magnitude}
                      onChange={(e) => updateEffect({ magnitude: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label>Hold Time: {settings.effect.holdSec}s</label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.1"
                      value={settings.effect.holdSec}
                      onChange={(e) => updateEffect({ holdSec: parseFloat(e.target.value) })}
                      style={sliderStyle}
                    />
                  </div>
                </>
              )}

              <div style={fieldStyle}>
                <h5>Export Settings</h5>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <label>
                    Aspect:
                    <select
                      value={settings.effect.export.aspect}
                      onChange={(e) => updateEffect({ 
                        export: { ...settings.effect.export, aspect: e.target.value as any }
                      })}
                      style={selectStyle}
                    >
                      <option value="square">Square (1:1)</option>
                      <option value="portrait">Portrait (9:16)</option>
                      <option value="landscape">Landscape (16:9)</option>
                    </select>
                  </label>
                  
                  <label>
                    Resolution:
                    <select
                      value={settings.effect.export.resolution}
                      onChange={(e) => updateEffect({ 
                        export: { ...settings.effect.export, resolution: e.target.value as any }
                      })}
                      style={selectStyle}
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="4k">4K</option>
                    </select>
                  </label>
                  
                  <label>
                    Quality:
                    <select
                      value={settings.effect.export.quality}
                      onChange={(e) => updateEffect({ 
                        export: { ...settings.effect.export, quality: e.target.value as any }
                      })}
                      style={selectStyle}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'transparent', // No darkening overlay - let user see true scene colors
  zIndex: 1000,
  pointerEvents: 'none' // Allow dragging through backdrop
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '8px',
  width: '90vw',
  maxWidth: '500px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px',
  borderBottom: '1px solid #eee'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  padding: '4px 8px'
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #eee'
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};

const contentStyle: React.CSSProperties = {
  padding: '16px',
  overflowY: 'auto',
  flex: 1
};

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
  width: '60px',
  height: '30px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer'
};
