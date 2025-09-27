import React from 'react';

const ShapeEditorPage: React.FC = () => {
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
        Shape Editor - Create and edit 3D puzzle shapes with an intuitive interface. 
        Design custom puzzle pieces and export them for solving.
      </p>
    </div>
  );
};

export default ShapeEditorPage;
