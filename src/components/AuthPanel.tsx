// src/components/AuthPanel.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthPanel() {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check current session
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Subscribe to auth changes
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signInWithEmail() {
    if (!email) {
      alert('Please enter an email');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });
    setLoading(false);

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      alert('Magic link sent! Check your email.');
      setEmail('');
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    setLoading(false);

    if (error) {
      alert(`Error: ${error.message}`);
    }
  }

  async function signOut() {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }

  if (user) {
    return (
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6'
      }}>
        <span style={{ fontSize: '14px', color: '#495057' }}>
          ✓ Signed in as <strong>{user.email}</strong>
        </span>
        <button 
          onClick={signOut}
          disabled={loading}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            cursor: 'pointer'
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: '12px 16px',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #dee2e6'
    }}>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyPress={e => e.key === 'Enter' && signInWithEmail()}
        disabled={loading}
        style={{
          padding: '6px 12px',
          fontSize: '14px',
          borderRadius: '4px',
          border: '1px solid #ced4da',
          minWidth: '250px'
        }}
      />
      <button
        onClick={signInWithEmail}
        disabled={loading || !email}
        style={{
          padding: '6px 12px',
          fontSize: '14px',
          borderRadius: '4px',
          border: '1px solid #007bff',
          backgroundColor: '#007bff',
          color: '#fff',
          cursor: 'pointer',
          opacity: loading || !email ? 0.6 : 1
        }}
      >
        {loading ? 'Sending...' : 'Send magic link'}
      </button>
      <button
        onClick={signInWithGoogle}
        disabled={loading}
        style={{
          padding: '6px 12px',
          fontSize: '14px',
          borderRadius: '4px',
          border: '1px solid #4285f4',
          backgroundColor: '#4285f4',
          color: '#fff',
          cursor: 'pointer',
          opacity: loading ? 0.6 : 1
        }}
      >
        Sign in with Google
      </button>
    </div>
  );
}
