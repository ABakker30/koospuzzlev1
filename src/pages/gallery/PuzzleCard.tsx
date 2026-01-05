import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { IJK } from '../../types/shape';
import { UserBadgesModal } from './UserBadgesModal';

interface PuzzleCardProps {
  puzzle: {
    id: string;
    name: string;
    creator: string;
    cells: IJK[];
    thumbnailUrl?: string;
    cellCount?: number;
    solutionCount?: number;
    hasSolutions?: boolean;
    likeCount?: number;
    isLiked?: boolean;
  };
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLike?: (id: string, newLikedState: boolean) => void;
  showManagementButtons?: boolean;
}

export function PuzzleCard({ puzzle, onSelect, onEdit, onDelete, onLike, showManagementButtons = false }: PuzzleCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Local state for optimistic like updates
  const [localIsLiked, setLocalIsLiked] = useState(puzzle.isLiked || false);
  const [localLikeCount, setLocalLikeCount] = useState(puzzle.likeCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);

  // Sync local state with props when they change
  useEffect(() => {
    setLocalIsLiked(puzzle.isLiked || false);
    setLocalLikeCount(puzzle.likeCount || 0);
  }, [puzzle.isLiked, puzzle.likeCount]);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = () => {
    onSelect(puzzle.id);
  };

  // Generate a unique color based on puzzle ID for mock thumbnail
  const getMockColor = () => {
    const colors = ['#4a9eff', '#ff6b9d', '#ffd93d', '#6bcf7f', '#a78bfa', '#ff8c42'];
    const index = parseInt(puzzle.id, 36) % colors.length;
    return colors[index];
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
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
      {/* Thumbnail Image Area */}
      <div style={{
        width: '100%',
        aspectRatio: '1',
        background: (puzzle.thumbnailUrl && !imageError) 
          ? '#1a1a1a' 
          : `linear-gradient(135deg, ${getMockColor()} 0%, ${getMockColor()}88 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {puzzle.thumbnailUrl && !imageError ? (
          <img
            src={puzzle.thumbnailUrl}
            alt={puzzle.name}
            onError={() => {
              setImageError(true);
            }}
            onLoad={() => {
              // Thumbnail loaded successfully
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
          />
        ) : (
          // Placeholder when no thumbnail
          <div style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '3rem',
            fontWeight: 700,
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div>🧩</div>
            <div style={{ fontSize: '1.5rem' }}>
              {puzzle.cellCount || puzzle.cells.length}
            </div>
          </div>
        )}

        {/* Badge Row - Top Right Corner */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          gap: '6px',
          alignItems: 'center'
        }}>
          {/* Pieces Count Badge */}
          {(puzzle.cellCount || puzzle.cells.length > 0) && (
            <div style={{
              background: 'rgba(0, 0, 0, 0.65)',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: '14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <span style={{ fontSize: '0.7rem' }}>🔵</span>
              <span>{puzzle.cellCount || puzzle.cells.length}</span>
            </div>
          )}

          {/* Solution Count Badge */}
          {puzzle.hasSolutions && puzzle.solutionCount && puzzle.solutionCount > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: '14px',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <span style={{ fontSize: '0.7rem' }}>✓</span>
              <span>{puzzle.solutionCount}</span>
            </div>
          )}
        </div>

      </div>

      {/* Actions Bar - Heart & Share */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(25, 25, 25, 0.8)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Like Button */}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (isLiking || !onLike) return;
            
            // Optimistic update
            const newIsLiked = !localIsLiked;
            const newLikeCount = localLikeCount + (newIsLiked ? 1 : -1);
            setLocalIsLiked(newIsLiked);
            setLocalLikeCount(Math.max(0, newLikeCount));
            setIsLiking(true);
            
            try {
              await onLike(puzzle.id, newIsLiked);
            } catch (err) {
              // Revert on error
              setLocalIsLiked(!newIsLiked);
              setLocalLikeCount(localLikeCount);
              console.error('Failed to toggle like:', err);
            } finally {
              setIsLiking(false);
            }
          }}
          disabled={isLiking}
          style={{
            background: 'none',
            border: 'none',
            color: localIsLiked ? '#ff6b9d' : 'rgba(255, 255, 255, 0.8)',
            cursor: isLiking ? 'wait' : 'pointer',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            flex: 1,
            opacity: isLiking ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            if (!localIsLiked) e.currentTarget.style.color = '#ff6b9d';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            if (!localIsLiked) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
          }}
          title={localIsLiked ? "Unlike this puzzle" : "Like this puzzle"}
        >
          <span style={{ fontSize: '1.2rem' }}>{localIsLiked ? '❤️' : '🤍'}</span>
          <span>{localLikeCount}</span>
        </button>

        {/* Users Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowUsersModal(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#a78bfa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
          }}
          title="View creator & solvers"
        >
          <span style={{ fontSize: '1.2rem' }}>👥</span>
        </button>

        {/* Share Button */}
        <button
          onClick={async (e) => {
            e.stopPropagation();
            // Use Edge Function URL for rich link previews (WhatsApp, iMessage, etc.)
            const shareUrl = `https://cpblvcajrvlqatniceap.supabase.co/functions/v1/share-preview?type=puzzle&id=${puzzle.id}`;
            
            console.log('🔗 Share button clicked, URL:', shareUrl);
            console.log('📱 navigator.share available:', !!navigator.share);
            console.log('🔒 Secure context:', window.isSecureContext);
            
            // Use Web Share API if available (requires HTTPS on mobile)
            if (navigator.share && window.isSecureContext) {
              try {
                console.log('📤 Attempting native share...');
                await navigator.share({
                  title: puzzle.name,
                  text: `Check out this puzzle: ${puzzle.name}`,
                  url: shareUrl
                });
                console.log('✅ Native share completed');
              } catch (err) {
                console.log('❌ Share error:', err);
                // User cancelled or share failed - fallback to clipboard
                if ((err as Error).name !== 'AbortError') {
                  await navigator.clipboard.writeText(shareUrl);
                  setShowCopied(true);
                  setTimeout(() => setShowCopied(false), 2000);
                }
              }
            } else {
              // Fallback to clipboard for browsers without Web Share API or non-HTTPS
              console.log('📋 Falling back to clipboard copy');
              try {
                await navigator.clipboard.writeText(shareUrl);
                setShowCopied(true);
                setTimeout(() => setShowCopied(false), 2000);
              } catch (err) {
                // Clipboard API also requires secure context, show alert as last resort
                console.log('❌ Clipboard failed, showing prompt');
                window.prompt('Copy this link:', shareUrl);
              }
            }
          }}
          style={{
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#3b82f6',
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
          }}
          title="Share puzzle"
        >
          <span style={{ fontSize: '1rem' }}>{showCopied ? '✓' : '🔗'}</span>
          <span>{showCopied ? 'Copied!' : 'Share'}</span>
        </button>
      </div>

      {/* Edit/Delete buttons - Only shown when user is logged in */}
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
                onEdit(puzzle.id);
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
              title={t('gallery.actions.edit')}
            >
              ✏️ {t('gallery.actions.edit')}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(puzzle.id);
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
              title={t('gallery.actions.delete')}
            >
              🗑️ {t('gallery.actions.delete')}
            </button>
          )}
        </div>
      )}

      {/* Users Modal */}
      <UserBadgesModal
        puzzleId={puzzle.id}
        puzzleName={puzzle.name}
        isOpen={showUsersModal}
        onClose={() => setShowUsersModal(false)}
      />
    </div>
  );
}
