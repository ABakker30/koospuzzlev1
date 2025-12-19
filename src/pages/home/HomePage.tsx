// Home Page - Clean landing screen with three main actions
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './HomePage.css';

// Comprehensive language list (alphabetically sorted)
const LANGUAGES = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'et', name: 'Estonian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'zh', name: 'Mandarin Chinese' },
  { code: 'mr', name: 'Marathi' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  
  // User preferences
  const [username, setUsername] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  
  // Load preferences from localStorage
  useEffect(() => {
    const savedUsername = localStorage.getItem('user_preferences_username');
    const savedLanguage = localStorage.getItem('user_preferences_language');
    if (savedUsername) setUsername(savedUsername);
    if (savedLanguage) setPreferredLanguage(savedLanguage);
  }, []);

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
      paddingTop: 'clamp(1.5rem, 5vh, 3rem)',
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
                      Signed in as
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
                      ⚙️ Preferences
                    </div>
                    
                    {/* Username Field */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => {
                          const newUsername = e.target.value;
                          setUsername(newUsername);
                          localStorage.setItem('user_preferences_username', newUsername);
                        }}
                        placeholder="Enter your username"
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
                        Preferred Language
                      </label>
                      <select
                        value={preferredLanguage}
                        onChange={(e) => {
                          const newLanguage = e.target.value;
                          setPreferredLanguage(newLanguage);
                          localStorage.setItem('user_preferences_language', newLanguage);
                        }}
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
                        {LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code} style={{ background: '#000', color: '#fff' }}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
                    <span>Terms & Conditions</span>
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
        fontSize: 'clamp(1.75rem, 6vw, 2.75rem)',
        fontWeight: 800,
        margin: 'clamp(0.25rem, 1.5vh, 1rem) 0 clamp(0.25rem, 1vh, 0.75rem) 0',
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
        fontSize: 'clamp(0.9rem, 2vw, 1.05rem)',
        color: 'rgba(255,255,255,0.95)',
        textShadow: '0 2px 10px rgba(0,0,0,0.2)',
        marginBottom: 'clamp(1.5rem, 4vh, 2.5rem)',
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 280px))',
        justifyContent: 'center',
        gap: 'clamp(0.75rem, 2vw, 1.25rem)',
        width: '100%',
        maxWidth: '1200px',
        padding: '0 clamp(0.75rem, 2vw, 1.5rem)',
        marginBottom: 'clamp(1rem, 3vh, 2rem)'
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
            padding: 'clamp(1rem, 2.5vw, 1.75rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'solve' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(0.5rem, 1.5vw, 0.875rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            filter: hoveredCard === 'solve' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(102,126,234,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            🧩
          </div>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            Solve a Puzzle
          </h2>
          <p style={{
            fontSize: 'clamp(0.875rem, 2vw, 1rem)',
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
            padding: 'clamp(1rem, 2.5vw, 1.75rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'create' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(0.5rem, 1.5vw, 0.875rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            filter: hoveredCard === 'create' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(118,75,162,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            🎨
          </div>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            Create a Puzzle
          </h2>
          <p style={{
            fontSize: 'clamp(0.875rem, 2vw, 1rem)',
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
            padding: 'clamp(1rem, 2.5vw, 1.75rem)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: hoveredCard === 'solutions' ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(0.5rem, 1.5vw, 0.875rem)',
            textAlign: 'center'
          }}
        >
          <div style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            filter: hoveredCard === 'solutions' ? 'brightness(1.2) drop-shadow(0 0 20px rgba(240,147,251,0.8))' : 'brightness(1)',
            transition: 'all 0.3s'
          }}>
            💡
          </div>
          <h2 style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 4px 15px rgba(0,0,0,0.3)',
            margin: 0
          }}>
            View Solutions
          </h2>
          <p style={{
            fontSize: 'clamp(0.875rem, 2vw, 1rem)',
            color: 'rgba(255,255,255,0.9)',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            lineHeight: 1.6,
            margin: 0
          }}>
            Explore how others have solved puzzles and get inspired
          </p>
        </div>
      </div>

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
                  📄 Terms & Conditions
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
                  ×
                </button>
              </div>
              
              <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.9)' }}>
                <p style={{ marginBottom: '16px' }}>
                  <strong>Last Updated:</strong> December 19, 2025
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  1. Acceptance of Terms
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  By accessing and using KOOS Puzzle, you accept and agree to be bound by the terms and provisions of this agreement. 
                  If you do not agree to these terms, please do not use this service.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  2. Use License
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  Permission is granted to temporarily use KOOS Puzzle for personal, non-commercial purposes. This license shall automatically 
                  terminate if you violate any of these restrictions and may be terminated by KOOS Puzzle at any time.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  3. User Content
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  Users may create and share puzzle designs and solutions. You retain ownership of your content but grant KOOS Puzzle 
                  a license to display and distribute your content within the platform. You are responsible for ensuring your content 
                  does not violate any laws or infringe on others' rights.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  4. Account Security
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately 
                  of any unauthorized use of your account.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  5. Privacy Policy
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  Your privacy is important to us. We collect minimal personal information necessary for account functionality. 
                  Your email address and puzzle data are stored securely and will not be shared with third parties without your consent.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  6. Disclaimer
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  KOOS Puzzle is provided "as is" without any warranties, expressed or implied. We do not warrant that the service 
                  will be uninterrupted, timely, secure, or error-free.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  7. Limitation of Liability
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  In no event shall KOOS Puzzle be liable for any damages arising out of the use or inability to use the service, 
                  including but not limited to data loss or service interruptions.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  8. Modifications to Terms
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes 
                  acceptance of the modified terms.
                </p>
                
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: '#fff' }}>
                  9. Contact Information
                </h3>
                <p style={{ marginBottom: '16px' }}>
                  For questions about these Terms & Conditions, please contact us through the support channels provided in the application.
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
                    I Understand
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
