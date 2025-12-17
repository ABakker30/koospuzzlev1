// Home Page - Clean landing screen with three main actions
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SettingsModal } from '../../components/SettingsModal';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import type { StudioSettings } from '../../types/studio';
import { DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsService = useRef(new StudioSettingsService());
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

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

      {/* Welcome Message */}
      <p style={{
        fontSize: 'clamp(1.1rem, 3vw, 1.3rem)',
        color: 'rgba(255,255,255,0.95)',
        textShadow: '0 2px 10px rgba(0,0,0,0.2)',
        marginBottom: 'clamp(2rem, 5vh, 4rem)',
        textAlign: 'center',
        maxWidth: '700px',
        padding: '0 1rem',
        lineHeight: 1.6
      }}>
        Welcome! Choose your path to explore the world of 3D sphere puzzles.
      </p>

      {/* Three Main Action Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'clamp(1.5rem, 4vw, 2.5rem)',
        width: '100%',
        maxWidth: '1200px',
        padding: '0 clamp(1rem, 3vw, 2rem)',
        marginBottom: 'clamp(2rem, 5vh, 4rem)'
      }}>
        {/* Solve a Puzzle Card */}
        <div
          onClick={() => navigate('/gallery?tab=puzzles')}
          onMouseEnter={() => setHoveredCard('solve')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: hoveredCard === 'solve' 
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '3px solid rgba(255,255,255,0.5)',
            boxShadow: hoveredCard === 'solve'
              ? '0 20px 60px rgba(0,0,0,0.4), 0 0 60px rgba(102, 126, 234, 0.5)'
              : '0 15px 40px rgba(0,0,0,0.3)',
            padding: 'clamp(2rem, 5vw, 3rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'solve' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(1rem, 3vw, 1.5rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(4rem, 10vw, 5rem)',
            filter: hoveredCard === 'solve' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(102,126,234,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            🧩
          </div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            Solve a Puzzle
          </h2>
          <p style={{
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.9)',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            lineHeight: 1.6,
            margin: 0
          }}>
            Choose from our collection and put your spatial reasoning to the test
          </p>
        </div>

        {/* Create a Puzzle Card */}
        <div
          onClick={() => navigate('/create')}
          onMouseEnter={() => setHoveredCard('create')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: hoveredCard === 'create'
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '3px solid rgba(255,255,255,0.5)',
            boxShadow: hoveredCard === 'create'
              ? '0 20px 60px rgba(0,0,0,0.4), 0 0 60px rgba(118, 75, 162, 0.5)'
              : '0 15px 40px rgba(0,0,0,0.3)',
            padding: 'clamp(2rem, 5vw, 3rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'create' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(1rem, 3vw, 1.5rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(4rem, 10vw, 5rem)',
            filter: hoveredCard === 'create' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(118,75,162,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            🎨
          </div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            Create a Puzzle
          </h2>
          <p style={{
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.9)',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            lineHeight: 1.6,
            margin: 0
          }}>
            Design your own unique 3D puzzle and share it with the world
          </p>
        </div>

        {/* View Solutions Card */}
        <div
          onClick={() => navigate('/gallery?tab=movies')}
          onMouseEnter={() => setHoveredCard('solutions')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            background: hoveredCard === 'solutions'
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '3px solid rgba(255,255,255,0.5)',
            boxShadow: hoveredCard === 'solutions'
              ? '0 20px 60px rgba(0,0,0,0.4), 0 0 60px rgba(240, 147, 251, 0.5)'
              : '0 15px 40px rgba(0,0,0,0.3)',
            padding: 'clamp(2rem, 5vw, 3rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'solutions' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(1rem, 3vw, 1.5rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(4rem, 10vw, 5rem)',
            filter: hoveredCard === 'solutions' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(240,147,251,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            💡
          </div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            View Solutions
          </h2>
          <p style={{
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            color: 'rgba(255,255,255,0.9)',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            lineHeight: 1.6,
            margin: 0
          }}>
            Explore how others have solved puzzles and get inspired
          </p>
        </div>
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
