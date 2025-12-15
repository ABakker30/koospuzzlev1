// Home Page - Landing page with featured movie and motivational content
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicMovies } from '../../api/movies';
import { MovieGravityPlayer, type GravityMovieHandle } from '../../components/movie/MovieGravityPlayer';
import { useAuth } from '../../context/AuthContext';
import { SettingsModal } from '../../components/SettingsModal';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import type { StudioSettings } from '../../types/studio';
import { DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [featuredMovie, setFeaturedMovie] = useState<any>(null);
  const [isLoadingMovie, setIsLoadingMovie] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsService = useRef(new StudioSettingsService());
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
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

  // Load settings from DB when user logs in (Phase 2: Profile Integration)
  useEffect(() => {
    if (user?.id) {
      console.log('🔄 [HomePage] Loading settings from DB for user:', user.id);
      settingsService.current.loadSettingsFromDB(user.id).then(dbSettings => {
        if (dbSettings) {
          console.log('✅ [HomePage] DB settings loaded');
          setSettings(dbSettings);
        }
      });
    }
  }, [user?.id]);

  // Save settings to DB when they change (Phase 2: Profile Integration)
  useEffect(() => {
    if (user?.id && showSettings === false) {
      // Only save when settings modal closes to avoid spamming DB
      console.log('💾 [HomePage] Saving settings to DB');
      settingsService.current.saveSettingsToDB(user.id, settings);
    }
  }, [settings, user?.id, showSettings]);

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 'clamp(0.5rem, 4vw, 2rem)',
      paddingTop: 'clamp(4rem, 10vh, 6rem)',
      position: 'relative',
      boxSizing: 'border-box'
    }}>

      {/* Login/Profile Button - Top Right */}
      <div style={{
        position: 'fixed',
        top: 'clamp(0.5rem, 2vh, 1.5rem)',
        right: 'clamp(0.5rem, 2vw, 1.5rem)',
        zIndex: 9999
      }}>
        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{
                padding: 'clamp(0.5rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)',
                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.8)',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <span>👤</span>
              <span>Profile</span>
            </button>
            
            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998
                  }}
                  onClick={() => setShowProfileMenu(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    background: 'rgba(0, 0, 0, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '8px',
                    minWidth: '200px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    zIndex: 9999
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.2)',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
                      Signed in as
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginTop: '4px' }}>
                      {user.email}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      navigate('/gallery?tab=mine');
                      setShowProfileMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      transition: 'background 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>🧩</span>
                    <span>My Puzzles</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowSettings(true);
                      setShowProfileMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      transition: 'background 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>⚙️</span>
                    <span>Studio Settings</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      transition: 'background 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>🚪</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: 'clamp(0.5rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)',
              fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
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
        fontSize: 'clamp(2.5rem, 10vw, 4rem)',
        fontWeight: 800,
        margin: 'clamp(0.5rem, 2vh, 2rem) 0 clamp(0.5rem, 2vh, 1rem) 0',
        color: '#fff',
        textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.3)',
        textAlign: 'center',
        letterSpacing: '0.1em',
        lineHeight: 1.2
      }}>
        KOOS PUZZLE
      </h1>

      <p style={{
        fontSize: 'clamp(1rem, 3vw, 1.2rem)',
        color: 'rgba(255,255,255,0.95)',
        textShadow: '0 2px 10px rgba(0,0,0,0.2)',
        marginBottom: 'clamp(1rem, 4vh, 3rem)',
        textAlign: 'center',
        maxWidth: '600px',
        padding: '0 1rem'
      }}>
        3D Puzzle Platform for Creative Minds
      </p>

      {/* Featured Movie Window */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '900px',
        height: 'clamp(300px, 56vw, 506px)',
        backgroundColor: 'rgba(255,255,255,0.2)',
        backdropFilter: 'blur(20px)',
        borderRadius: 'clamp(12px, 3vw, 20px)',
        border: '3px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(255,255,255,0.2)',
        marginBottom: 'clamp(1rem, 3vh, 2rem)',
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
            padding: 'clamp(0.625rem, 2vw, 0.75rem) clamp(1.25rem, 4vw, 1.5rem)',
            fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
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
      
      {/* Studio Settings Modal (Phase 2: Profile Integration) */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default HomePage;
