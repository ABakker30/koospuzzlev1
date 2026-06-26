import React from 'react';
import { captureException } from '../lib/observability';

interface State {
  hasError: boolean;
}

/**
 * Top-level error boundary: reports React render crashes to error tracking
 * and shows a recoverable fallback instead of a white screen.
 */
export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureException(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: '3rem' }}>😵</div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Something went wrong</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', maxWidth: '420px' }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px',
            padding: '12px 28px',
            fontSize: '1rem',
            fontWeight: 700,
            background: '#fff',
            color: '#764ba2',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
