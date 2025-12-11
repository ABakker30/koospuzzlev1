import React from 'react';

interface ChatDrawerProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <>
      <style>{`
        .chat-drawer-container {
          position: fixed;
          top: 56px; /* Below header */
          bottom: 0; /* To bottom of viewport */
          right: 0;
          width: 320px;
          background: linear-gradient(180deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 100%);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          transform: translateX(${isOpen ? '0' : '100%'});
          transition: transform 0.3s ease;
          z-index: 999;
          display: flex;
          flex-direction: column;
          overflow: visible; /* Allow toggle button to show outside */
        }
        
        .chat-drawer-toggle {
          position: absolute;
          top: 16px;
          left: -44px;
          transform: translateY(0);
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: #fff;
          border: none;
          padding: 12px 8px;
          border-radius: 8px 0 0 8px;
          cursor: pointer;
          font-size: 18px;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          z-index: 1000;
          transition: background 0.2s ease;
          box-shadow: -2px 0 8px rgba(0,0,0,0.3);
        }
        
        .chat-drawer-toggle:hover {
          background: linear-gradient(135deg, #a78bfa, #8b5cf6);
        }
        
        .chat-drawer-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          position: relative;
        }
        
        @media (max-width: 768px) {
          .chat-drawer-container {
            width: 100%;
            max-width: 320px;
          }
        }
      `}</style>
      
      {/* Drawer Panel */}
      <div className="chat-drawer-container">
        {/* Toggle Button - attached to drawer */}
        <button
          className="chat-drawer-toggle"
          onClick={() => onToggle(!isOpen)}
          title={isOpen ? 'Close chat' : 'Open chat'}
        >
          {isOpen ? '💬 Close' : '💬 Chat'}
        </button>
        
        <div className="chat-drawer-content">
          {children}
        </div>
      </div>
    </>
  );
};
