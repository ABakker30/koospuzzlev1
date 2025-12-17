import React from 'react';
import { ENVIRONMENT_PRESETS, PRESET_LABELS, PRESET_ORDER } from '../constants/environmentPresets';
import type { StudioSettings } from '../types/studio';

interface PresetSelectorModalProps {
  isOpen: boolean;
  currentPreset?: string;
  onClose: () => void;
  onSelectPreset: (preset: StudioSettings, presetKey: string) => void;
}

export const PresetSelectorModal: React.FC<PresetSelectorModalProps> = ({
  isOpen,
  currentPreset,
  onClose,
  onSelectPreset
}) => {
  if (!isOpen) return null;

  const handleSelectPreset = (presetKey: string) => {
    const settings = ENVIRONMENT_PRESETS[presetKey];
    onSelectPreset(settings, presetKey);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Choose Environment
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              ✕
            </button>
          </div>

          {/* Preset Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem'
          }}>
            {PRESET_ORDER.map((presetKey) => {
              const isSelected = currentPreset === presetKey;
              const label = PRESET_LABELS[presetKey];
              const [style, mode] = label.split(' ');
              const isDark = mode === 'Dark';
              
              return (
                <button
                  key={presetKey}
                  onClick={() => handleSelectPreset(presetKey)}
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                      : isDark
                      ? 'linear-gradient(135deg, #1e293b, #0f172a)'
                      : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                    border: isSelected
                      ? '2px solid #60a5fa'
                      : '2px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '1.5rem 1rem',
                    color: isDark || isSelected ? '#fff' : '#1e293b',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: 600,
                    boxShadow: isSelected
                      ? '0 8px 16px rgba(59, 130, 246, 0.3)'
                      : '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isSelected
                      ? '0 8px 16px rgba(59, 130, 246, 0.3)'
                      : '0 2px 8px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  <div style={{ fontSize: '1.75rem' }}>
                    {style === 'Metallic' && '⚙️'}
                    {style === 'Shiny' && '✨'}
                    {style === 'Matte' && '🎨'}
                  </div>
                  <div>{style}</div>
                  <div style={{
                    fontSize: '0.85rem',
                    opacity: 0.8,
                    fontWeight: 400
                  }}>
                    {mode}
                  </div>
                  {isSelected && (
                    <div style={{
                      fontSize: '0.75rem',
                      marginTop: '0.25rem',
                      color: '#93c5fd'
                    }}>
                      ✓ Active
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Info Text */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#cbd5e1',
            lineHeight: '1.5'
          }}>
            <strong style={{ color: '#60a5fa' }}>Tip:</strong> Choose a preset to instantly set the perfect lighting and material style for your creation.
          </div>
        </div>
      </div>
    </>
  );
};
