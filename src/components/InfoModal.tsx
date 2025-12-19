// Reusable Info Modal Component
// Displays page-specific help and information

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '../hooks/useDraggable';

export interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, title, children }) => {
  const { t } = useTranslation();
  const draggable = useDraggable();
  
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
        background: 'transparent',
        backdropFilter: 'none',
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
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
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
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px',
              lineHeight: 1,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
            }}
          >✕</button>
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
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <button 
            onClick={onClose}
            style={{
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
            {t('button.close')}
          </button>
        </div>
      </div>
    </>
  );
};
