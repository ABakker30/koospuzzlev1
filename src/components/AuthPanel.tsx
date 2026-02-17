// src/components/AuthPanel.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit() {
    if (!email || !password) {
      setMessage('Please enter email and password');
      return;
    }

    setLoading(true);
    setMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Account created! You can now sign in.');
        setIsSignUp(false);
        setPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setMessage(error.message);
      }
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
      flexDirection: 'column',
      gap: '8px',
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #dee2e6'
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={loading}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            minWidth: '180px',
            flex: 1,
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          disabled={loading}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            minWidth: '140px',
            flex: 1,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          style={{
            padding: '6px 16px',
            fontSize: '14px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#007bff',
            color: '#fff',
            cursor: 'pointer',
            opacity: loading || !email || !password ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
          style={{
            padding: 0,
            fontSize: '13px',
            background: 'none',
            border: 'none',
            color: '#007bff',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {isSignUp ? 'Already have an account? Sign In' : 'No account? Sign Up'}
        </button>
        {message && (
          <span style={{ fontSize: '13px', color: message.includes('created') ? '#28a745' : '#dc3545' }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
