import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { InfoModal } from './InfoModal';

const Header: React.FC = () => {
  const { isLoggedIn, login, logout } = useAuth();
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        alignItems: 'center', 
        padding: '1rem 2rem',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#fff',
        gap: '0.75rem'
      }}>
        <button
          onClick={() => setShowAbout(true)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          About
        </button>
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

      {/* About Modal */}
      <InfoModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        title="About KOOS Puzzle"
      >
        <div style={{ lineHeight: '1.8', fontSize: '1.05rem' }}>
          <p style={{ 
            marginTop: 0, 
            padding: '1rem', 
            backgroundColor: '#f0f9ff', 
            borderRadius: '8px', 
            borderLeft: '4px solid #2196F3',
            fontSize: '1.1rem',
            fontWeight: 500
          }}>
            Where geometry meets creativity in 3D space
          </p>

          <h3 style={{ color: '#2196F3', marginTop: '1.5rem' }}>The Story</h3>
          <p>
            The KOOS Puzzle is a fascinating 3D packing puzzle that challenges your spatial reasoning and geometric intuition. 
            At its heart lies a deceptively simple question: <em>How can we fill a three-dimensional space using specific polyhedral pieces?</em>
          </p>

          <p>
            Each puzzle begins with a <strong>shape</strong>—a container defined by cells arranged in a face-centered cubic (FCC) lattice. 
            Your mission is to discover how to perfectly pack this space using a collection of <strong>pieces</strong>, each composed 
            of four connected spheres forming unique tetrahedra.
          </p>

          <h3 style={{ color: '#2196F3', marginTop: '1.5rem' }}>The Challenge</h3>
          <p>
            What makes KOOS puzzles particularly intriguing is their computational complexity. While some solutions can be found 
            through careful manual placement, others require sophisticated search algorithms to explore millions of possible 
            configurations. Yet when a solution is found, the elegant way pieces interlock in 3D space feels almost inevitable.
          </p>

          <h3 style={{ color: '#2196F3', marginTop: '1.5rem' }}>The Journey</h3>
          <p>
            Whether you're an artist creating beautiful 3D visualizations in the Content Studio, a puzzle enthusiast manually 
            solving challenges piece by piece, or a computational explorer letting the Auto Solver search through vast solution 
            spaces—KOOS Puzzle offers something unique.
          </p>

          <p style={{ 
            marginBottom: 0,
            padding: '1rem', 
            backgroundColor: '#fff3e0', 
            borderRadius: '8px', 
            borderLeft: '4px solid #ff9800',
            fontStyle: 'italic'
          }}>
            "In the intersection of art and play, we discover not just solutions—but new ways of seeing space itself."
          </p>
        </div>
      </InfoModal>
    </>
  );
};

export default Header;
