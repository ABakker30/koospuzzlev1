import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import ShapeEditorPage from './pages/ShapeEditorPage';
import SolutionViewerPage from './pages/SolutionViewerPage';
import AutoSolverPage from './pages/AutoSolverPage';
import AutoSolvePage from './pages/AutoSolve';
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
      <Routes>
        <Route path="/" element={
          <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#f8f9fa' }}>
            <Header />
            <main style={{ width: '100%' }}>
              <HomePage />
            </main>
          </div>
        } />
        <Route path="/shape" element={<ShapeEditorPage />} />
        <Route path="/solutions" element={
          <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#f8f9fa' }}>
            <main style={{ width: '100%' }}>
              <SolutionViewerPage />
            </main>
          </div>
        } />
        <Route path="/autosolver" element={
          <ProtectedRoute>
            <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
              <Header />
              <main>
                <AutoSolverPage />
              </main>
            </div>
          </ProtectedRoute>
        } />
        <Route path="/auto-solve" element={
          <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#f8f9fa' }}>
            <AutoSolvePage />
          </div>
        } />
        <Route path="/manual" element={
          <ProtectedRoute>
            <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
              <Header />
              <main>
                <ManualPuzzlePage />
              </main>
            </div>
          </ProtectedRoute>
        } />
        <Route path="/studio" element={
          <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#f8f9fa' }}>
            <main style={{ width: '100%' }}>
              <ContentStudioPage />
            </main>
          </div>
        } />
        <Route path="/" element={
          <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#f8f9fa' }}>
            <Header />
            <main style={{ width: '100%' }}>
              <HomePage />
            </main>
          </div>
        } />
      </Routes>
    </Router>
  );
}

export default App;
