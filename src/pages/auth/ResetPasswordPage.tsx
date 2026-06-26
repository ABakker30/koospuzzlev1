// Reset / set password page. Reached from the password-reset email link;
// Supabase establishes a recovery session from the URL, then the user sets
// a new password here via supabase.auth.updateUser({ password }).
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  backgroundColor: 'rgba(255,255,255,0.2)',
  border: '2px solid rgba(255,255,255,0.4)',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      // No recovery session usually means the link expired or was already used.
      setError(
        /Auth session missing|session/i.test(err.message || '')
          ? 'This reset link has expired or was already used. Request a new one from the login page.'
          : err.message || 'Could not update password.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '16px',
          padding: '28px',
          color: '#fff',
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: '1.4rem', textAlign: 'center' }}>Set your password</h1>

        {done ? (
          <p style={{ textAlign: 'center', color: '#a7f3d0' }}>
            ✓ Password updated. Signing you in…
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              style={{ ...inputStyle, marginBottom: '12px' }}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              style={{ ...inputStyle, marginBottom: '16px' }}
            />
            {error && (
              <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: '0 0 12px 0' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={isSaving}
              style={{
                width: '100%',
                padding: '0.9rem',
                fontSize: '1rem',
                fontWeight: 700,
                background: isSaving
                  ? 'rgba(255,107,107,0.5)'
                  : 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem' }}>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)',
              textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
