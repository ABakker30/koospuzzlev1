import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { toggleSolutionLike } from '../../api/solutionsGallery';

interface SolutionCardProps {
  solution: {
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
    cell_count?: number;
    is_liked?: boolean;
  };
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  showManagementButtons?: boolean;
  onLikeToggle?: (solutionId: string, newLikeCount: number, newIsLiked: boolean) => void;
}

export function SolutionCard({ solution, onSelect, onEdit, onDelete, showManagementButtons = false, onLikeToggle }: SolutionCardProps) {
  const { user } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLiked, setIsLiked] = useState(solution.is_liked || false);
  const [likeCount, setLikeCount] = useState(solution.like_count || 0);
  const [isLiking, setIsLiking] = useState(false);

  const handleHeartClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isLiking) return;

    setIsLiking(true);
    const newIsLiked = !isLiked;
    const newLikeCount = newIsLiked ? likeCount + 1 : likeCount - 1;
    
    // Optimistic update
    setIsLiked(newIsLiked);
    setLikeCount(newLikeCount);

    try {
      await toggleSolutionLike(solution.id, newIsLiked);
      if (onLikeToggle) {
        onLikeToggle(solution.id, newLikeCount, newIsLiked);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert on error
      setIsLiked(!newIsLiked);
      setLikeCount(likeCount);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(solution.id)}
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
        background: (solution.thumbnail_url && !imageError && imageLoaded)
          ? '#2a2a2a'  // Dark gray instead of pure black
          : (solution.thumbnail_url && !imageError)
            ? '#1a1a1a'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Thumbnail Image (if available) */}
        {solution.thumbnail_url && !imageError ? (
          <>
            <img 
              src={solution.thumbnail_url} 
              alt={solution.title}
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
          /* Fallback: Solution Icon */
          <div style={{
            fontSize: '4rem',
            opacity: 0.8,
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))'
          }}>
            🎯
          </div>
        )}
      </div>

      {/* Info Section */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(20, 20, 20, 0.6)'
      }}>
        <h3 style={{
          color: '#fff',
          fontSize: '0.95rem',
          fontWeight: 600,
          margin: 0,
          marginBottom: '6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center'
        }}>
          {solution.title}
        </h3>
        
        {/* Stats Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px'
        }}>
          {/* Cell Count */}
          {solution.cell_count !== undefined && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.85rem'
            }}>
              <span>🟣</span>
              <span>{solution.cell_count} cells</span>
            </div>
          )}
          
          {/* Heart Button */}
          <button
            onClick={handleHeartClick}
            disabled={!user || isLiking}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: user ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s',
              opacity: !user ? 0.5 : 1,
              color: isLiked ? '#ff4757' : 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.9rem'
            }}
            onMouseEnter={(e) => {
              if (user) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={!user ? 'Sign in to like' : (isLiked ? 'Unlike' : 'Like')}
          >
            <span style={{ fontSize: '1.1rem' }}>{isLiked ? '❤️' : '🤍'}</span>
            <span style={{ fontWeight: 600 }}>{likeCount}</span>
          </button>
        </div>
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
                onEdit(solution.id);
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
              title="Edit solution"
            >
              ✏️ Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(solution.id);
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
              title="Delete solution"
            >
              🗑️ Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
