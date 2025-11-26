// Home Page - Landing page with featured movie and motivational content
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoModal } from '../../components/InfoModal';
import { useAuth } from '../../context/AuthContext';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  const [featuredMovie, setFeaturedMovie] = useState<any>(null);
  const [motivationalText, setMotivationalText] = useState<string>('');
  const [isLoadingMovie, setIsLoadingMovie] = useState(true);
  const [isLoadingText, setIsLoadingText] = useState(true);

  // Debug: Log auth state changes
  useEffect(() => {
    console.log('🏠 HomePage auth state:', { 
      isLoading, 
      hasUser: !!user, 
      userEmail: user?.email 
    });
  }, [isLoading, user]);

  const handleLogout = async () => {
    await logout();
    // No need to reload - AuthContext will update the user state automatically
  };

  // Load random featured movie on mount
  useEffect(() => {
    loadRandomMovie();
  }, []);

  // Generate AI motivational text on mount
  useEffect(() => {
    generateMotivationalText();
  }, []);

  const loadRandomMovie = async () => {
    setIsLoadingMovie(true);
    try {
      // TODO: Implement random movie selection from database
      // For now, placeholder logic
      console.log('Loading random featured movie...');
      // This will be replaced with actual Supabase query
      setIsLoadingMovie(false);
    } catch (error) {
      console.error('Failed to load featured movie:', error);
      setIsLoadingMovie(false);
    }
  };

  const generateMotivationalText = async () => {
    setIsLoadingText(true);
    try {
      // TODO: Call ChatGPT API to generate motivational text
      // Placeholder text for now
      setMotivationalText(
        'Join the KOOS Puzzle community and discover the beauty of 3D combinatorial challenges. Create, solve, and share stunning puzzle configurations!'
      );
      setIsLoadingText(false);
    } catch (error) {
      console.error('Failed to generate motivational text:', error);
      setMotivationalText('Welcome to KOOS Puzzle!');
      setIsLoadingText(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem',
      position: 'relative'
    }}>
      {/* Info Button - Top Right */}
      <button
        onClick={() => setShowInfo(true)}
        style={{
          position: 'absolute',
          top: '1.5rem',
          right: '1.5rem',
          background: 'rgba(255,255,255,0.25)',
          border: '1px solid rgba(255,255,255,0.4)',
          backdropFilter: 'blur(10px)',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.5rem',
          color: '#fff',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
        title="Information"
      >
        ℹ️
      </button>

      {/* KOOS Title */}
      <h1 style={{
        fontSize: '4rem',
        fontWeight: 800,
        margin: '2rem 0 1rem 0',
        color: '#fff',
        textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.3)',
        textAlign: 'center',
        letterSpacing: '0.1em'
      }}>
        KOOS PUZZLE
      </h1>

      <p style={{
        fontSize: '1.2rem',
        color: 'rgba(255,255,255,0.95)',
        textShadow: '0 2px 10px rgba(0,0,0,0.2)',
        marginBottom: '3rem',
        textAlign: 'center',
        maxWidth: '600px'
      }}>
        3D Puzzle Platform for Creative Minds
      </p>

      {/* Featured Movie Window */}
      <div style={{
        width: '100%',
        maxWidth: '900px',
        aspectRatio: '16/9',
        backgroundColor: 'rgba(255,255,255,0.2)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '3px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.2)',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {isLoadingMovie ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
            <p style={{ color: 'rgba(255,255,255,0.9)' }}>Loading featured movie...</p>
          </div>
        ) : featuredMovie ? (
          <div style={{ width: '100%', height: '100%' }}>
            {/* TODO: Embed actual movie player component */}
            <p style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.95)' }}>
              Movie Player Component
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
            <p style={{ color: 'rgba(255,255,255,0.9)' }}>No featured movie available</p>
          </div>
        )}
      </div>

      {/* AI-Generated Motivational Text */}
      <div style={{
        maxWidth: '700px',
        textAlign: 'center',
        padding: '2rem',
        backgroundColor: 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(20px)',
        borderRadius: '16px',
        border: '2px solid rgba(255,255,255,0.4)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        marginBottom: '3rem'
      }}>
        {isLoadingText ? (
          <p style={{ color: 'rgba(255,255,255,0.9)' }}>Generating welcome message...</p>
        ) : (
          <p style={{
            fontSize: '1.1rem',
            lineHeight: '1.6',
            color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,0.2)',
            margin: 0
          }}>
            {motivationalText}
          </p>
        )}
      </div>

      {/* Call to Action Buttons */}
      {!isLoading && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: '2rem'
        }}>
          <button
            onClick={() => user ? handleLogout() : navigate('/login')}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.2rem',
              fontWeight: 700,
              background: 'rgba(255,255,255,0.3)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.5)',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 8px 24px rgba(255,255,255,0.2)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {user ? '🚪 Logout' : '🔐 Login'}
          </button>
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <button
          onClick={() => navigate('/gallery')}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.3)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255,255,255,0.5)',
            borderRadius: '12px',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 8px 24px rgba(255,255,255,0.2)',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Browse Gallery
        </button>
      </div>

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="About KOOS Puzzle"
      >
        <p>KOOS Puzzle is a 3D puzzle platform where you can create, solve, and share intricate combinatorial puzzles.</p>
        <p>Features:</p>
        <ul>
          <li>Create custom puzzles from 25 unique pieces</li>
          <li>Solve puzzles manually or watch automatic solutions</li>
          <li>Create stunning movies with visual effects</li>
          <li>Share your creations with the community</li>
        </ul>
      </InfoModal>
    </div>
  );
};

export default HomePage;
