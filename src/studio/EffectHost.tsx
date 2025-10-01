// Effect Host - manages single active effect and renders placeholder
import { useState } from 'react';
import { getEffect } from '../effects/registry';

export const EffectHost: React.FC = () => {
  const [activeEffectId, setActiveEffectId] = useState<string | null>(null);

  const activeEffect = activeEffectId ? getEffect(activeEffectId) : null;

  return (
    <div className="effect-host">
      {activeEffect ? (
        <div 
          style={{
            padding: '1rem',
            margin: '1rem',
            border: '2px dashed #ccc',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f9f9f9'
          }}
        >
          <h3>Effect Active: {activeEffect.title}</h3>
          <p>{activeEffect.description}</p>
          <p><em>Effect implementation coming soon...</em></p>
          <button 
            onClick={() => setActiveEffectId(null)}
            style={{ marginTop: '0.5rem' }}
          >
            Clear Effect
          </button>
        </div>
      ) : (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
          <em>No effect selected</em>
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
