import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ActiveStateProvider } from './context/ActiveStateContext';
import CreatePage from './pages/create/CreatePage-clean';
import SolvePage from './pages/solve/SolvePage';
import GalleryPage from './pages/gallery/GalleryPage';
import TurntableMoviePage from './pages/movies/TurntableMoviePage';

function App() {
  return (
    <ActiveStateProvider>
      <Router>
        <Routes>
          {/* Redirect root to gallery */}
          <Route path="/" element={<Navigate to="/gallery" replace />} />
          
          {/* Core Routes - Social Puzzle Platform */}
          <Route path="/gallery" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#0a0a0a' }}>
              <GalleryPage />
            </div>
          } />
          <Route path="/create" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#1a1a1a' }}>
              <CreatePage />
            </div>
          } />
          <Route path="/solve/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <SolvePage />
            </div>
          } />
          <Route path="/solution/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <SolvePage />
            </div>
          } />
          
          {/* Movie Pages - Blueprint v2: One effect = one page */}
          <Route path="/movies/turntable/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <TurntableMoviePage />
            </div>
          } />
        </Routes>
      </Router>
    </ActiveStateProvider>
  );
}

export default App;
