// Home Page - Landing page with featured movie and motivational content
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicMovies } from '../../api/movies';
import { MovieGravityPlayer, type GravityMovieHandle } from '../../components/movie/MovieGravityPlayer';
import { useAuth } from '../../context/AuthContext';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [featuredMovie, setFeaturedMovie] = useState<any>(null);
  const [isLoadingMovie, setIsLoadingMovie] = useState(true);
  const moviePlayerRef = useRef<GravityMovieHandle>(null);

  // Load most recent featured movie on mount
  useEffect(() => {
    loadFeaturedMovie();
  }, []);

  const loadFeaturedMovie = async () => {
    setIsLoadingMovie(true);
    try {
      console.log('🎬 Loading most recent movie...');
      const movies = await getPublicMovies();
      
      if (movies && movies.length > 0) {
        // Get the most recent movie (first in array since getPublicMovies sorts by created_at desc)
        const mostRecentMovie = movies[0];
        setFeaturedMovie(mostRecentMovie);
        console.log('✅ Loaded featured movie:', mostRecentMovie.id);
      } else {
        console.log('ℹ️ No movies available');
        setFeaturedMovie(null);
      }
      
      setIsLoadingMovie(false);
    } catch (error) {
      console.error('❌ Failed to load featured movie:', error);
      setFeaturedMovie(null);
      setIsLoadingMovie(false);
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

      {/* Login/Logout Button - Top Right */}
      <div style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 9999
      }}>
        {user ? (
          <button
            onClick={logout}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.8)',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.8)',
              borderRadius: '12px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Sign In
          </button>
        )}
      </div>

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
        position: 'relative',
        width: '100%',
        maxWidth: '900px',
        height: '506px',
        backgroundColor: 'rgba(255,255,255,0.2)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '3px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.2)',
        marginBottom: '2rem',
        overflow: 'hidden'
      }}>
        {isLoadingMovie ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
            <p style={{ color: 'rgba(255,255,255,0.9)' }}>Loading featured movie...</p>
          </div>
        ) : featuredMovie ? (
          <MovieGravityPlayer
            ref={moviePlayerRef}
            movieId={featuredMovie.id}
            autoPlay={true}
            loop={true}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
            <p style={{ color: 'rgba(255,255,255,0.9)' }}>No featured movie available</p>
          </div>
        )}
      </div>

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

      {/* Info Modal - TODO: Restore when InfoModal component is available */}
    </div>
  );
};

export default HomePage;
