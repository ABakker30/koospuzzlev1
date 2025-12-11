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
  showManagementButtons?: boolean;
}

export function PuzzleCard({ puzzle, onSelect, onEdit, onDelete, showManagementButtons = false }: PuzzleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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
          {puzzle.name}
        </h3>
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
              title="Edit puzzle"
            >
              ✏️ Edit
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
