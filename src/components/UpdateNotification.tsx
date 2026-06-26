// Update notification — driven by the service worker.
// Shows a banner when a new build has been deployed and is ready to activate.

import { useRegisterSW } from 'virtual:pwa-register/react';
import { tokens } from '../styles/tokens';

export const UpdateNotification: React.FC = () => {
  // registerType is 'autoUpdate' (see vite.config): a new build activates on
  // the next load automatically — no manual prompt, and no mid-session forced
  // reload. This component just registers the SW; the banner below stays
  // dormant under autoUpdate.
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: tokens.gradient.success,
      color: '#fff',
      borderRadius: '12px',
      padding: '16px 20px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      zIndex: 100000,
      maxWidth: '400px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      border: '2px solid rgba(255, 255, 255, 0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>🎉</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>
            Update Available!
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            A new version is ready.
          </div>
        </div>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
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
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
        >
          ×
        </button>
      </div>

      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#fff',
          color: '#059669',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      >
        Update Now
      </button>
    </div>
  );
};
