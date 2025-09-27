import React from 'react';

const SolutionViewerPage: React.FC = () => {
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
        Solution Viewer - Analyze and visualize puzzle solutions with interactive 3D views. 
        Step through solutions and understand the solving process.
      </p>
    </div>
  );
};

export default SolutionViewerPage;
