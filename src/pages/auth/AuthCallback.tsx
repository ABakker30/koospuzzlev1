// Auth Callback - Handles magic link authentication
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing magic link...');

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    console.log('🔄 Starting auth callback...');
    
    try {
      // Add timeout protection (30 seconds to allow for session establishment)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout - please try again')), 30000)
      );

      const authPromise = (async () => {
        console.log('📡 Exchanging auth code from URL...');
        console.log('Full URL:', window.location.href);
        console.log('URL Hash:', window.location.hash);
        console.log('URL Search:', window.location.search);
        
        // Check for error in URL hash (e.g., expired link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        
        const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
        const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
        const code = searchParams.get('code'); // PKCE flow uses 'code' parameter
        
        console.log('Parsed params:', { 
          hasCode: !!code,
          errorCode,
          errorDesc,
          code: code?.substring(0, 20) + '...'
        });
        
        // Handle expired or invalid magic link
        if (errorCode === 'otp_expired') {
          throw new Error('Magic link has expired. Please request a new one. (Links expire after 60 seconds)');
        }
        
        if (errorCode) {
          throw new Error(errorDesc || 'Authentication failed. Please try again.');
        }
        
        if (!code) {
          throw new Error('Invalid magic link format. Please request a new one.');
        }
        
        console.log('✅ Valid auth code detected');
        
        // Skip the hanging exchangeCodeForSession call
        // Instead, redirect to a URL that includes the code, and let Supabase handle it automatically
        // This works because Supabase's client automatically processes auth codes on page load
        
        console.log('🔄 Redirecting to gallery with auth code...');
        
        // Redirect to gallery - Supabase will automatically exchange the code
        window.location.href = `/gallery?code=${code}`;
        
        // Return to prevent further execution
        return;
        
        // Just redirect to movie gallery - the AuthContext will pick up the session
        // from the URL hash automatically
        setStatus('success');
        setMessage('Login successful! Taking you to the gallery...');
        
        setTimeout(() => {
          // Remove the hash from URL and redirect to gallery
          window.location.href = '/gallery';
        }, 1000);
      })();

      // Race between auth and timeout
      await Promise.race([authPromise, timeoutPromise]);

    } catch (error: any) {
      console.error('❌ Auth callback error:', error);
      setStatus('error');
      setMessage(error.message || 'Authentication failed. Please try again.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        padding: '3rem',
        border: '3px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center'
      }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ 
              fontSize: '2rem', 
              marginBottom: '1rem', 
              color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              Verifying Login
            </h2>
            <p style={{ 
              fontSize: '1.1rem', 
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
              {message}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ 
              fontSize: '2rem', 
              marginBottom: '1rem', 
              color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              Success!
            </h2>
            <p style={{ 
              fontSize: '1.1rem', 
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 2px 8px rgba(0,0,0,0.2)',
              marginBottom: '2rem'
            }}>
              {message}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>❌</div>
            <h2 style={{ 
              fontSize: '2rem', 
              marginBottom: '1rem', 
              color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              Oops!
            </h2>
            <p style={{ 
              fontSize: '1.1rem', 
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 2px 8px rgba(0,0,0,0.2)',
              marginBottom: '2rem'
            }}>
              {message}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(255,107,107,0.4)',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
