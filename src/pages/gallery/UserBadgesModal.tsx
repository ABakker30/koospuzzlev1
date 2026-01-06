// User list modal with badges for puzzle cards
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BADGE_DEFINITIONS, UserWithBadges, BadgeId } from '../../types/badges';
import { getPuzzleUsers } from '../../api/badges';

interface UserBadgesModalProps {
  puzzleId: string;
  puzzleName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function UserBadgesModal({ puzzleId, puzzleName, isOpen, onClose }: UserBadgesModalProps) {
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<UserWithBadges | null>(null);
  const [solvers, setSolvers] = useState<UserWithBadges[]>([]);
  const [hoveredBadge, setHoveredBadge] = useState<{ badgeId: BadgeId; x: number; y: number } | null>(null);

  useEffect(() => {
    if (isOpen && puzzleId) {
      loadUsers();
    }
  }, [isOpen, puzzleId]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { creator: c, solvers: s } = await getPuzzleUsers(puzzleId);
      setCreator(c);
      setSolvers(s);
    } catch (error) {
      console.error('Error loading puzzle users:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Use portal to render modal outside the card's DOM hierarchy
  // This prevents the modal from being clipped by overflow: hidden on parent elements
  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(145deg, rgba(40, 40, 50, 0.98), rgba(30, 30, 40, 0.98))',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            width: '100%',
            maxWidth: '420px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 600
                }}>
                  People
                </h3>
                <p style={{
                  margin: '4px 0 0',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '0.8rem'
                }}>
                  {puzzleName}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1
          }}>
            {loading ? (
              <div style={{
                textAlign: 'center',
                color: 'rgba(255,255,255,0.5)',
                padding: '40px 0'
              }}>
                Loading...
              </div>
            ) : (
              <>
                {/* Creator section */}
                {creator && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '8px',
                      fontWeight: 600
                    }}>
                      Created by
                    </div>
                    {renderUserRow(creator, true)}
                  </div>
                )}

                {/* Solvers section */}
                {solvers.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '8px',
                      fontWeight: 600
                    }}>
                      Solved by ({solvers.length})
                    </div>
                    {solvers.map((solver) => renderUserRow(solver))}
                  </div>
                )}

                {/* Empty state */}
                {!creator && solvers.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.5)',
                    padding: '40px 0'
                  }}>
                    No users found for this puzzle.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Badge Tooltip */}
      {hoveredBadge && (
        <div
          style={{
            position: 'fixed',
            left: hoveredBadge.x,
            top: hoveredBadge.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            padding: '8px 12px',
            zIndex: 10100,
            maxWidth: '200px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
          }}
        >
          <div style={{
            fontWeight: 600,
            color: '#fff',
            fontSize: '0.85rem',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{BADGE_DEFINITIONS[hoveredBadge.badgeId].icon}</span>
            {BADGE_DEFINITIONS[hoveredBadge.badgeId].name}
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.75rem',
            lineHeight: 1.4
          }}>
            {BADGE_DEFINITIONS[hoveredBadge.badgeId].description}
          </div>
        </div>
      )}
    </>
  );

  // Render to document.body via portal
  return createPortal(modalContent, document.body);
}
