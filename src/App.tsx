import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ActiveStateProvider } from './context/ActiveStateContext';
import { AuthProvider } from './context/AuthContext';
import { UpdateNotification } from './components/UpdateNotification';
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import AuthCallback from './pages/auth/AuthCallback';
import CreatePage from './pages/create/CreatePage-clean';
import { ManualSolvePage } from './pages/solve/ManualSolvePage';
import { ManualGamePage } from './pages/solve/ManualGamePage';
import { AutoSolvePage } from './pages/solve/AutoSolvePage';
import GalleryPage from './pages/gallery/GalleryPage';
import TurntableMoviePage from './pages/movies/TurntableMoviePage';
import { GravityMovieViewPage } from './pages/movies/GravityMovieViewPage';
import GravityMoviePage from './pages/movies/GravityMoviePage'; // Keep old page temporarily
import RevealMoviePage from './pages/movies/RevealMoviePage';
import ExplosionMoviePage from './pages/movies/ExplosionMoviePage';
import OrbitMoviePage from './pages/movies/OrbitMoviePage';
import SolutionViewerPage from './pages/solution-viewer/SolutionViewerPage';
import PuzzleLeaderboardPage from './pages/leaderboards/PuzzleLeaderboardPage';
import { AnalyzeSolutionPage } from './pages/analyze/AnalyzeSolutionPage';

function App() {
  return (
    <AuthProvider>
      <ActiveStateProvider>
        <Router>
          <UpdateNotification />
          <Routes>
          {/* Home Page - Landing page with featured content */}
          <Route path="/" element={<HomePage />} />
          
          {/* Authentication */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
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
          <Route path="/game/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <ManualGamePage />
            </div>
          } />
          <Route path="/auto/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <AutoSolvePage />
            </div>
          } />
          
          {/* Leaderboards - Speed and efficiency rankings */}
          <Route path="/leaderboards/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#0a0a0a' }}>
              <PuzzleLeaderboardPage />
            </div>
          } />
          
          {/* Solution Viewer - Clean viewing without effects */}
          <Route path="/viewer/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <SolutionViewerPage />
            </div>
          } />
          
          {/* Analyze Solution - Interactive exploration with reveal/explosion */}
          <Route path="/solutions/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <AnalyzeSolutionPage />
            </div>
          } />
          
          {/* Movie Pages - Blueprint v2: One effect = one page */}
          <Route path="/movies/turntable/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <TurntableMoviePage />
            </div>
          } />
          <Route path="/movies/gravity/:movieId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <GravityMovieViewPage />
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
    </AuthProvider>
  );
}

export default App;
