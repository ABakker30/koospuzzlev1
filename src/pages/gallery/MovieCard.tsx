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
    thumbnail_url?: string;
  };
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  showManagementButtons?: boolean;
}

export function MovieCard({ movie, onSelect, onEdit, onDelete, showManagementButtons = false }: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);


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
        background: (movie.thumbnail_url && !imageError && imageLoaded)
          ? '#000'  // Black background behind image
          : (movie.thumbnail_url && !imageError)
            ? '#1a1a1a'
            : `linear-gradient(135deg, ${getEffectColor()} 0%, ${getEffectColor()}88 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Thumbnail Image (if available) */}
        {movie.thumbnail_url && !imageError ? (
          <>
            <img 
              src={movie.thumbnail_url} 
              alt={movie.title}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 10
              }}
            />
            {!imageLoaded && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: '0.8rem',
                zIndex: 15,
                pointerEvents: 'none'
              }}>
                Loading...
              </div>
            )}
          </>
        ) : (
          /* Fallback: Effect Icon */
          <div style={{
            fontSize: '4rem',
            opacity: 0.8,
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))'
          }}>
            {getEffectIcon()}
          </div>
        )}

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
          textTransform: 'capitalize',
          zIndex: 20
        }}>
          {movie.effect_type}
        </div>

      </div>

      {/* Info Section */}
      <div style={{
        padding: '16px',
        background: 'rgba(20, 20, 20, 0.6)'
      }}>
        <h3 style={{
          color: '#fff',
          fontSize: '1.1rem',
          fontWeight: 600,
          margin: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center'
        }}>
          {movie.title}
        </h3>
      </div>

      {/* Edit/Delete buttons - Only shown when management mode is enabled */}
      {showManagementButtons && (onEdit || onDelete) && (
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
                onDelete(movie.id);
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
