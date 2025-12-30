import { useState, useEffect, useRef, useCallback } from 'react';

export interface PlacematSettings {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  envMapIntensity: number;
}

const DEFAULT_PLACEMAT_SETTINGS: PlacematSettings = {
  color: '#4A6FA5', // Lighter steel blue
  metalness: 0.3,
  roughness: 0.4,
  opacity: 0.85,
  envMapIntensity: 1.0,
};

const STORAGE_KEY = 'sandbox.placematSettings';

export function loadPlacematSettings(): PlacematSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PLACEMAT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PLACEMAT_SETTINGS;
}

export function savePlacematSettings(settings: PlacematSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface PlacematSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PlacematSettings;
  onSettingsChange: (settings: PlacematSettings) => void;
}

export function PlacematSettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: PlacematSettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<PlacematSettings>(settings);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  const handleChange = (key: keyof PlacematSettings, value: string | number) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
    savePlacematSettings(newSettings);
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_PLACEMAT_SETTINGS);
    onSettingsChange(DEFAULT_PLACEMAT_SETTINGS);
    savePlacematSettings(DEFAULT_PLACEMAT_SETTINGS);
  };

  return (
    <div
      ref={modalRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: 'linear-gradient(135deg, #1e293b, #334155)',
        borderRadius: '16px',
        padding: '24px',
        minWidth: '340px',
        maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
        {/* Header - draggable area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', cursor: 'grab' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.25rem' }}>🎨 Placemat Material</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Color */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '6px' }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={localSettings.color}
              onChange={(e) => handleChange('color', e.target.value)}
              style={{
                width: '48px',
                height: '36px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            />
            <input
              type="text"
              value={localSettings.color}
              onChange={(e) => handleChange('color', e.target.value)}
              style={{
                flex: 1,
                background: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        {/* Metalness */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '6px' }}>
            <span>Metalness</span>
            <span style={{ color: '#fff' }}>{localSettings.metalness.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localSettings.metalness}
            onChange={(e) => handleChange('metalness', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        {/* Roughness (inverse of glossiness) */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '6px' }}>
            <span>Glossiness (1 - roughness)</span>
            <span style={{ color: '#fff' }}>{(1 - localSettings.roughness).toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={1 - localSettings.roughness}
            onChange={(e) => handleChange('roughness', 1 - parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        {/* Opacity */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '6px' }}>
            <span>Opacity</span>
            <span style={{ color: '#fff' }}>{localSettings.opacity.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localSettings.opacity}
            onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        {/* Env Map Intensity (HDR reflection) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '6px' }}>
            <span>HDR Reflection Intensity</span>
            <span style={{ color: '#fff' }}>{localSettings.envMapIntensity.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={localSettings.envMapIntensity}
            onChange={(e) => handleChange('envMapIntensity', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleReset}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#94a3b8',
              padding: '10px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            Done
          </button>
        </div>
    </div>
  );
}
