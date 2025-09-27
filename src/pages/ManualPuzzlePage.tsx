import React from 'react';

const ManualPuzzlePage: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#333' }}>
        Coming Next
      </h1>
      <p style={{ fontSize: '1.2rem', color: '#666', maxWidth: '600px' }}>
        Manual Puzzle - Interactive puzzle solving experience with drag-and-drop controls. 
        Challenge yourself with hands-on puzzle solving in a 3D environment.
      </p>
    </div>
  );
};

export default ManualPuzzlePage;
