import React from 'react';
import { useAuth } from '../auth/AuthContext';

const Header: React.FC = () => {
  const { isLoggedIn, login, logout } = useAuth();

  return (
    <header style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1rem 2rem',
      borderBottom: '1px solid #e0e0e0',
      backgroundColor: '#fff'
    }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>
        Koos Puzzle v1
      </h1>
      <button
        onClick={isLoggedIn ? logout : login}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: isLoggedIn ? '#dc3545' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9rem'
        }}
      >
        {isLoggedIn ? 'Logout' : 'Login'}
      </button>
    </header>
  );
};

export default Header;
