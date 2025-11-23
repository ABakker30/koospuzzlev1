// Simple dropdown menu component for movie pages
import React, { useState, useRef, useEffect } from 'react';

interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean; // Add divider after this item
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ 
  trigger, 
  items, 
  align = 'right' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleItemClick = (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <div onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          [align]: 0,
          marginTop: '8px',
          minWidth: '180px',
          background: 'rgba(26, 26, 26, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          overflow: 'hidden'
        }}>
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <div
                onClick={(e) => handleItemClick(item, e)}
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  color: item.disabled ? '#666' : '#fff',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease',
                  fontSize: '14px',
                  fontWeight: 500,
                  ...(item.disabled ? {} : {
                    ':hover': {
                      background: 'rgba(255, 255, 255, 0.1)'
                    }
                  })
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.icon && (
                  <span style={{ 
                    fontSize: '16px',
                    width: '20px',
                    textAlign: 'center'
                  }}>
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
              </div>
              {item.divider && (
                <div style={{
                  height: '1px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  margin: '4px 0'
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
