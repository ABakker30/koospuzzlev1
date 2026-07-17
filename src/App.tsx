import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ActiveStateProvider } from './context/ActiveStateContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UpdateNotification } from './components/UpdateNotification';
import { RouteAnalytics } from './components/RouteAnalytics';
import { InstallAppPrompt } from './components/InstallAppPrompt';
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import AuthCallback from './pages/auth/AuthCallback';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import CreatePage from './pages/create/CreatePage-clean';
// REMOVED: ManualSolvePage - consolidated into GamePage
import { ManualGamePage } from './pages/solve/ManualGamePage';
import { AutoSolvePage } from './pages/solve/AutoSolvePage';
import GalleryPage from './pages/gallery/GalleryPage';
import { PuzzleViewerPage } from './pages/puzzle-viewer/PuzzleViewerPage';
// Movie pages removed - system simplified to focus on solutions
// import TurntableMoviePage from './pages/movies/TurntableMoviePage';
// import { GravityMovieViewPage } from './pages/movies/GravityMovieViewPage';
// import GravityMoviePage from './pages/movies/GravityMoviePage';
// import RevealMoviePage from './pages/movies/RevealMoviePage';
// import ExplosionMoviePage from './pages/movies/ExplosionMoviePage';
// import OrbitMoviePage from './pages/movies/OrbitMoviePage';
import PuzzleLeaderboardPage from './pages/leaderboards/PuzzleLeaderboardPage';
import { SolutionsPage } from './pages/analyze/AnalyzeSolutionPage';
// REMOVED: KoosPuzzleAssemblyPage - assembly/physics system deprecated
// REMOVED: PhysicsTest - test page deprecated
import WorkerDlxTestPage from './dev/WorkerDlxTestPage';
import { PuzzleViewSandboxPage } from './pages/puzzle-viewer/PuzzleViewSandboxPage';
import { GamePage } from './game/ui/GamePage';
import { ChallengePage } from './pages/challenge/ChallengePage';
import { NotFoundPage } from './pages/NotFoundPage';
import PrivacyPage from './pages/PrivacyPage';
import AdminPage from './pages/admin/AdminPage';
import PrototypePage from './pages/PrototypePage';
import ChallengeRulesPage from './pages/ChallengeRulesPage';

// Admin-only route guard — non-admins get the plain 404 (the route doesn't
// advertise its existence). Used for the auto-solver: machine solving is a
// management tool and must not be reachable by players (it would trivialize
// leaderboards and discovery challenges).
function AdminOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user?.is_admin) return <NotFoundPage />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <ActiveStateProvider>
        <Router>
          <RouteAnalytics />
          <UpdateNotification />
          <InstallAppPrompt />
          <Routes>
          {/* Home Page - Landing page with featured content */}
          <Route path="/" element={<HomePage />} />
          
          {/* Authentication */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          
          {/* Core Routes - Social Puzzle Platform */}
          <Route path="/gallery" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#0a0a0a' }}>
              <GalleryPage />
            </div>
          } />
          
          {/* Puzzle Viewer - Full-screen 3D preview with action buttons */}
          <Route path="/puzzles/:puzzleId/view" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <PuzzleViewerPage />
            </div>
          } />
          
          <Route path="/create" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#1a1a1a' }}>
              <CreatePage />
            </div>
          } />
          {/* GamePage: unified game page with PvP support */}
          <Route path="/game/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <GamePage />
            </div>
          } />
          {/* Legacy manual game route */}
          <Route path="/manual/:id" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <ManualGamePage />
            </div>
          } />
          <Route path="/auto/:id" element={
            <AdminOnly>
              <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
                <AutoSolvePage />
              </div>
            </AdminOnly>
          } />
          
          {/* Leaderboards - Speed and efficiency rankings */}
          <Route path="/leaderboards/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#0a0a0a' }}>
              <PuzzleLeaderboardPage />
            </div>
          } />
          
          {/* Analyze Solution - Interactive exploration with reveal/explosion */}
          <Route path="/solutions/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <SolutionsPage />
            </div>
          } />
          
          {/* KOOS Puzzle Sandbox - Geometry Verification Only */}
          <Route path="/view-sandbox/:solutionId" element={<PuzzleViewSandboxPage />} />
          <Route path="/sandbox/:solutionId" element={<PuzzleViewSandboxPage />} />
          
          {/* Unified Game Page - Phase 1 */}
          <Route path="/play" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <GamePage />
            </div>
          } />
          <Route path="/play/:puzzleId" element={
            <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#000' }}>
              <GamePage />
            </div>
          } />
          
          {/* Challenge landing — /c/:id (solution UUID for now; short codes later) */}
          <Route path="/c/:id" element={<ChallengePage />} />

          {/* Privacy policy — standalone URL for legal/analytics disclosures */}
          <Route path="/privacy" element={<PrivacyPage />} />

          {/* Admin dashboard — renders 404 for non-admins */}
          <Route path="/admin" element={<AdminPage />} />

          {/* Physical prototype — gallery, build updates, interest register */}
          <Route path="/prototype" element={<PrototypePage />} />

          {/* Discovery Challenge official rules */}
          <Route path="/challenge-rules" element={<ChallengeRulesPage />} />

          {/* Dev/Test Routes — excluded from production builds */}
          {import.meta.env.DEV && (
            <Route path="/dev/worker-test" element={<WorkerDlxTestPage />} />
          )}
          
          {/* Movie routes removed - system simplified to focus on solutions */}
          {/* Use /solutions/:puzzleId for solution viewing */}

          {/* Catch-all — friendly fallback instead of a white screen */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </ActiveStateProvider>
    </AuthProvider>
  );
}

export default App;
