import React from 'react';

const ContentStudioPage: React.FC = () => {
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
        Content Studio - Create videos and images from your puzzles for sharing and documentation. 
        Generate high-quality renders and animations of your puzzle solutions.
      </p>
    </div>
  );
};

export default ContentStudioPage;
