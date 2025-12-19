import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './SavePuzzleModal.css';

interface SavePuzzleModalProps {
  onSave: (metadata: {
    name: string;
    creatorName: string;
    description?: string;
    challengeMessage?: string;
    visibility: 'public' | 'private';
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
  puzzleStats: {
    sphereCount: number;
    creationTimeMs: number;
  };
  initialData?: {
    name?: string;
    description?: string;
    challengeMessage?: string;
  };
}

const SavePuzzleModal: React.FC<SavePuzzleModalProps> = ({
  onSave,
  onCancel,
  isSaving,
  puzzleStats,
  initialData,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name || '');
  const [creatorName, setCreatorName] = useState('');
  const [description, setDescription] = useState(initialData?.description || '');
  const [challengeMessage, setChallengeMessage] = useState(initialData?.challengeMessage || '');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert(t('save.errors.nameRequired'));
      return;
    }
    
    if (!creatorName.trim()) {
      alert(t('save.errors.creatorRequired'));
      return;
    }
    
    onSave({
      name: name.trim(),
      creatorName: creatorName.trim(),
      description: description.trim() || undefined,
      challengeMessage: challengeMessage.trim() || undefined,
      visibility,
    });
  };
  
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };
  
  return (
    <div 
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
        cursor: 'pointer'
      }}>
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '600px',
          width: '100%',
          border: '2px solid #4CAF50',
          boxShadow: '0 16px 48px rgba(76, 175, 80, 0.3)',
          maxHeight: '90vh',
          overflowY: 'auto',
          cursor: 'default'
        }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '30px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            disabled={isSaving}
            style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '20px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s',
              opacity: isSaving ? 0.5 : 1,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
            }}
            onMouseEnter={(e) => !isSaving && (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={(e) => !isSaving && (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            title={t('button.close')}
          >
            ×
          </button>
          <div style={{ fontSize: '4rem', marginBottom: '10px' }}>💾</div>
          <h2 style={{ 
            margin: 0, 
            fontSize: '2rem', 
            background: 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 700
          }}>{t('save.puzzle.title')}</h2>
        </div>
        
        <div style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '15px 25px',
            borderRadius: '15px',
            textAlign: 'center',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>🧩</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>{puzzleStats.sphereCount}</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>{t('save.puzzle.spheres')}</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            padding: '15px 25px',
            borderRadius: '15px',
            textAlign: 'center',
            boxShadow: '0 4px 15px rgba(240, 147, 251, 0.3)'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>⏱️</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>{formatTime(puzzleStats.creationTimeMs)}</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>{t('save.puzzle.creationTime')}</div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="puzzle-name" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff'
            }}>🎯 {t('save.puzzle.nameLabel')}</label>
            <input
              id="puzzle-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('save.puzzle.namePlaceholder')}
              maxLength={100}
              disabled={isSaving}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '1rem',
                borderRadius: '10px',
                border: '2px solid #333',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4CAF50'}
              onBlur={(e) => e.target.style.borderColor = '#333'}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="creator-name" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff'
            }}>👤 {t('save.puzzle.creatorLabel')}</label>
            <input
              id="creator-name"
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder={t('save.puzzle.creatorPlaceholder')}
              maxLength={50}
              disabled={isSaving}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '1rem',
                borderRadius: '10px',
                border: '2px solid #333',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4CAF50'}
              onBlur={(e) => e.target.style.borderColor = '#333'}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="description" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff'
            }}>📝 {t('save.puzzle.descriptionLabel')}</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('save.puzzle.descriptionPlaceholder')}
              maxLength={500}
              rows={3}
              disabled={isSaving}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '1rem',
                borderRadius: '10px',
                border: '2px solid #333',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4CAF50'}
              onBlur={(e) => e.target.style.borderColor = '#333'}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="challenge" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff'
            }}>🎮 {t('save.puzzle.challengeLabel')}</label>
            <textarea
              id="challenge"
              value={challengeMessage}
              onChange={(e) => setChallengeMessage(e.target.value)}
              placeholder={t('save.puzzle.challengePlaceholder')}
              maxLength={200}
              rows={2}
              disabled={isSaving}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '1rem',
                borderRadius: '10px',
                border: '2px solid #333',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.2s',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4CAF50'}
              onBlur={(e) => e.target.style.borderColor = '#333'}
            />
            <small style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem', display: 'block' }}>
              {t('save.puzzle.challengeHint')}
            </small>
          </div>
          
          <div style={{ marginBottom: '30px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '12px', 
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#fff'
            }}>🌍 {t('save.puzzle.visibility')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px',
                borderRadius: '10px',
                border: `2px solid ${visibility === 'public' ? '#4CAF50' : '#333'}`,
                backgroundColor: visibility === 'public' ? 'rgba(76, 175, 80, 0.1)' : '#2a2a2a',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={(e) => setVisibility(e.target.value as 'public')}
                  disabled={isSaving}
                  style={{ marginRight: '12px', cursor: 'pointer' }}
                />
                <span style={{ color: '#fff', fontSize: '1rem' }}>📢 {t('save.puzzle.public')}</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px',
                borderRadius: '10px',
                border: `2px solid ${visibility === 'private' ? '#4CAF50' : '#333'}`,
                backgroundColor: visibility === 'private' ? 'rgba(76, 175, 80, 0.1)' : '#2a2a2a',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={(e) => setVisibility(e.target.value as 'private')}
                  disabled={isSaving}
                  style={{ marginRight: '12px', cursor: 'pointer' }}
                />
                <span style={{ color: '#fff', fontSize: '1rem' }}>🔒 {t('save.puzzle.private')}</span>
              </label>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', marginTop: '30px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              style={{
                padding: '14px 30px',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '12px',
                border: '2px solid #555',
                background: '#2a2a2a',
                color: '#fff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isSaving ? 0.5 : 1
              }}
              onMouseEnter={(e) => !isSaving && (e.currentTarget.style.borderColor = '#777')}
              onMouseLeave={(e) => !isSaving && (e.currentTarget.style.borderColor = '#555')}
            >
              {t('button.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '14px 30px',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                background: isSaving ? '#666' : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                color: '#fff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: isSaving ? 'none' : '0 4px 15px rgba(76, 175, 80, 0.4)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => !isSaving && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => !isSaving && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <span>{isSaving ? '⏳' : '💾'}</span>
              <span>{isSaving ? t('save.saving') : t('save.puzzle.saveButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavePuzzleModal;
