import { useState } from 'react';

interface MovieCardProps {
  movie: {
    id: string;
    title: string;
    creator_name: string;
    challenge_text: string;
    effect_type: string;
    duration_sec: number;
    view_count: number;
    like_count: number;
    puzzle_name?: string;
    pieces_placed?: number;
    created_at: string;
    puzzle_id?: string;
  };
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function MovieCard({ movie, onSelect, onEdit, onDelete }: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);

  // Get display name for creator (fallback to "Anonymous" for missing or placeholder names)
  const getCreatorDisplay = (creator: string): string => {
    if (!creator || creator.trim() === '' || 
        creator.toLowerCase() === 'demo' || 
        creator.toLowerCase() === 'test' ||
        creator.toLowerCase() === 'user' ||
        creator.toLowerCase() === 'anonymous') {
      return 'Anonymous';
    }
    return creator;
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const movieUrl = movie.puzzle_id 
      ? `${window.location.origin}/solve/${movie.puzzle_id}?movie=${movie.id}&shared=true`
      : `${window.location.origin}/movies/${movie.id}?shared=true`;
    
    try {
      // Try Web Share API first (mobile/modern browsers)
      if (navigator.share) {
        // WhatsApp and many messaging apps work best with just text containing the URL
        const shareData = {
          text: `${movie.title}\n${movieUrl}\n`
        };
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(movieUrl);
        setShowShareTooltip(true);
        setTimeout(() => setShowShareTooltip(false), 2000);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const getEffectIcon = () => {
    switch (movie.effect_type) {
      case 'turntable': return '🔄';
      case 'gravity': return '🌍';
      case 'reveal': return '✨';
      default: return '🎬';
    }
  };

  const getEffectColor = () => {
    switch (movie.effect_type) {
      case 'turntable': return '#4a9eff';
      case 'gravity': return '#6bcf7f';
      case 'reveal': return '#ffd93d';
      default: return '#a78bfa';
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const formatViews = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(movie.id)}
      style={{
        position: 'relative',
        background: 'rgba(30, 30, 30, 0.8)',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: isHovered ? '2px solid rgba(255, 255, 255, 0.3)' : '2px solid rgba(255, 255, 255, 0.1)',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? '0 8px 32px rgba(0, 0, 0, 0.4)' 
          : '0 4px 16px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Thumbnail / Preview Area */}
      <div style={{
        width: '100%',
        aspectRatio: '16/9',
        background: `linear-gradient(135deg, ${getEffectColor()} 0%, ${getEffectColor()}88 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Effect Icon */}
        <div style={{
          fontSize: '4rem',
          opacity: 0.8,
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))'
        }}>
          {getEffectIcon()}
        </div>

        {/* Duration Badge */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: 600,
          backdropFilter: 'blur(4px)'
        }}>
          {formatDuration(movie.duration_sec)}
        </div>

        {/* Effect Type Badge */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'capitalize'
        }}>
          {movie.effect_type}
        </div>

        {/* Share Button - Always visible (mobile-friendly) */}
        {!showShareTooltip && (
          <button
            onClick={handleShare}
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
              border: 'none',
              borderRadius: '20px',
              color: '#fff',
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.3s',
              zIndex: 25,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
              transform: 'translateY(0)',
              opacity: isHovered ? 1 : 0.9  // Slightly transparent when not hovered on desktop
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
            }}
            title="Share movie"
          >
            <span style={{ fontSize: '1rem' }}>🔗</span>
            <span>Share</span>
          </button>
        )}

        {/* Share Success Tooltip */}
        {showShareTooltip && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 25,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'fadeIn 0.2s ease'
          }}>
            <span style={{ fontSize: '1rem' }}>✓</span>
            <span>Link copied!</span>
          </div>
        )}

        {/* Play Overlay on Hover */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              paddingLeft: '4px' // Optical centering for play icon
            }}>
              ▶️
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div style={{
        padding: '16px',
        background: 'rgba(20, 20, 20, 0.6)'
      }}>
        {/* Title */}
        <h3 style={{
          color: '#fff',
          fontSize: '1.1rem',
          fontWeight: 600,
          margin: '0 0 8px 0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {movie.title}
        </h3>

        {/* Challenge Text */}
        {movie.challenge_text && (
          <p style={{
            color: '#aaa',
            fontSize: '0.85rem',
            margin: '0 0 12px 0',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            "{movie.challenge_text}"
          </p>
        )}

        {/* Creator & Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.8rem',
          color: '#888',
          marginBottom: '8px'
        }}>
          <span>by {getCreatorDisplay(movie.creator_name)}</span>
          {movie.puzzle_name && (
            <span style={{ 
              color: '#666',
              fontSize: '0.75rem'
            }}>
              {movie.puzzle_name}
            </span>
          )}
        </div>

        {/* Bottom Stats */}
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: '#666'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>👁️</span> {formatViews(movie.view_count)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>❤️</span> {formatViews(movie.like_count)}
          </span>
          {movie.pieces_placed && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🧩</span> {movie.pieces_placed}
            </span>
          )}
        </div>
      </div>

      {/* Dev-only Edit/Delete buttons - Bottom left (always visible on mobile) */}
      {import.meta.env.DEV && (onEdit || onDelete) && (
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          display: 'flex',
          gap: '8px',
          zIndex: 20,
          opacity: isHovered ? 1 : 0.9  // Slightly transparent when not hovered on desktop
        }}>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(movie.id);
              }}
              style={{
                background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              title="Edit movie"
            >
              ✏️ Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete movie "${movie.title}"?`)) {
                  onDelete(movie.id);
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(244, 67, 54, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(244, 67, 54, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              title="Delete movie"
            >
              🗑️ Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
