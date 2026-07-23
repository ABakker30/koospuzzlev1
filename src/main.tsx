import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { AppBootstrapProvider } from './providers/AppBootstrapProvider.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'
import { initErrorTracking, initAnalytics } from './lib/observability'
import { initInstallService } from './services/installService'
import { checkForWedgedServiceWorker, installResumeUpdateCheck } from './utils/swRecovery'
import './index.css'

// Performance benchmark utility (available on window.runSolverBenchmark)
import './utils/solverBenchmark'

// Opt-in observability (no-op until env keys are set).
initErrorTracking();
initAnalytics();

// Capture beforeinstallprompt early so we can offer PWA install after a win.
initInstallService();

// Self-heal clients whose service worker is stuck on a stale bundle
// (fire-and-forget; reloads at most once per deploy if wedged). Installed
// PWAs resumed from the background never navigate, so the same checks also
// run on every return to visibility (rate-limited).
checkForWedgedServiceWorker();
installResumeUpdateCheck();

// The bundle is running, so the stale-edge-HTML retry loop (index.html)
// succeeded — reset its attempt counter for future deploys this session.
try { sessionStorage.removeItem('koos-bundle-retry'); } catch { /* ignore */ }

// One-time cleanup: older builds cached all Supabase responses; cross-origin
// (opaque) Storage entries got padded to ~8MB each and ballooned Cache storage
// to ~400MB, blowing the quota on low-disk machines. Runtime caching is now
// removed, but the stale named cache won't self-delete — drop it on startup.
if ('caches' in window) {
  caches.delete('supabase-cache').catch(() => { /* ignore */ });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode disabled temporarily - causes SceneCanvas pieces to disappear on double-mount
  // <React.StrictMode>
    <RootErrorBoundary>
      <AuthProvider>
        <AppBootstrapProvider>
          <App />
        </AppBootstrapProvider>
      </AuthProvider>
    </RootErrorBoundary>
  // </React.StrictMode>,
)
