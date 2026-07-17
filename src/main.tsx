import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { AppBootstrapProvider } from './providers/AppBootstrapProvider.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'
import { initErrorTracking, initAnalytics } from './lib/observability'
import { initInstallService } from './services/installService'
import { checkForWedgedServiceWorker } from './utils/swRecovery'
import './index.css'

// Performance benchmark utility (available on window.runSolverBenchmark)
import './utils/solverBenchmark'

// Opt-in observability (no-op until env keys are set).
initErrorTracking();
initAnalytics();

// Capture beforeinstallprompt early so we can offer PWA install after a win.
initInstallService();

// Self-heal clients whose service worker is stuck on a stale bundle
// (fire-and-forget; reloads at most once per deploy if wedged).
checkForWedgedServiceWorker();

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
