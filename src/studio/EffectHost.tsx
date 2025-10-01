// Effect Host - manages single active effect and renders placeholder + transport bar
import { useState } from 'react';
import { getEffect } from '../effects/registry';
import { TransportBar } from './TransportBar';
import { TurnTableModal } from '../effects/turntable/TurnTableModal';
import type { TurnTableConfig } from '../effects/turntable/presets';

export interface EffectHostProps {
  isLoaded: boolean;
  effectContext?: any; // EffectContext - will be typed properly in later PRs
  activeEffectId?: string | null;
  activeEffectInstance?: any;
  onClearEffect?: () => void;
}

export const EffectHost: React.FC<EffectHostProps> = ({ 
  isLoaded, 
  activeEffectId: parentActiveEffectId, 
  activeEffectInstance: parentActiveEffectInstance,
  onClearEffect 
}) => {
  // Use parent state if provided, otherwise fall back to local state (for backward compatibility)
  const activeEffectId = parentActiveEffectId !== undefined ? parentActiveEffectId : null;
  const activeEffectInstance = parentActiveEffectInstance !== undefined ? parentActiveEffectInstance : null;
  
  const [showTurnTableModal, setShowTurnTableModal] = useState(false);
  const [turnTableConfig, setTurnTableConfig] = useState<TurnTableConfig | null>(null);

  const activeEffect = activeEffectId ? getEffect(activeEffectId) : null;

  const handleTurnTableSave = (config: TurnTableConfig) => {
    setTurnTableConfig(config);
    console.log('🎬 EffectHost: Turn Table config saved:', config);
    // In real implementation, this would pass to the effect instance
  };

  const handleConfigureEffect = () => {
    if (activeEffectId === 'turntable') {
      setShowTurnTableModal(true);
    }
  };

  return (
    <div className="effect-host">
      {/* Transport Bar - shows only when effect is active and shape is loaded */}
      <TransportBar 
        activeEffectId={activeEffectId} 
        isLoaded={isLoaded} 
        activeEffectInstance={activeEffectInstance}
      />
      
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
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button 
              onClick={handleConfigureEffect}
              style={{ 
                padding: '0.25rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #007bff',
                borderRadius: '4px',
                backgroundColor: '#007bff',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              Configure
            </button>
            <button 
              onClick={onClearEffect || (() => console.log('No clear handler provided'))}
              style={{ 
                padding: '0.25rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
          
          {/* Show current config if available */}
          {turnTableConfig && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
              <p>Config: {turnTableConfig.durationSec}s, {turnTableConfig.degrees}°, {turnTableConfig.direction}, {turnTableConfig.mode}</p>
            </div>
          )}
          
          {/* Temporary test info for Issue 4 */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
            <p>Test: Configure → validate fields → save presets → keyboard shortcuts</p>
          </div>
        </div>
      ) : (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
          <em>No effect selected</em>
          {/* Temporary test button for Issue 2 */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
            <p>Use Effects dropdown to select Turn Table</p>
          </div>
        </div>
      )}
      
      {/* Turn Table Modal */}
      <TurnTableModal
        isOpen={showTurnTableModal}
        onClose={() => setShowTurnTableModal(false)}
        onSave={handleTurnTableSave}
        initialConfig={turnTableConfig || undefined}
      />
    </div>
  );
};

// Export setter for external use (temporary - will be replaced by proper selection flow)
export function setActiveEffect(effectId: string | null) {
  // This is a temporary hack for testing - will be replaced in PR 6
  console.log('🎬 Setting active effect:', effectId);
  // In a real implementation, this would use context or state management
}
