// Home Page - Clean landing screen with three main actions
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useAppBootstrap } from '../../providers/AppBootstrapProvider';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { AboutModal } from '../../components/AboutModal';
import { ComingSoonModal } from '../gallery/modals/ComingSoonModal';
import { HomeAIChatModal } from '../../components/HomeAIChatModal';
import { getHomeThought, type HomeThought } from '../../ai/homeThoughtService';
import { getRecentSolutionThumbnails } from '../../api/solutions';
import './HomePage.css';

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useAppBootstrap();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showAIChatModal, setShowAIChatModal] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [dailyPromptMessage, setDailyPromptMessage] = useState<string | null>(null);
  const [showMobileAppModal, setShowMobileAppModal] = useState(false);
  const [homeThought, setHomeThought] = useState<HomeThought | null>(null);
  const [thoughtLoading, setThoughtLoading] = useState(true);
  
  // Slideshow state
  const [slideshowImages, setSlideshowImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  
  // Saved preferences
  const [username, setUsername] = useState('');
  
  // Temporary edit state (not saved until Save button clicked)
  const [editedUsername, setEditedUsername] = useState('');
  const [editedLanguage, setEditedLanguage] = useState(language);
  
  // Load AI-generated thought for the session
  useEffect(() => {
    const loadThought = async () => {
      setThoughtLoading(true);
      try {
        const thought = await getHomeThought(language);
        setHomeThought(thought);
      } catch (error) {
        console.error('Failed to load home thought:', error);
        // Fallback is handled by getHomeThought
      } finally {
        setThoughtLoading(false);
      }
    };
    loadThought();
  }, [language]);

  // Load username from localStorage
  useEffect(() => {
    const savedUsername = localStorage.getItem('user_preferences_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setEditedUsername(savedUsername);
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
        const images = await getRecentSolutionThumbnails(5);
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
    // Save username
    setUsername(editedUsername);
    localStorage.setItem('user_preferences_username', editedUsername);
    
    // Save language
    if (editedLanguage !== language) {
      await setLanguage(editedLanguage);
    }
    
    // Show saved confirmation
    setShowSavedMessage(true);
    setTimeout(() => setShowSavedMessage(false), 2000);
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
        {/* App Store Button */}
        <button
          onClick={() => setShowMobileAppModal(true)}
          style={{
            padding: '0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
          title="iOS App Store (Coming Soon)"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
        </button>

        {/* Play Store Button */}
        <button
          onClick={() => setShowMobileAppModal(true)}
          style={{
            padding: '0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
          title="Google Play Store (Coming Soon)"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
          </svg>
        </button>

        {/* Three-Dot Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenuDropdown(!showMenuDropdown)}
            style={{
              padding: '0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.opacity = '1';
            }}
            title="Menu"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <circle cx="12" cy="5" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="19" r="2"/>
            </svg>
          </button>

          {/* Three-Dot Menu Dropdown */}
          {showMenuDropdown && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9998
                }}
                onClick={() => setShowMenuDropdown(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '16px',
                  padding: '8px',
                  minWidth: '200px',
                  boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4), 0 0 0 1px rgba(255,255,255,0.1)',
                  zIndex: 9999
                }}
              >
                {/* Info Menu Item */}
                <button
                  onClick={() => {
                    setShowAboutModal(true);
                    setShowMenuDropdown(false);
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
                    marginBottom: '4px'
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
                  <span>ℹ️</span>
                  <span>{t('button.info')}</span>
                </button>

                {/* AI Chat Menu Item */}
                <button
                  onClick={() => {
                    setShowAIChatModal(true);
                    setShowMenuDropdown(false);
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
                  <span>🤖</span>
                  <span>AI Chat</span>
                </button>
              </div>
            </>
          )}
        </div>
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
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
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
                    
                    {/* Save Button */}
                    <button
                      onClick={handleSavePreferences}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
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

      {/* AI Chat Modal */}
      <HomeAIChatModal
        isOpen={showAIChatModal}
        onClose={() => {
          setShowAIChatModal(false);
          setDailyPromptMessage(null);
        }}
        initialUserMessage={dailyPromptMessage || undefined}
        autoSend={!!dailyPromptMessage}
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

      {/* Mobile App Coming Soon Modal */}
      <ComingSoonModal
        isOpen={showMobileAppModal}
        onClose={() => setShowMobileAppModal(false)}
        featureName="Mobile Apps"
        description="Native iOS and Android apps are currently under development. Soon you'll be able to solve puzzles on the go!"
        icon="📱"
      />
    </div>
  );
};

export default HomePage;
