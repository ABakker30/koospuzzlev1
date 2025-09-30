import React, { useState, useRef, useEffect } from 'react';
import type { EffectId } from './_shared/types';

export interface SpecialEffect {
  id: EffectId;
  name: string;
  description: string;
  icon?: string;
}

interface SpecialEffectsDropdownProps {
  onEffectSelect: (effect: SpecialEffect) => void;
  disabled?: boolean;
}

const AVAILABLE_EFFECTS: SpecialEffect[] = [
  {
    id: 'keyframe',
    name: 'Keyframe Animation',
    description: 'Create smooth camera movements and transitions',
    icon: '🎬'
  },
  // Future effects can be added here
  // {
  //   id: 'particle-system',
  //   name: 'Particle System',
  //   description: 'Add dynamic particle effects',
  //   icon: '✨'
  // }
];

export const SpecialEffectsDropdown: React.FC<SpecialEffectsDropdownProps> = ({
  onEffectSelect,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEffectClick = (effect: SpecialEffect) => {
    onEffectSelect(effect);
    setIsOpen(false);
  };

  const handleButtonClick = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={dropdownRef} style={containerStyle}>
      <button
        onClick={handleButtonClick}
        disabled={disabled}
        style={{
          ...buttonStyle,
          backgroundColor: isOpen ? '#007bff' : 'white',
          color: isOpen ? 'white' : '#333',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
        title={disabled ? 'Load a shape first to use special effects' : 'Select a special effect'}
      >
        Special Effect
        <span style={arrowStyle}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && !disabled && (
        <div style={dropdownStyle}>
          {AVAILABLE_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              onClick={() => handleEffectClick(effect)}
              style={effectItemStyle}
            >
              <div style={effectHeaderStyle}>
                {effect.icon && <span style={iconStyle}>{effect.icon}</span>}
                <span style={nameStyle}>{effect.name}</span>
              </div>
              <div style={descriptionStyle}>{effect.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block'
};

const buttonStyle: React.CSSProperties = {
  padding: '12px 20px',
  border: '2px solid #ddd',
  borderRadius: '8px',
  backgroundColor: 'white',
  color: '#333',
  fontSize: '16px',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: '140px',
  justifyContent: 'space-between',
  transition: 'all 0.2s ease'
};

const arrowStyle: React.CSSProperties = {
  fontSize: '12px',
  transition: 'transform 0.2s ease'
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  backgroundColor: 'white',
  border: '2px solid #ddd',
  borderTop: 'none',
  borderRadius: '0 0 8px 8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  zIndex: 1000,
  overflow: 'hidden'
};

const effectItemStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  backgroundColor: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  borderBottom: '1px solid #eee'
};

const effectHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '4px'
};

const iconStyle: React.CSSProperties = {
  fontSize: '16px'
};

const nameStyle: React.CSSProperties = {
  fontWeight: 500,
  fontSize: '14px',
  color: '#333'
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  lineHeight: '1.3'
};
