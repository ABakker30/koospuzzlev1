import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!isOpen) return null;

  const handleSelectPreset = (presetKey: string) => {
    const settings = ENVIRONMENT_PRESETS[presetKey];
    onSelectPreset(settings, presetKey);
    onClose();
  };

  return (
    <>
      <style>{`
        .preset-modal {
          width: min(360px, 86vw);
          height: auto;
          max-height: calc(100vh - 160px);
          overflow: hidden;
          padding: 12px;
        }
        .preset-modal-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .preset-modal-tile {
          height: 92px;
          padding: 10px 8px;
          font-size: 0.9rem;
          position: relative;
          overflow: hidden;
          line-height: 1.1;
        }
        .preset-modal-icon {
          font-size: 1.25rem;
          line-height: 1;
        }
        .preset-modal-sub {
          font-size: 0.78rem;
          line-height: 1.05;
        }
        .preset-modal-check {
          position: absolute;
          top: 8px;
          right: 10px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #93c5fd;
          text-shadow: 0 1px 6px rgba(0,0,0,0.45);
          pointer-events: none;
        }
        .preset-modal-tip {
          display: none;
        }
        @media (max-width: 520px) {
          .preset-modal {
            padding: 12px;
            border-radius: 14px;
          }
          .preset-modal-grid {
            grid-template-columns: 1fr;
          }
          .preset-modal-tile {
            height: 80px;
            padding: 10px 10px;
          }
        }
        @media (min-height: 820px) {
          .preset-modal-tip {
            display: block;
          }
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
          background: 'rgba(0, 0, 0, 0.55)',
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
          className="preset-modal"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(236,233,255,0.90) 45%, rgba(219,234,254,0.88) 100%)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.35)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            paddingBottom: '0.6rem',
            borderBottom: '1px solid rgba(15, 23, 42, 0.12)'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '1.1rem',
              fontWeight: 600,
              color: '#0f172a',
              background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {t('environment.title')}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#334155',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#334155'}
            >
              ✕
            </button>
          </div>

          {/* Preset Grid */}
          <div className="preset-modal-grid">
            {PRESET_ORDER.map((presetKey) => {
              const isSelected = currentPreset === presetKey;
              const label = PRESET_LABELS[presetKey];
              const [style, mode] = label.split(' ');
              const isDark = mode === 'Dark';
              
              return (
                <button
                  key={presetKey}
                  onClick={() => handleSelectPreset(presetKey)}
                  className="preset-modal-tile"
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
                    color: isDark || isSelected ? '#fff' : '#1e293b',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
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
                  {isSelected && <div className="preset-modal-check">✓</div>}
                  <div className="preset-modal-icon">
                    {style === 'Metallic' && '⚙️'}
                    {style === 'Shiny' && '✨'}
                    {style === 'Matte' && '🎨'}
                  </div>
                  <div>{style}</div>
                  <div className="preset-modal-sub" style={{
                    opacity: 0.8,
                    fontWeight: 400
                  }}>
                    {mode}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info Text */}
          <div className="preset-modal-tip" style={{
            marginTop: '0.75rem',
            padding: '0.6rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            fontSize: '0.78rem',
            color: '#cbd5e1',
            lineHeight: '1.45'
          }}>
            <strong style={{ color: '#60a5fa' }}>Tip:</strong> {t('environment.tip')}
          </div>
        </div>
      </div>
    </>
  );
};
