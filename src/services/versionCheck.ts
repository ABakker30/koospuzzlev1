// Version check utility for cache invalidation and update notifications
import packageInfo from '../../package.json';

const CURRENT_VERSION = packageInfo.version;
const VERSION_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const VERSION_KEY = 'app_version';

/**
 * Get the current app version
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

/**
 * Check if a new version is available by comparing with stored version
 */
export function isNewVersionAvailable(): boolean {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  
  if (!storedVersion) {
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    return false;
  }
  
  return storedVersion !== CURRENT_VERSION;
}

/**
 * Update the stored version to current version
 */
export function updateStoredVersion(): void {
  localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
}

/**
 * Start periodic version check (for future version.json fetching)
 * Returns cleanup function
 */
export function startVersionCheck(onNewVersion: () => void): () => void {
  const checkVersion = () => {
    if (isNewVersionAvailable()) {
      onNewVersion();
    }
  };
  
  // Check immediately
  checkVersion();
  
  // Check periodically
  const intervalId = setInterval(checkVersion, VERSION_CHECK_INTERVAL);
  
  // Return cleanup function
  return () => clearInterval(intervalId);
}

/**
 * Force reload the app with cache cleared
 */
export function reloadWithCacheClear(): void {
  // Clear service worker caches if available
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }
  
  // Update stored version before reload
  updateStoredVersion();
  
  // Hard reload
  window.location.reload();
}
