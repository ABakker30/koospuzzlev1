// Effect Selector Modal - Choose movie effect type
import React from 'react';

interface EffectSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEffect: (effectType: 'turntable' | 'reveal' | 'gravity') => void;
  currentEffect?: string;
}

export const EffectSelectorModal: React.FC<EffectSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectEffect,
  currentEffect
}) => {
  if (!isOpen) return null;

  const effects = [
    {
      id: 'turntable' as const,
      name: 'Turntable',
      icon: '🎡',
      description: 'Smooth 360° rotation view',
      gradient: 'linear-gradient(135deg, #f59e0b, #d97706)'
    },
    {
      id: 'reveal' as const,
      name: 'Reveal',
      icon: '✨',
      description: 'Progressive piece-by-piece reveal',
      gradient: 'linear-gradient(135deg, #ec4899, #db2777)'
    },
    {
      id: 'gravity' as const,
      name: 'Gravity',
      icon: '🌍',
      description: 'Physics-based falling animation',
      gradient: 'linear-gradient(135deg, #10b981, #059669)'
    }
  ];

  return (
    <>
      {/* Backdrop - Transparent to keep scene visible */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        zIndex: 10002
      }} onClick={onClose} />
      
      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 50%, #fae8ff 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(147,51,234,0.6)',
          zIndex: 10003
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #9333ea, #7e22ce, #6b21a8)',
          padding: '1.5rem',
          borderTopLeftRadius: '17px',
          borderTopRightRadius: '17px',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(147,51,234,0.4)',
          position: 'relative'
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
          >
            ×
          </button>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '24px', 
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            Choose Movie Effect
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.9)', 
            fontSize: '14px',
            margin: '8px 0 0 0'
          }}>
            Select a new effect for your movie
          </p>
        </div>

        {/* Effect Options */}
        <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {effects.map(effect => (
            <button
              key={effect.id}
              onClick={() => {
                onSelectEffect(effect.id);
                onClose();
              }}
              style={{
                padding: '16px',
                background: currentEffect === effect.id 
                  ? 'rgba(147, 51, 234, 0.15)' 
                  : 'rgba(255, 255, 255, 0.7)',
                border: currentEffect === effect.id
                  ? '3px solid rgba(147, 51, 234, 0.6)'
                  : '2px solid rgba(147, 51, 234, 0.2)',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'all 0.2s',
                boxShadow: currentEffect === effect.id 
                  ? '0 4px 16px rgba(147, 51, 234, 0.3)' 
                  : '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              {/* Icon with gradient background */}
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                background: effect.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                flexShrink: 0
              }}>
                {effect.icon}
              </div>
              
              {/* Text */}
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: 700,
                  color: '#1e293b',
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {effect.name}
                  {currentEffect === effect.id && (
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#9333ea',
                      fontWeight: 600
                    }}>
                      ✓ Current
                    </span>
                  )}
                </div>
                <div style={{ 
                  fontSize: '14px',
                  color: '#64748b'
                }}>
                  {effect.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
