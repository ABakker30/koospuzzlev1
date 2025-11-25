import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ActiveStateProvider } from './context/ActiveStateContext';
import { UpdateNotification } from './components/UpdateNotification';
import CreatePage from './pages/create/CreatePage-clean';
import { ManualSolvePage } from './pages/solve/ManualSolvePage';
import { AutoSolvePage } from './pages/solve/AutoSolvePage';
import GalleryPage from './pages/gallery/GalleryPage';
import TurntableMoviePage from './pages/movies/TurntableMoviePage';
import GravityMoviePage from './pages/movies/GravityMoviePage';
import RevealMoviePage from './pages/movies/RevealMoviePage';
import ExplosionMoviePage from './pages/movies/ExplosionMoviePage';
import OrbitMoviePage from './pages/movies/OrbitMoviePage';
import SolutionViewerPage from './pages/solution-viewer/SolutionViewerPage';

function App() {
  return (
    <ActiveStateProvider>
      <Router>
        <UpdateNotification />
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
          <Route path="/manual/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <ManualSolvePage />
            </div>
          } />
          <Route path="/auto/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <AutoSolvePage />
            </div>
          } />
          
          {/* Solution Viewer - Clean viewing without effects */}
          <Route path="/viewer/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <SolutionViewerPage />
            </div>
          } />
          
          {/* Movie Pages - Blueprint v2: One effect = one page */}
          <Route path="/movies/turntable/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <TurntableMoviePage />
            </div>
          } />
          <Route path="/movies/gravity/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <GravityMoviePage />
            </div>
          } />
          <Route path="/movies/reveal/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <RevealMoviePage />
            </div>
          } />
          <Route path="/movies/explosion/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <ExplosionMoviePage />
            </div>
          } />
          <Route path="/movies/orbit/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <OrbitMoviePage />
            </div>
          } />
        </Routes>
      </Router>
    </ActiveStateProvider>
  );
}

export default App;
