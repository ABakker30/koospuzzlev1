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
  };
  onSelect: (id: string) => void;
}

export function MovieCard({ movie, onSelect }: MovieCardProps) {
  const [isHovered, setIsHovered] = useState(false);

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
          <span>by {movie.creator_name}</span>
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
    </div>
  );
}
