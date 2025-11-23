// Save Movie Modal - Save recorded movie to database and get shareable link
import React, { useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';

interface SaveMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MovieSaveData) => Promise<void>;
  puzzleName: string;
  effectType: string;
  defaultTitle?: string;
}

export interface MovieSaveData {
  title: string;
  description?: string;
  challenge_text: string;
  creator_name: string;
  personal_message: string;
  is_public: boolean;
}

export const SaveMovieModal: React.FC<SaveMovieModalProps> = ({
  isOpen,
  onClose,
  onSave,
  puzzleName,
  effectType,
  defaultTitle
}) => {
  const [title, setTitle] = useState(defaultTitle || `${puzzleName} - ${effectType}`);
  const [description, setDescription] = useState('');
  const [challengeText, setChallengeText] = useState('Can you solve this puzzle? Try to beat my solution!');
  const [creatorName, setCreatorName] = useState('Anonymous');
  const [personalMessage, setPersonalMessage] = useState(`Check out my solution to ${puzzleName}! 🎉`);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const draggable = useDraggable();
  
  // Suggested messages
  const suggestedMessages = [
    `Check out my solution to ${puzzleName}! 🎉`,
    `I just solved ${puzzleName}! Can you beat my time?`,
    `Think you can solve this? Watch how I did it!`,
    `My ${puzzleName} solution - pretty cool huh? 😎`,
    `Challenge accepted! Here's my ${puzzleName} solve.`
  ];

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        title,
        description: description || undefined,
        challenge_text: challengeText,
        creator_name: creatorName,
        personal_message: personalMessage,
        is_public: isPublic
      });
    } catch (error) {
      console.error('Failed to save movie:', error);
      alert('Failed to save movie. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px',
      pointerEvents: 'none'
    }} onClick={onClose}>
      <div
        ref={draggable.ref}
        style={{
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 25px 80px rgba(16,185,129,0.8), 0 0 60px rgba(16,185,129,0.4)',
          border: '3px solid rgba(16,185,129,0.6)',
          pointerEvents: 'auto',
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #10b981, #059669, #047857)',
          padding: '1.25rem 1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
          position: 'relative',
          ...draggable.headerStyle
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
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
            title="Close"
          >
            ×
          </button>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '20px', 
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🎉 Your Movie Is Ready!
          </h2>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '14px',
            margin: 0
          }}>
            Save your movie and share it with others
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Title */}
          <div>
            <label style={{ 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px'
            }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your movie a title"
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px'
            }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description (optional)"
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Challenge Text */}
          <div>
            <label style={{ 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px'
            }}>
              Challenge Text *
            </label>
            <input
              type="text"
              value={challengeText}
              onChange={(e) => setChallengeText(e.target.value)}
              placeholder="Challenge viewers to solve the puzzle"
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Creator Name */}
          <div>
            <label style={{ 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px'
            }}>
              Your Name *
            </label>
            <input
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="How should we credit you?"
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Personal Message */}
          <div>
            <label style={{ 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 500,
              display: 'block',
              marginBottom: '8px'
            }}>
              Personal Message *
            </label>
            <textarea
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              placeholder="Your message when sharing this movie"
              rows={2}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '8px'
              }}
            />
            {/* Suggested Messages */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {suggestedMessages.map((msg, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPersonalMessage(msg)}
                  style={{
                    padding: '6px 12px',
                    background: personalMessage === msg ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (personalMessage !== msg) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (personalMessage !== msg) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Public Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px'
          }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
            />
            <div>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}>
                Share to Gallery
              </div>
              <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>
                Make your movie visible in the public gallery
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => !saving && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
            onMouseLeave={(e) => !saving && (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title || !challengeText || !creatorName || !personalMessage}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: (saving || !title || !challengeText || !creatorName || !personalMessage) 
                ? '#6b7280' 
                : '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: (saving || !title || !challengeText || !creatorName || !personalMessage) 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'background 0.2s ease',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!saving && title && challengeText && creatorName && personalMessage) {
                e.currentTarget.style.background = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!saving && title && challengeText && creatorName && personalMessage) {
                e.currentTarget.style.background = '#3b82f6';
              }
            }}
          >
            {saving ? '💾 Saving...' : '💾 Save & Share'}
          </button>
        </div>
      </div>
    </div>
  );
};
