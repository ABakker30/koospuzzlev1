// Effect Host - manages single active effect and renders placeholder + transport bar
import { useState } from 'react';
import { getEffect } from '../effects/registry';
import { TransportBar } from './TransportBar';

export interface EffectHostProps {
  isLoaded: boolean;
}

export const EffectHost: React.FC<EffectHostProps> = ({ isLoaded }) => {
  const [activeEffectId, setActiveEffectId] = useState<string | null>(null);

  const activeEffect = activeEffectId ? getEffect(activeEffectId) : null;

  return (
    <div className="effect-host">
      {/* Transport Bar - shows only when effect is active and shape is loaded */}
      <TransportBar activeEffectId={activeEffectId} isLoaded={isLoaded} />
      
      {/* Effect Status/Placeholder */}
      {activeEffect ? (
        <div 
          style={{
            padding: '1rem',
            margin: '1rem 0',
            border: '2px dashed #ccc',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f9f9f9',
            maxWidth: '300px'
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
            Effect Active: {activeEffect.title}
          </h3>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#666' }}>
            {activeEffect.description}
          </p>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontStyle: 'italic' }}>
            Effect implementation coming soon...
          </p>
          <button 
            onClick={() => setActiveEffectId(null)}
            style={{ 
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer'
            }}
          >
            Clear Effect
          </button>
          
          {/* Temporary test buttons for Issue 2 */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
            <p>Test: Use keyboard shortcuts P (play/pause), S (stop), R (record)</p>
          </div>
        </div>
      ) : (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
          <em>No effect selected</em>
          {/* Temporary test button for Issue 2 */}
          <div style={{ marginTop: '0.5rem' }}>
            <button 
              onClick={() => setActiveEffectId('turntable')}
              style={{ 
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                opacity: 0.7
              }}
              disabled={!isLoaded}
            >
              Test: Activate Turntable
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Export setter for external use (temporary - will be replaced by proper selection flow)
export function setActiveEffect(effectId: string | null) {
  // This is a temporary hack for testing - will be replaced in PR 6
  console.log('🎬 Setting active effect:', effectId);
  // In a real implementation, this would use context or state management
}
