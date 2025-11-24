// Reusable Info Modal Component
// Displays page-specific help and information

import React, { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { AIHelpModal } from './AIHelpModal';

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
  
  // Check if Supabase is configured (only show AI Help button if available)
  const hasSupabase = !!import.meta.env.VITE_SUPABASE_URL;
  
  if (!isOpen) return null;

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .info-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .info-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .info-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          border-radius: 10px;
          border: 2px solid rgba(219, 234, 254, 0.5);
        }
        .info-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
        }
        .info-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #1d4ed8;
        }
        .info-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #3b82f6 rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="info-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 25px 80px rgba(59,130,246,0.8), 0 0 60px rgba(59,130,246,0.4)',
          border: '3px solid rgba(59,130,246,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
            padding: '1.25rem 1.5rem',
            borderRadius: '17px 17px 0 0',
            marginBottom: '20px',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
            position: 'relative',
            userSelect: 'none',
            ...draggable.headerStyle
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '20px', 
            color: '#fff', 
            fontWeight: 700,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '0 24px 24px',
            color: '#1e40af'
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0 24px 24px',
            display: 'flex',
            justifyContent: hasSupabase ? 'space-between' : 'flex-end',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {hasSupabase && (
            <button 
              onClick={() => setShowAI(true)}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(139,92,246,0.4)',
                fontSize: '14px'
              }}
              aria-label="Open AI chat"
            >
              <span>🤖</span> AI Help
            </button>
          )}
          <button 
            onClick={onClose}
            style={{
              flex: hasSupabase ? 1 : 0,
              padding: '12px 20px',
              background: '#fff',
              border: '2px solid rgba(59,130,246,0.3)',
              borderRadius: '10px',
              color: '#1e40af',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* AI Help Modal */}
      <AIHelpModal 
        isOpen={showAI}
        onClose={() => setShowAI(false)}
      />
    </>
  );
};
