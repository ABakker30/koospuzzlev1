// Update notification component - shows when new version is available
import { useState, useEffect } from 'react';
import { isNewVersionAvailable, reloadWithCacheClear, getCurrentVersion } from '../services/versionCheck';

export const UpdateNotification: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Check on mount
    if (isNewVersionAvailable()) {
      setShowUpdate(true);
    }
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);
    reloadWithCacheClear();
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'linear-gradient(135deg, #10b981, #059669)',
      color: '#fff',
      borderRadius: '12px',
      padding: '16px 20px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      zIndex: 100000,
      maxWidth: '400px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      border: '2px solid rgba(255, 255, 255, 0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>🎉</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>
            Update Available!
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            v{getCurrentVersion()} is ready
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        >
          ×
        </button>
      </div>

      <button
        onClick={handleUpdate}
        disabled={isUpdating}
        style={{
          background: '#fff',
          color: '#059669',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: isUpdating ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          opacity: isUpdating ? 0.7 : 1
        }}
        onMouseEnter={(e) => !isUpdating && (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={(e) => !isUpdating && (e.currentTarget.style.transform = 'translateY(0)')}
      >
        {isUpdating ? 'Updating...' : 'Update Now'}
      </button>

      <div style={{ 
        fontSize: '12px', 
        opacity: 0.8, 
        textAlign: 'center',
        marginTop: '4px'
      }}>
        New features and improvements await!
      </div>
    </div>
  );
};
