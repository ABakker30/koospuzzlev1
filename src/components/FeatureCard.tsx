import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface FeatureCardProps {
  title: string;
  subtitle: string;
  access: 'public' | 'private';
  to: string;
  ctaLabel: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  subtitle,
  access,
  to,
  ctaLabel,
}) => {
  const { isLoggedIn } = useAuth();
  const isAccessible = access === 'public' || isLoggedIn;
  const displayCtaLabel = access === 'private' && !isLoggedIn ? 'Sign in required' : ctaLabel;

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '1.5rem',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '180px',
    height: 'auto',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: 'auto',
    padding: '0.75rem 1rem',
    backgroundColor: isAccessible ? '#007bff' : '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: isAccessible ? 'pointer' : 'not-allowed',
    fontSize: '0.9rem',
    textDecoration: 'none',
    textAlign: 'center',
    display: 'block',
  };

  return (
    <div 
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', color: '#333', fontSize: '1.25rem' }}>{title}</h3>
      <p style={{ margin: '0 0 1.5rem 0', color: '#666', flexGrow: 1, lineHeight: '1.5' }}>{subtitle}</p>
      {isAccessible ? (
        <Link to={to} style={buttonStyle}>
          {displayCtaLabel}
        </Link>
      ) : (
        <button style={buttonStyle} disabled>
          {displayCtaLabel}
        </button>
      )}
    </div>
  );
};

export default FeatureCard;
