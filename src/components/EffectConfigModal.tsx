import React, { useState, useRef, useEffect } from 'react';
import type { SpecialEffect } from './SpecialEffectsDropdown';

interface EffectConfigModalProps {
  effect: SpecialEffect;
  onClose: () => void;
  children: React.ReactNode;
}

export const EffectConfigModal: React.FC<EffectConfigModalProps> = ({
  effect,
  onClose,
  children
}) => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

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
        }}
      >
        {/* Header with drag handle */}
        <div 
          style={{
            ...headerStyle,
            cursor: 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
          <div style={titleContainerStyle}>
            {effect.icon && <span style={iconStyle}>{effect.icon}</span>}
            <h3 style={{ margin: 0, userSelect: 'none' }}>{effect.name}</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {children}
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
  pointerEvents: 'none' // Allow interaction with scene behind modal
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '12px',
  width: '90vw',
  maxWidth: '600px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
  border: '1px solid #ddd',
  pointerEvents: 'auto' // Re-enable pointer events for the modal itself
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #eee',
  borderRadius: '12px 12px 0 0',
  backgroundColor: '#f8f9fa'
};

const titleContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const iconStyle: React.CSSProperties = {
  fontSize: '20px'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px',
  color: '#666',
  transition: 'background-color 0.2s ease'
};

const contentStyle: React.CSSProperties = {
  padding: '20px',
  overflowY: 'auto',
  flex: 1
};
