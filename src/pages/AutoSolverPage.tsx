import React from 'react';

const AutoSolverPage: React.FC = () => {
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
        Auto Solver - Generate solutions automatically using advanced algorithms. 
        Let the AI solve complex puzzles and discover optimal solution paths.
      </p>
    </div>
  );
};

export default AutoSolverPage;
