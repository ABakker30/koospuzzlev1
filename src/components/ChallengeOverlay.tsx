interface ChallengeOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onBackToGallery?: () => void; // For "Back to Gallery" button
  challengeText: string;
  movieTitle: string;
  puzzleName: string;
  creatorName?: string;
  solveDate?: string;
  solveTime?: number; // in seconds
  piecesPlaced?: number;
  totalPieces?: number;
  puzzleMode?: string;
  onTryPuzzle?: () => void;
}

export function ChallengeOverlay({ 
  isVisible, 
  onClose,
  onBackToGallery,
  challengeText,
  movieTitle,
  puzzleName,
  creatorName = 'Anonymous',
  solveDate,
  solveTime,
  piecesPlaced,
  totalPieces,
  puzzleMode = 'Manual',
  onTryPuzzle
}: ChallengeOverlayProps) {
  if (!isVisible) return null;
  
  const formatTime = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (date?: string) => {
    if (!date) return new Date().toLocaleDateString();
    return new Date(date).toLocaleDateString();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(10px)',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      {/* Confetti background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}>
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: '10px',
              height: '10px',
              background: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8dadc', '#f4a261'][i % 5],
              left: `${Math.random() * 100}%`,
              top: '-20px',
              animation: `fall ${3 + Math.random() * 4}s linear infinite`,
              animationDelay: `${Math.random() * 5}s`,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              opacity: 0.7
            }}
          />
        ))}
      </div>
      
      <div style={{
        maxWidth: '700px',
        width: '90%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        borderRadius: '24px',
        padding: '0',
        boxShadow: '0 25px 80px rgba(102, 126, 234, 0.4), 0 0 100px rgba(244, 147, 251, 0.3)',
        border: '3px solid rgba(255,255,255,0.3)',
        animation: 'slideUp 0.5s ease-out, glow 2s ease-in-out infinite alternate',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Sparkle Corner Decorations */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', fontSize: '24px', animation: 'spin 3s linear infinite' }}>✨</div>
        <div style={{ position: 'absolute', top: '1rem', right: '4rem', fontSize: '24px', animation: 'spin 4s linear infinite reverse' }}>🌟</div>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255,255,255,0.2)',
            border: '2px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            fontSize: '24px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            fontWeight: 'bold',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
            e.currentTarget.style.transform = 'rotate(90deg) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.transform = 'rotate(0deg) scale(1)';
          }}
        >
          ×
        </button>

        <div style={{ padding: '2.5rem 2rem' }}>
          {/* Trophy & Title */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '72px', marginBottom: '0.5rem', animation: 'bounce 1s ease-in-out infinite' }}>
              🏆
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: 900,
              color: '#fff',
              textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
              letterSpacing: '1px'
            }}>
              CHALLENGE ACCEPTED?
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              fontStyle: 'italic'
            }}>
              {challengeText}
            </div>
          </div>

          {/* Creator Badge */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '2px solid rgba(255,255,255,0.3)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '48px' }}>👤</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '0.25rem' }}>
                  CREATED BY
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>
                  {creatorName}
                </div>
              </div>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              marginTop: '1rem'
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.15)',
                padding: '0.75rem',
                borderRadius: '10px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.25rem' }}>📅</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>DATE</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{formatDate(solveDate)}</div>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.15)',
                padding: '0.75rem',
                borderRadius: '10px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '0.25rem' }}>⏱️</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>TIME</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{formatTime(solveTime)}</div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #ff6b6b, #ee5a6f)',
              padding: '1rem',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(255,107,107,0.4)',
              transform: 'rotate(-2deg)'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '0.25rem' }}>🧩</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>
                {piecesPlaced || '?'}/{totalPieces || '?'}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase' }}>
                Pieces
              </div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
              padding: '1rem',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(78,205,196,0.4)',
              transform: 'rotate(1deg)'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '0.25rem' }}>🎮</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                {puzzleMode}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase' }}>
                Mode
              </div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #ffe66d, #ffd93d)',
              padding: '1rem',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(255,230,109,0.4)',
              transform: 'rotate(-1deg)'
            }}>
              <div style={{ fontSize: '28px', marginBottom: '0.25rem' }}>📦</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#333', lineHeight: 1.2 }}>
                {puzzleName}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase' }}>
                Puzzle
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center'
          }}>
            {onTryPuzzle && (
              <button
                onClick={onTryPuzzle}
                style={{
                  padding: '1rem 2.5rem',
                  fontSize: '18px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                  border: '3px solid #fff',
                  borderRadius: '50px',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 8px 25px rgba(255, 215, 0, 0.6)',
                  transition: 'all 0.3s',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(255, 215, 0, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 25px rgba(255, 215, 0, 0.6)';
                }}
              >
                🎯 Accept Challenge!
              </button>
            )}
            <button
              onClick={onBackToGallery || onClose}
              style={{
                padding: '1rem 2rem',
                fontSize: '16px',
                fontWeight: 600,
                background: 'rgba(255,255,255,0.2)',
                border: '2px solid rgba(255,255,255,0.4)',
                borderRadius: '50px',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              🎬 Browse More Movies
            </button>
          </div>
        </div>
      </div>


      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes glow {
          from {
            box-shadow: 0 25px 80px rgba(102, 126, 234, 0.4), 0 0 100px rgba(244, 147, 251, 0.3);
          }
          to {
            box-shadow: 0 25px 80px rgba(102, 126, 234, 0.6), 0 0 120px rgba(244, 147, 251, 0.5);
          }
        }
        
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
