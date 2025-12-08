// Login Page - Simple email-only magic link authentication
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  // Load remembered email from localStorage
  const [email, setEmail] = useState(() => {
    return localStorage.getItem('rememberedEmail') || '';
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Send magic link via Supabase
      console.log('📤 Attempting to send magic link to:', email);
      // Use default values for existing user login
      await login(email, email.split('@')[0], 'English', true, false);
      
      // Save email to localStorage for next time
      localStorage.setItem('rememberedEmail', email);
      
      console.log('✅ Magic link request completed successfully');
      setSuccess(true);
      setIsLoading(false);
    } catch (err: any) {
      console.error('❌ Login error:', err);
      
      // Show more helpful error messages
      if (err.message?.includes('rate limit')) {
        setError('Please wait 60 seconds before requesting another magic link.');
      } else if (err.message?.includes('Email rate limit')) {
        setError('Too many requests. Please wait a few minutes and try again.');
      } else {
        setError(err.message || 'Failed to send magic link. Please try again.');
      }
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100dvh',
        width: '100%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0'
      }}>
        <div style={{
          maxWidth: '500px',
          width: 'calc(100vw - 2rem)',
          margin: '1rem',
          backgroundColor: 'rgba(255,255,255,0.25)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: 'clamp(1.5rem, 5vw, 3rem)',
          textAlign: 'center',
          border: '3px solid rgba(255,255,255,0.4)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✉️</div>
          <h2 style={{
            fontSize: '2rem',
            marginBottom: '1rem',
            color: '#fff',
            textShadow: '0 2px 10px rgba(0,0,0,0.3)'
          }}>
            Check Your Email
          </h2>
          <p style={{
            fontSize: '1.1rem',
            color: 'rgba(255,255,255,0.95)',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            marginBottom: '2rem',
            lineHeight: '1.6'
          }}>
            We've sent a magic link to <strong>{email}</strong>
            <br />
            Click the link in your email to sign in.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.3)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.5)',
              boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.5)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0'
    }}>
      <div style={{
        maxWidth: '500px',
        width: 'calc(100vw - 2rem)',
        margin: '1rem',
        backgroundColor: 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        padding: 'clamp(1.5rem, 5vw, 3rem)',
        border: '3px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          marginBottom: '0.5rem',
          color: '#fff',
          textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(255,255,255,0.3)',
          textAlign: 'center'
        }}>
          Welcome to KOOS
        </h1>
        <p style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.95)',
          textShadow: '0 2px 8px rgba(0,0,0,0.2)',
          marginBottom: '2rem',
          fontSize: '0.95rem'
        }}>
          Enter your email to sign in
        </p>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '1rem',
            backgroundColor: 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(239,68,68,0.5)',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            color: '#ef4444'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email Field */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)'
            }}>
              Email Address *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.4)',
                boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
              onBlur={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              fontWeight: 600,
              background: isLoading ? 'rgba(255,107,107,0.5)' : 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
              boxShadow: '0 8px 24px rgba(255,107,107,0.4)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'transform 0.2s',
              opacity: isLoading ? 0.7 : 1
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.transform = 'scale(1)')}
          >
            {isLoading ? 'Sending Magic Link...' : 'Continue with Email'}
          </button>

          <p style={{
            marginTop: '1.5rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.5)'
          }}>
            We'll send you a magic link to sign in without a password
          </p>
        </form>

        {/* Create Account Link */}
        <p style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: 'rgba(255,255,255,0.8)'
        }}>
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/signup')}
            style={{
              background: 'none',
              border: 'none',
              color: '#feca57',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: 0
            }}
          >
            Create Account
          </button>
        </p>

        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            marginTop: '1rem',
            padding: '0.75rem',
            fontSize: '1rem',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255,255,255,0.4)',
            boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.color = '#fff';
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
