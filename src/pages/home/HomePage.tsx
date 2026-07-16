// Home Page - Clean landing screen with three main actions
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useAppBootstrap } from '../../providers/AppBootstrapProvider';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { AboutModal } from '../../components/AboutModal';
import { AskAntonModal } from '../../components/AskAntonModal';
import { getRecentSolutionThumbnails } from '../../api/solutions';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';
import './HomePage.css';
import { tokens } from '../../styles/tokens';

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, updateUsername } = useAuth();
  const { language, setLanguage } = useAppBootstrap();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showAskAntonModal, setShowAskAntonModal] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  
  // Slideshow state
  const [slideshowImages, setSlideshowImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  
  // Saved preferences
  const [username, setUsername] = useState('');
  
  // Temporary edit state (not saved until Save button clicked)
  const [editedUsername, setEditedUsername] = useState('');
  const [editedLanguage, setEditedLanguage] = useState(language);
  const [editedPvpChat, setEditedPvpChat] = useState(true);
  
  // Prefill the profile name from the canonical source (users.username in the
  // DB) when signed in, falling back to the local value for guests.
  useEffect(() => {
    const name = user?.username || localStorage.getItem('user_preferences_username') || '';
    if (name) {
      setUsername(name);
      setEditedUsername(name);
    }
  }, [user?.username]);

  // Load other preferences from localStorage
  useEffect(() => {
    const savedPvpChat = localStorage.getItem('user_preferences_pvp_chat');
    if (savedPvpChat !== null) {
      setEditedPvpChat(savedPvpChat !== 'false');
    }
  }, []);
  
  // Sync edited language with current language when it changes
  useEffect(() => {
    setEditedLanguage(language);
  }, [language]);

  // Load slideshow images
  useEffect(() => {
    const loadSlideshowImages = async () => {
      try {
        const images = await getRecentSolutionThumbnails(20);
        if (images.length > 0) {
          setSlideshowImages(images);
        }
      } catch (error) {
        console.error('Failed to load slideshow images:', error);
      }
    };
    loadSlideshowImages();
  }, []);

  // Cycle through images every 4 seconds with fade effect
  useEffect(() => {
    if (slideshowImages.length <= 1) return;
    
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % slideshowImages.length);
        setFadeIn(true);
      }, 800); // Slower fade out
    }, 4000); // Change every 4 seconds
    
    return () => clearInterval(interval);
  }, [slideshowImages.length]);
  
  // Handle Save button
  const handleSavePreferences = async () => {
    // Save username — write through to the DB (canonical, cross-device, what
    // others see on leaderboards/challenges); updateUsername also mirrors to
    // localStorage for guests + instant local reads.
    setUsername(editedUsername);
    await updateUsername(editedUsername);
    
    // Save language
    if (editedLanguage !== language) {
      await setLanguage(editedLanguage);
    }
    
    // Save PvP chat preference
    localStorage.setItem('user_preferences_pvp_chat', String(editedPvpChat));
    
    // Show saved confirmation
    setShowSavedMessage(true);
    setTimeout(() => setShowSavedMessage(false), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: tokens.gradient.brandTri,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 'clamp(0.5rem, 2vw, 1.5rem)',
      paddingTop: 'clamp(5.5rem, 8vh, 3rem)',
      position: 'relative',
      boxSizing: 'border-box'
    }}>

      {/* Top Right Buttons */}
      <div style={{
        position: 'fixed',
        top: 'clamp(0.5rem, 2vh, 1.5rem)',
        right: 'clamp(0.5rem, 2vw, 1.5rem)',
        zIndex: 9999,
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        {/* Three-Dot Menu */}
        <ThreeDotMenu
          size={48}
          iconSize={32}
          items={[
            { icon: 'ℹ️', label: t('button.info'), onClick: () => setShowAboutModal(true) },
            { icon: '🎨', label: 'Ask Anton', onClick: () => setShowAskAntonModal(true) },
            { icon: '📊', label: 'Admin', onClick: () => navigate('/admin'), hidden: !user?.is_admin },
          ]}
        />
        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{
                padding: 'clamp(0.5rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)',
                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                fontWeight: 700,
                background: tokens.gradient.brand,
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
                e.currentTarget.style.background = tokens.gradient.brand;
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <span style={{ fontSize: '1.25em', color: '#fff' }}>👤</span>
              <span>{t('profile.title')}</span>
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
                    background: tokens.gradient.brandTri,
                    backdropFilter: 'blur(20px)',
                    border: '2px solid rgba(255, 255, 255, 0.5)',
                    borderRadius: '16px',
                    padding: '12px',
                    minWidth: '280px',
                    boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4), 0 0 0 1px rgba(255,255,255,0.1)',
                    zIndex: 9999
                  }}
                >
                  {/* Account Info */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: '2px solid rgba(255,255,255,0.3)',
                      marginBottom: '12px',
                      background: 'rgba(255,255,255,0.15)',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.95)' }}>
                      {t('profile.signedInAs')}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginTop: '4px' }}>
                      {user.email}
                    </div>
                  </div>
                  
                  {/* Preferences Section */}
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: '2px solid rgba(255,255,255,0.3)',
                    marginBottom: '12px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '12px', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                      ⚙️ {t('profile.preferences')}
                    </div>
                    
                    {/* Username Field */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {t('profile.username')}
                      </label>
                      <input
                        type="text"
                        value={editedUsername}
                        onChange={(e) => setEditedUsername(e.target.value)}
                        placeholder={t('profile.usernamePlaceholder')}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'rgba(255,255,255,0.9)',
                          border: '2px solid rgba(255,255,255,0.5)',
                          borderRadius: '8px',
                          color: '#1a1a1a',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    
                    {/* Language Selector */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {t('profile.language.label')}
                      </label>
                      <select
                        value={editedLanguage}
                        onChange={(e) => setEditedLanguage(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'rgba(255,255,255,0.9)',
                          border: '2px solid rgba(255,255,255,0.5)',
                          borderRadius: '8px',
                          color: '#1a1a1a',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          boxSizing: 'border-box'
                        }}
                      >
                        {SUPPORTED_LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code} style={{ background: '#000', color: '#fff' }}>
                            {lang.nativeName}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* PvP AI Chat Toggle */}
                    <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>
                        💬 AI Chat in PvP
                      </label>
                      <button
                        onClick={() => setEditedPvpChat(!editedPvpChat)}
                        style={{
                          width: '48px',
                          height: '26px',
                          borderRadius: '13px',
                          border: 'none',
                          background: editedPvpChat ? '#10b981' : 'rgba(255,255,255,0.3)',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s ease',
                        }}
                      >
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: '#fff',
                          position: 'absolute',
                          top: '3px',
                          left: editedPvpChat ? '25px' : '3px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>
                    
                    {/* Save Button */}
                    <button
                      onClick={handleSavePreferences}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: tokens.gradient.success,
                        border: 'none',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                      }}
                    >
                      {showSavedMessage ? (
                        <>
                          <span>✅</span>
                          <span>{t('profile.saved')}</span>
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          <span>{t('profile.savePreferences')}</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  {/* Terms & Conditions Link */}
                  <button
                    onClick={() => {
                      setShowTermsModal(true);
                      setShowProfileMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.15)',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span>📄</span>
                    <span>{t('profile.termsAndConditions')}</span>
                  </button>
                  
                  {/* Sign Out Button */}
                  <button
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.15)',
                      border: 'none',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <span>🚪</span>
                    <span>{t('profile.signOut')}</span>
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
              background: tokens.gradient.brand,
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
            {t('profile.signIn')}
          </button>
        )}
      </div>

      {/* KOOS Title with slow shimmer animation */}
      <h1 
        className="koos-title-shimmer"
        style={{
          fontSize: 'clamp(2.5rem, 8vw, 4rem)',
          fontWeight: 900,
          margin: 'clamp(0.5rem, 2vh, 1rem) 0 clamp(0.25rem, 1vh, 0.5rem) 0',
          textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.4)',
          textAlign: 'center',
          letterSpacing: '0.15em',
          lineHeight: 1.1,
          background: 'linear-gradient(90deg, #fff 0%, #fff 10%, #ff6b6b 20%, #ffa94d 28%, #51cf66 36%, #339af0 44%, #cc5de8 52%, #fff 62%, #fff 100%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'titleShimmer 5s linear infinite',
        }}>
        KOOS PUZZLE
      </h1>

      {/* Tagline */}
      <p style={{
        fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.95)',
        textShadow: '0 2px 10px rgba(0,0,0,0.3)',
        marginBottom: 'clamp(0.25rem, 1vh, 0.5rem)',
        textAlign: 'center',
        letterSpacing: '0.05em'
      }}>
        {t('home.tagline')}
      </p>

      {/* Subtitle */}
      <p style={{
        fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 'clamp(1rem, 3vh, 1.5rem)',
        textAlign: 'center',
        maxWidth: '500px',
        padding: '0 1rem'
      }}>
        {t('home.subtitle')}
      </p>

      {/* Spacer where quote used to be */}
      <div style={{ marginBottom: 'clamp(1rem, 3vh, 1.5rem)' }} />

      {/* Slideshow + Play Button Container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '400px',
        padding: '0 clamp(0.75rem, 2vw, 1.5rem)',
        marginTop: 'clamp(1rem, 3vh, 1.5rem)',
        marginBottom: 'clamp(1rem, 3vh, 1.5rem)',
        gap: 'clamp(0.75rem, 2vh, 1rem)'
      }}>
        {/* Slideshow Image */}
        {slideshowImages.length > 0 && (
          <div style={{
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            border: '3px solid rgba(255,255,255,0.3)',
            position: 'relative',
            background: '#1a1a2e'
          }}>
            <img
              src={slideshowImages[currentImageIndex]}
              alt="Recent puzzle solution"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: fadeIn ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out'
              }}
            />
          </div>
        )}

        {/* Horizontal Play Button */}
        <button
          onClick={() => navigate('/gallery')}
          onMouseEnter={() => setHoveredCard('play')}
          onMouseLeave={() => setHoveredCard(null)}
          style={{
            width: '100%',
            background: hoveredCard === 'play'
              ? 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 50%, #FEC85E 100%)'
              : 'linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #EC4899 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            border: '3px solid rgba(255,255,255,0.6)',
            boxShadow: hoveredCard === 'play'
              ? '0 15px 50px rgba(245, 158, 11, 0.5), 0 0 60px rgba(236, 72, 153, 0.4)'
              : '0 10px 40px rgba(245, 158, 11, 0.4), 0 0 30px rgba(236, 72, 153, 0.3)',
            padding: 'clamp(0.875rem, 2.5vw, 1.25rem) clamp(1.5rem, 4vw, 2rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'play' ? 'scale(1.03)' : 'scale(1)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(0.5rem, 2vw, 0.75rem)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Animated shine effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: hoveredCard === 'play' ? '100%' : '-100%',
            width: '50%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            transition: 'left 0.6s ease',
            pointerEvents: 'none'
          }} />
          
          <div style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            filter: hoveredCard === 'play' ? 'brightness(1.3) drop-shadow(0 0 20px rgba(255,255,255,0.8))' : 'brightness(1)',
            transition: 'all 0.3s',
            animation: hoveredCard === 'play' ? 'playPulse 1s ease-in-out infinite' : 'none'
          }}>
            🎮
          </div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2rem)',
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,0.4)',
            margin: 0,
            letterSpacing: '0.05em'
          }}>
            {t('home.play')}
          </h2>
        </button>
      </div>

      {/* Footer — legal */}
      <div style={{ marginTop: 'auto', paddingTop: '24px', paddingBottom: '8px' }}>
        <a
          href="/privacy"
          style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', textDecoration: 'none' }}
        >
          Privacy
        </a>
      </div>

      {/* Play button animation styles */}
      <style>{`
        @keyframes titleShimmer {
          0% { background-position: 200% center; }
          100% { background-position: 0% center; }
        }
        @keyframes playPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* About Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />

      {/* Ask Anton — embedded artist Q&A (ask.gestura.art) */}
      <AskAntonModal
        isOpen={showAskAntonModal}
        onClose={() => setShowAskAntonModal(false)}
      />

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(4px)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowTermsModal(false)}
          >
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '700px',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                color: '#fff'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
                  📄 {t('terms.title')}
                </h2>
                <button
                  onClick={() => setShowTermsModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.9)' }}>
                <p style={{ marginBottom: '16px' }}>
                  <strong>{t('terms.lastUpdated.label')}</strong> {t('terms.lastUpdated.date')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.acceptance.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.acceptance.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.license.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.license.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.userContent.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.userContent.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.accountSecurity.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.accountSecurity.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.privacy.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.privacy.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.disclaimer.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.disclaimer.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.liability.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.liability.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.modifications.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.modifications.content')}
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  {t('terms.sections.contact.title')}
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  {t('terms.sections.contact.content')}
                </p>
                
                <div style={{ 
                  marginTop: '32px', 
                  paddingTop: '24px', 
                  borderTop: '1px solid rgba(255,255,255,0.2)',
                  textAlign: 'center'
                }}>
                  <button
                    onClick={() => setShowTermsModal(false)}
                    style={{
                      padding: '12px 32px',
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    {t('terms.understand')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HomePage;
