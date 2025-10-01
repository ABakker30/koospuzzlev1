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
      {activeEffectId && (
        <TransportBar 
          activeEffectId={activeEffectId} 
          isLoaded={isLoaded} 
          activeEffectInstance={activeEffectInstance}
        />
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
