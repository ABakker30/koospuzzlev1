import React, { useState } from 'react';
import { SpecialEffectsDropdown, type SpecialEffect } from './SpecialEffectsDropdown';
import { EffectConfigModal } from './EffectConfigModal';
import { KeyframeAnimationEffect, type KeyframeAnimationConfig } from './effects/KeyframeAnimationEffect';

interface SpecialEffectsManagerProps {
  // Future props for integration with 3D scene
  onAnimationPreview?: (config: KeyframeAnimationConfig) => void;
  onAnimationExport?: (config: KeyframeAnimationConfig) => void;
}

export const SpecialEffectsManager: React.FC<SpecialEffectsManagerProps> = ({
  onAnimationPreview,
  onAnimationExport
}) => {
  const [selectedEffect, setSelectedEffect] = useState<SpecialEffect | null>(null);
  const [keyframeConfig, setKeyframeConfig] = useState<KeyframeAnimationConfig>({
    duration: 5.0,
    fps: 30,
    easing: 'ease-in-out',
    loop: false,
    keyframes: [],
    export: {
      format: 'mp4',
      quality: 'medium',
      resolution: '1080p'
    }
  });

  const handleEffectSelect = (effect: SpecialEffect) => {
    setSelectedEffect(effect);
    console.log(`🎬 Special Effect selected: ${effect.name}`);
  };

  const handleCloseModal = () => {
    setSelectedEffect(null);
  };

  const handleKeyframeConfigChange = (config: KeyframeAnimationConfig) => {
    setKeyframeConfig(config);
    console.log('🎬 Keyframe config updated:', config);
  };

  const handlePreview = () => {
    console.log('🎬 Preview animation:', keyframeConfig);
    if (onAnimationPreview) {
      onAnimationPreview(keyframeConfig);
    }
  };

  const handleExport = () => {
    console.log('🎬 Export animation:', keyframeConfig);
    if (onAnimationExport) {
      onAnimationExport(keyframeConfig);
    }
  };

  const renderEffectContent = () => {
    if (!selectedEffect) return null;

    switch (selectedEffect.id) {
      case 'keyframe-animation':
        return (
          <KeyframeAnimationEffect
            config={keyframeConfig}
            onConfigChange={handleKeyframeConfigChange}
            onPreview={handlePreview}
            onExport={handleExport}
          />
        );
      
      // Future effects can be added here
      // case 'particle-system':
      //   return <ParticleSystemEffect ... />;
      
      default:
        return (
          <div style={placeholderStyle}>
            <h4>{selectedEffect.name}</h4>
            <p>{selectedEffect.description}</p>
            <p style={comingSoonStyle}>Coming soon...</p>
          </div>
        );
    }
  };

  return (
    <>
      {/* Dropdown Button */}
      <SpecialEffectsDropdown onEffectSelect={handleEffectSelect} />

      {/* Effect Configuration Modal */}
      {selectedEffect && (
        <EffectConfigModal
          effect={selectedEffect}
          onClose={handleCloseModal}
        >
          {renderEffectContent()}
        </EffectConfigModal>
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
