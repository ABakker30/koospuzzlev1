import React, { useEffect } from 'react';

interface NotificationProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onClose: () => void;
  duration?: number;
}

export const Notification: React.FC<NotificationProps> = ({ 
  message, 
  type = 'info', 
  onClose, 
  duration = 3000 
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeStyles = {
    info: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      icon: 'ℹ️'
    },
    warning: {
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      icon: '⚠️'
    },
    error: {
      background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      icon: '❌'
    },
    success: {
      background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      icon: '✅'
    }
  };

  const style = typeStyles[type];

  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: style.background,
      color: 'white',
      padding: '16px 24px',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      zIndex: 10000,
      minWidth: '320px',
      maxWidth: '500px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '15px',
      fontWeight: 500,
      backdropFilter: 'blur(10px)',
      animation: 'slideDown 0.3s ease-out',
      cursor: 'pointer'
    }}
    onClick={onClose}
    >
      <span style={{ fontSize: '24px', flexShrink: 0 }}>{style.icon}</span>
      <div style={{ flex: 1 }}>{message}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
      >
        ×
      </button>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
