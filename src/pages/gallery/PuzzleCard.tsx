import { useState, useRef } from 'react';
import type { IJK } from '../../types/shape';

interface PuzzleCardProps {
  puzzle: {
    id: string;
    name: string;
    creator: string;
    cells: IJK[];
    thumbnailUrl?: string;
    cellCount?: number;
  };
  onSelect: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function PuzzleCard({ puzzle, onSelect, onEdit, onDelete }: PuzzleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [is3DActive, setIs3DActive] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIs3DActive(false);
  };

  const handleClick = () => {
    if (is3DActive) {
      // If 3D is active, clicking selects the puzzle
      onSelect(puzzle.id);
    } else {
      // First click activates 3D preview
      setIs3DActive(true);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const puzzleUrl = `${window.location.origin}/solve/${puzzle.id}?shared=true`;
    
    try {
      // Try Web Share API first (mobile/modern browsers)
      if (navigator.share) {
        // WhatsApp and many messaging apps work best with just text containing the URL
        const shareData = {
          text: `${puzzle.name}\n${puzzleUrl}\n`
        };
        await navigator.share(shareData);
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(puzzleUrl);
        setShowShareTooltip(true);
        setTimeout(() => setShowShareTooltip(false), 2000);
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
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
      {/* Thumbnail / 3D Preview Area */}
      <div style={{
        width: '100%',
        aspectRatio: '1',
        background: is3DActive 
          ? 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)'
          : `linear-gradient(135deg, ${getMockColor()} 0%, ${getMockColor()}88 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {is3DActive ? (
          // Placeholder for 3D preview
          <div style={{
            color: '#fff',
            fontSize: '0.9rem',
            opacity: 0.5
          }}>
            🔄 3D Preview
            <br />
            <span style={{ fontSize: '0.75rem' }}>(Coming soon)</span>
          </div>
        ) : (
          // Mock thumbnail
          <div style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '3rem',
            fontWeight: 700,
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            {puzzle.cellCount || puzzle.cells.length}
          </div>
        )}

        {/* Hover indicator */}
        {isHovered && !is3DActive && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            pointerEvents: 'none'
          }}>
            Click to preview in 3D
          </div>
        )}
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
          margin: '0 0 8px 0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {puzzle.name}
        </h3>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          color: '#888'
        }}>
          <span>by {puzzle.creator}</span>
          <span>{puzzle.cellCount || puzzle.cells.length} cells</span>
        </div>
      </div>

      {/* Share Button - Bottom-right with gradient (always visible on mobile, hover on desktop) */}
      {!is3DActive && !showShareTooltip && (
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
          title="Share puzzle"
        >
          <span style={{ fontSize: '1rem' }}>🔗</span>
          <span>Share</span>
        </button>
      )}

      {/* Share Success Tooltip */}
      {showShareTooltip && !is3DActive && (
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

      {/* 3D Active Indicator */}
      {is3DActive && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(74, 158, 255, 0.9)',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          pointerEvents: 'none'
        }}>
          Click to solve →
        </div>
      )}

      {/* Dev-only Edit/Delete buttons - Bottom-left (always visible on mobile) */}
      {import.meta.env.DEV && (onEdit || onDelete) && !is3DActive && (
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
              title="Edit puzzle"
            >
              ✏️ Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete puzzle "${puzzle.name}"?`)) {
                  onDelete(puzzle.id);
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
              title="Delete puzzle"
            >
              🗑️ Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
