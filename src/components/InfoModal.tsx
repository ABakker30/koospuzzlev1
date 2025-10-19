// Reusable Info Modal Component
// Displays page-specific help and information

import React, { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { AIChatModal } from './AIChatModal';

export interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  aiContext?: {
    screen?: string;
    topic?: string;
  };
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, children, aiContext }) => {
  const draggable = useDraggable();
  const [showAI, setShowAI] = useState(false);
  
  if (!isOpen) return null;

  return (
    <>
      {/* Modal - No backdrop */}
      <div
        ref={draggable.ref}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          ...draggable.style,
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: '1px solid #d1d5db',
          zIndex: 9999,
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          color: '#1f2937',
        }}
      >
        {/* Header - Draggable */}
        <div
          style={{
            ...draggable.headerStyle,
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f9fafb',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            userSelect: 'none',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            backgroundColor: '#ffffff',
            color: '#1f2937',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          <button 
            className="btn"
            onClick={() => setShowAI(true)}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            aria-label="Open AI chat"
          >
            <span>🤖</span> AI Help
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* AI Chat Modal */}
      {showAI && (
        <AIChatModal 
          onClose={() => setShowAI(false)}
          screen={aiContext?.screen}
          topic={aiContext?.topic}
        />
      )}
    </>
  );
};
