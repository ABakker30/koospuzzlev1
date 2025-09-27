import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import ShapeEditorPage from './pages/ShapeEditorPage';
import SolutionViewerPage from './pages/SolutionViewerPage';
import AutoSolverPage from './pages/AutoSolverPage';
import ManualPuzzlePage from './pages/ManualPuzzlePage';
import ContentStudioPage from './pages/ContentStudioPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isLoggedIn } = useAuth();
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <>
        <Navigate to="/" replace />
        {showMessage && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            border: '1px solid #f5c6cb',
            zIndex: 1000
          }}>
            Sign in required.
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shape" element={<ShapeEditorPage />} />
            <Route path="/solutions" element={<SolutionViewerPage />} />
            <Route path="/autosolver" element={
              <ProtectedRoute>
                <AutoSolverPage />
              </ProtectedRoute>
            } />
            <Route path="/manual" element={
              <ProtectedRoute>
                <ManualPuzzlePage />
              </ProtectedRoute>
            } />
            <Route path="/studio" element={
              <ProtectedRoute>
                <ContentStudioPage />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
