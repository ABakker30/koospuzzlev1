import React, { RefObject, CSSProperties } from 'react';

type ManualSolveMovieTypeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  draggableRef: RefObject<HTMLDivElement>;
  draggableStyle: CSSProperties;
  onSelectType: (type: string) => void;
};

export const ManualSolveMovieTypeModal: React.FC<
  ManualSolveMovieTypeModalProps
> = ({ isOpen, onClose, draggableRef, draggableStyle, onSelectType }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 2001,
      }}
    >
      <div
        ref={draggableRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '32px 40px',
          borderRadius: '16px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 12px 40px rgba(102, 126, 234, 0.5)',
          position: 'fixed',
          top: '50%',
          left: '50%',
          ...draggableStyle,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '28px',
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: '1',
            opacity: 0.8,
            fontWeight: 'normal',
          }}
          title="Close"
        >
          ×
        </button>

        <div
          style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}
        >
          🎬
        </div>
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 700,
            marginBottom: '8px',
            textAlign: 'center',
            color: '#ffffff',
          }}
        >
          Make a Movie
        </h2>
        <p
          style={{
            fontSize: '16px',
            fontWeight: 400,
            marginBottom: '24px',
            textAlign: 'center',
            opacity: 0.9,
          }}
        >
          Select your movie type
        </p>

        {/* Movie type buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => onSelectType('turntable')}
            style={{
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              color: 'white',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'translateX(4px)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <span style={{ fontSize: '24px' }}>🔄</span>
            <span>Turntable</span>
          </button>

          <button
            onClick={() => onSelectType('reveal')}
            style={{
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              color: 'white',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'translateX(4px)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <span style={{ fontSize: '24px' }}>✨</span>
            <span>Reveal</span>
          </button>

          <button
            onClick={() => onSelectType('gravity')}
            style={{
              padding: '16px 24px',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              color: 'white',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'translateX(4px)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <span style={{ fontSize: '24px' }}>🌍</span>
            <span>Gravity</span>
          </button>
        </div>
      </div>
    </div>
  );
};
