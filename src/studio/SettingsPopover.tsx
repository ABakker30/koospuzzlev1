// Settings Popover - Quality/Format/Resolution controls
import { useState, useEffect, useRef } from 'react';

export interface SettingsPopoverProps {
  onClose: () => void;
  activeEffectId: string;
}

type Quality = 'low' | 'medium' | 'high';
type Format = 'square' | 'portrait' | 'landscape';

interface Resolution {
  width: number;
  height: number;
  label: string;
}

const RESOLUTIONS: Record<Format, Resolution[]> = {
  square: [
    { width: 1080, height: 1080, label: '1080×1080' },
    { width: 1440, height: 1440, label: '1440×1440' },
    { width: 2160, height: 2160, label: '2160×2160' }
  ],
  portrait: [
    { width: 1080, height: 1920, label: '1080×1920' },
    { width: 1440, height: 2560, label: '1440×2560' },
    { width: 2160, height: 3840, label: '2160×3840' }
  ],
  landscape: [
    { width: 1920, height: 1080, label: '1920×1080' },
    { width: 2560, height: 1440, label: '2560×1440' },
    { width: 3840, height: 2160, label: '3840×2160' }
  ]
};

export const SettingsPopover: React.FC<SettingsPopoverProps> = ({ onClose, activeEffectId }) => {
  const [quality, setQuality] = useState<Quality>('medium');
  const [format, setFormat] = useState<Format>('landscape');
  const [resolution, setResolution] = useState<Resolution>(RESOLUTIONS.landscape[0]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus first control
  useEffect(() => {
    const firstRadio = popoverRef.current?.querySelector('input[type="radio"]') as HTMLInputElement;
    if (firstRadio) {
      firstRadio.focus();
    }
  }, []);

  const handleQualityChange = (newQuality: Quality) => {
    setQuality(newQuality);
    console.log(`transport:action=change-setting quality=${newQuality} format=${format} res=${resolution.width}x${resolution.height} effect=${activeEffectId}`);
  };

  const handleFormatChange = (newFormat: Format) => {
    setFormat(newFormat);
    // Reset resolution to default for new format
    const defaultResolution = RESOLUTIONS[newFormat][0];
    setResolution(defaultResolution);
    console.log(`transport:action=change-setting quality=${quality} format=${newFormat} res=${defaultResolution.width}x${defaultResolution.height} effect=${activeEffectId}`);
  };

  const handleResolutionChange = (newResolution: Resolution) => {
    setResolution(newResolution);
    console.log(`transport:action=change-setting quality=${quality} format=${format} res=${newResolution.width}x${newResolution.height} effect=${activeEffectId}`);
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Settings"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '0.5rem',
        width: '320px',
        backgroundColor: '#fff',
        border: '1px solid #ddd',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '1rem',
        zIndex: 1000
      }}
    >
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
        Settings
      </h3>

      {/* Quality Section */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>
          Quality
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <label key={q} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="radio"
                name="quality"
                value={q}
                checked={quality === q}
                onChange={() => handleQualityChange(q)}
                style={{ margin: 0 }}
              />
              <span style={{ textTransform: 'capitalize' }}>{q}</span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: '0.5rem 0 0 0' }}>
          Affects fidelity only (pixels), not motion.
        </p>
      </div>

      {/* Format Section */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>
          Format
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {([
            { key: 'square', label: 'Square (1:1)' },
            { key: 'portrait', label: 'Portrait (9:16)' },
            { key: 'landscape', label: 'Landscape (16:9)' }
          ] as { key: Format; label: string }[]).map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="radio"
                name="format"
                value={key}
                checked={format === key}
                onChange={() => handleFormatChange(key)}
                style={{ margin: 0 }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: '0.5rem 0 0 0' }}>
          Sets aspect ratio of the frame.
        </p>
      </div>

      {/* Resolution Section */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.5rem' }}>
          Resolution
        </label>
        <select
          value={`${resolution.width}x${resolution.height}`}
          onChange={(e) => {
            const [width, height] = e.target.value.split('x').map(Number);
            const newResolution = RESOLUTIONS[format].find(r => r.width === width && r.height === height);
            if (newResolution) {
              handleResolutionChange(newResolution);
            }
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.875rem'
          }}
        >
          {RESOLUTIONS[format].map((res) => (
            <option key={`${res.width}x${res.height}`} value={`${res.width}x${res.height}`}>
              {res.label}
            </option>
          ))}
        </select>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: '0.5rem 0 0 0' }}>
          Changes frame size only; pose stays the same.
        </p>
      </div>
    </div>
  );
};
