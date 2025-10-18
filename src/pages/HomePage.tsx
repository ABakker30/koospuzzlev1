import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page" style={{ 
      padding: '2rem 0', 
      width: '100vw', 
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 120px)'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '600px',
        padding: '2rem'
      }}>
        <h1 style={{ 
          fontSize: '3.5rem', 
          marginBottom: '1rem',
          color: '#333',
          fontWeight: '700'
        }}>
          KOOS Puzzle
        </h1>
        <p style={{
          fontSize: '1.25rem',
          color: '#666',
          marginBottom: '3rem',
          lineHeight: '1.6'
        }}>
          Create stunning 3D puzzle animations
        </p>
        
        <button
          onClick={() => navigate('/studio')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '1.5rem 3rem',
            fontSize: '1.5rem',
            fontWeight: '600',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 10px 30px rgba(102, 126, 234, 0.4)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(102, 126, 234, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(102, 126, 234, 0.4)';
          }}
        >
          <span style={{ fontSize: '2rem' }}>🧩</span>
          <span>Start Puzzling</span>
        </button>
      </div>
    </div>
  );
};

export default HomePage;
