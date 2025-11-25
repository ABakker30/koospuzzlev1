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
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .save-movie-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        
        .save-movie-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(16, 185, 129, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        
        .save-movie-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #10b981, #059669);
          border-radius: 10px;
          border: 2px solid rgba(209, 250, 229, 0.5);
        }
        
        .save-movie-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #059669, #047857);
        }
        
        .save-movie-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #047857;
        }
        
        /* Firefox */
        .save-movie-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #10b981 rgba(16, 185, 129, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="save-movie-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #6ee7b7 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(16,185,129,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div style={{ 
          background: 'linear-gradient(135deg, #10b981, #059669, #047857)',
          padding: '1.25rem 1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
          position: 'relative',
          userSelect: 'none',
          ...draggable.headerStyle
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onClose();
            }}
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
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
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
            color: 'rgba(255, 255, 255, 0.9)', 
            fontSize: '14px',
            margin: '4px 0 0 0'
          }}>
            Save your movie and share it with others
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px 24px 24px' }}>
          {/* Title */}
          <div>
            <label style={{ 
              color: '#047857', 
              fontSize: '14px', 
              fontWeight: 600,
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
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#1f2937',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ 
              color: '#047857', 
              fontSize: '14px', 
              fontWeight: 600,
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
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#1f2937',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Challenge Text */}
          <div>
            <label style={{ 
              color: '#047857', 
              fontSize: '14px', 
              fontWeight: 600,
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
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#1f2937',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Creator Name */}
          <div>
            <label style={{ 
              color: '#047857', 
              fontSize: '14px', 
              fontWeight: 600,
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
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#1f2937',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Personal Message */}
          <div>
            <label style={{ 
              color: '#047857', 
              fontSize: '14px', 
              fontWeight: 600,
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
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#1f2937',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                marginBottom: '8px',
                boxSizing: 'border-box'
              }}
            />
            {/* Suggested Messages Dropdown */}
            <select
              onChange={(e) => e.target.value && setPersonalMessage(e.target.value)}
              value=""
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.9)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                color: '#047857',
                fontSize: '13px',
                cursor: 'pointer',
                outline: 'none',
                fontWeight: 500,
                boxSizing: 'border-box'
              }}
            >
              <option value="">💡 Choose a suggested message...</option>
              {suggestedMessages.map((msg, idx) => (
                <option key={idx} value={msg}>
                  {msg}
                </option>
              ))}
            </select>
          </div>

          {/* Public Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(255, 255, 255, 0.6)',
            borderRadius: '8px',
            border: '2px solid rgba(16, 185, 129, 0.3)'
          }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#10b981' }}
            />
            <div>
              <div style={{ color: '#047857', fontSize: '14px', fontWeight: 600 }}>
                Share to Gallery
              </div>
              <div style={{ color: '#059669', fontSize: '12px', marginTop: '2px' }}>
                Make your movie visible in the public gallery
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', padding: '0 24px 24px 24px' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: '#fff',
              border: '2px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              color: '#047857',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#f0fdf4')}
            onMouseLeave={(e) => !saving && (e.currentTarget.style.background = '#fff')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title || !challengeText || !creatorName || !personalMessage}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: (saving || !title || !challengeText || !creatorName || !personalMessage) 
                ? '#9ca3af' 
                : '#10b981',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: (saving || !title || !challengeText || !creatorName || !personalMessage) 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: (saving || !title || !challengeText || !creatorName || !personalMessage) 
                ? 'none'
                : '0 4px 12px rgba(16, 185, 129, 0.4)'
            }}
            onMouseEnter={(e) => {
              if (!saving && title && challengeText && creatorName && personalMessage) {
                e.currentTarget.style.background = '#059669';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!saving && title && challengeText && creatorName && personalMessage) {
                e.currentTarget.style.background = '#10b981';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {saving ? '💾 Saving...' : '💾 Save & Share'}
          </button>
        </div>
      </div>
    </>
  );
};
