import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { SpecialEffectsDropdown, type SpecialEffect } from './SpecialEffectsDropdown';
import { EffectConfigModal } from './EffectConfigModal';
import { GlobalControlBar } from './GlobalControlBar';
import { KeyframeConfigModal } from './effects/keyframe/KeyframeConfigModal';
import { KeyframeAnimationEffect } from './effects/keyframe/KeyframeAnimationEffect';
import { specialEffectsManager } from './SpecialEffectsManager';
import type { EffectCtx, EffectState, KeyframeConfig } from './_shared/types';

interface SpecialEffectsIntegrationProps {
  ctx: EffectCtx | null;
  disabled?: boolean;
}

export const SpecialEffectsIntegration: React.FC<SpecialEffectsIntegrationProps> = ({
  ctx,
  disabled = false
}) => {
  const [selectedEffect, setSelectedEffect] = useState<SpecialEffect | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [state, setState] = useState<EffectState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [canPlay, setCanPlay] = useState(false);

  // Effect instances
  const [keyframeEffect] = useState(() => new KeyframeAnimationEffect());

  // Set up manager callbacks
  useEffect(() => {
    specialEffectsManager.onStateChanged((newState) => {
      setState(newState);
    });

    specialEffectsManager.onTimeChanged((time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });

    // Set context when available
    if (ctx) {
      specialEffectsManager.setContext(ctx);
    }

    // Try to restore last active effect
    const lastEffectId = specialEffectsManager.loadActiveEffectId();
    if (lastEffectId === 'keyframe') {
      const savedConfig = specialEffectsManager.loadEffectConfig('keyframe') as KeyframeConfig;
      if (savedConfig) {
        keyframeEffect.setConfig(savedConfig);
        specialEffectsManager.selectEffect(keyframeEffect);
        updatePlayability();
      }
    }

    return () => {
      specialEffectsManager.dispose();
    };
  }, [ctx, keyframeEffect]);

  // Update playability when active effect changes
  const updatePlayability = () => {
    const activeEffect = specialEffectsManager.getActiveEffect();
    setCanPlay(activeEffect ? activeEffect.canPlay() : false);
    setDuration(activeEffect?.getDurationSec());
  };

  const handleEffectSelect = (effect: SpecialEffect) => {
    console.log(`🎬 Effect selected: ${effect.name}`);
    
    let effectInstance;
    switch (effect.id) {
      case 'keyframe':
        effectInstance = keyframeEffect;
        break;
      default:
        console.warn(`Unknown effect: ${effect.id}`);
        return;
    }

    specialEffectsManager.selectEffect(effectInstance);
    specialEffectsManager.saveActiveEffectId();
    
    setSelectedEffect(effect);
    setShowModal(true);
    updatePlayability();
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEffect(null);
  };

  const handleKeyframeConfigChange = (config: Partial<KeyframeConfig>) => {
    keyframeEffect.setConfig(config);
    specialEffectsManager.saveEffectConfig('keyframe', keyframeEffect.getConfig());
    updatePlayability();
  };

  const handleCaptureKeyframe = () => {
    if (!ctx?.camera || !ctx?.controls) {
      console.warn('🎬 No camera or controls available for capture');
      return;
    }

    keyframeEffect.captureFromCurrentCamera(
      ctx.camera as THREE.PerspectiveCamera,
      ctx.controls
    );
    
    // Save config and update UI
    const updatedConfig = keyframeEffect.getConfig();
    specialEffectsManager.saveEffectConfig('keyframe', updatedConfig);
    updatePlayability();
    
    // Force UI update by triggering config change
    handleKeyframeConfigChange({ keys: keyframeEffect.getKeys() });
  };

  const handleSnapToKeyframe = (index: number) => {
    if (!ctx?.camera || !ctx?.controls) {
      console.warn('🎬 No camera or controls available for snap');
      return;
    }

    keyframeEffect.snapToKey(
      index,
      ctx.camera as THREE.PerspectiveCamera,
      ctx.controls
    );
  };

  const renderEffectModal = () => {
    if (!selectedEffect || !showModal) return null;

    let modalContent;
    switch (selectedEffect.id) {
      case 'keyframe':
        modalContent = (
          <KeyframeConfigModal
            effect={keyframeEffect}
            onConfigChange={handleKeyframeConfigChange}
            onCapture={handleCaptureKeyframe}
            onSnapToKey={handleSnapToKeyframe}
          />
        );
        break;
      default:
        modalContent = (
          <div style={placeholderStyle}>
            <h4>{selectedEffect.name}</h4>
            <p>{selectedEffect.description}</p>
            <p style={comingSoonStyle}>Coming soon...</p>
          </div>
        );
    }

    return (
      <EffectConfigModal
        effect={selectedEffect}
        onClose={handleCloseModal}
      >
        {modalContent}
      </EffectConfigModal>
    );
  };

  return (
    <>
      {/* Dropdown Button */}
      <SpecialEffectsDropdown 
        onEffectSelect={handleEffectSelect}
        disabled={disabled}
      />

      {/* Effect Configuration Modal */}
      {renderEffectModal()}

      {/* Global Control Bar */}
      {specialEffectsManager.getActiveEffect() && (
        <GlobalControlBar
          manager={specialEffectsManager}
          state={state}
          currentTime={currentTime}
          duration={duration}
          canPlay={canPlay}
        />
      )}
    </>
  );
};

// Styles
const placeholderStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: '#666'
};

const comingSoonStyle: React.CSSProperties = {
  fontStyle: 'italic',
  color: '#999',
  marginTop: '16px'
};
