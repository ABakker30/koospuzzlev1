// swRecovery — self-healing for wedged service workers.
//
// Normal updates are handled by the SW itself (registerType: 'autoUpdate').
// But a client whose SW got stuck (e.g. the old storage-quota trap: precache
// install fails, old SW keeps serving a stale bundle forever) never heals on
// its own — the user is trapped on months-old code until they manually clear
// site data. This module detects that state and fixes it:
//
//   1. Compare the bundle's baked-in build stamp (__BUILD_TS__) with the
//      server's freshly-fetched /version.json (never cached).
//   2. First mismatch → ask the SW to update (the gentle path) and remember
//      the attempt.
//   3. Mismatch AGAIN on a later load with a newer server stamp → the SW is
//      wedged: unregister all workers, delete all caches, hard reload once.
//
// Loop protection: at most one hard reload per server stamp (tracked in
// localStorage), so a broken deploy can't reload-loop clients.

declare const __BUILD_TS__: number;

const ATTEMPT_KEY = 'swRecovery';

export async function checkForWedgedServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { ts } = (await res.json()) as { ts?: number };
    if (!ts || ts <= __BUILD_TS__) return; // we ARE the current build (or newer)

    const prev = JSON.parse(localStorage.getItem(ATTEMPT_KEY) ?? 'null') as
      | { serverTs: number; stage: 'updated' | 'reloaded' }
      | null;

    if (!prev || prev.serverTs !== ts) {
      // First sighting of this newer build: gentle path — SW update check.
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ serverTs: ts, stage: 'updated' }));
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.update()));
      return;
    }

    if (prev.stage === 'updated') {
      // Still stale after an update attempt — the worker is wedged. Nuke it.
      console.error('[swRecovery] stale bundle persisted; clearing service worker + caches');
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ serverTs: ts, stage: 'reloaded' }));
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
      window.location.reload();
    }
    // stage === 'reloaded': already tried the hard path for this server build —
    // don't loop; the next deploy resets the cycle.
  } catch {
    /* offline or fetch failed — never break the app over recovery */
  }
}

// ---------------------------------------------------------------------------
// Resume-time updates. An installed (home-screen) PWA that is RESUMED from
// the background never navigates, so it never triggers the SW's update check
// nor the wedge check above — phones sat on old bundles forever (observed in
// the 2026-07-23 field test). On every return to visibility (rate-limited),
// ask the SW to check for a new build and re-run the wedge check; the
// registerType:'autoUpdate' flow then applies any update it finds.
// ---------------------------------------------------------------------------
const RESUME_CHECK_MIN_INTERVAL_MS = 60_000;
let lastResumeCheck = 0;

export function installResumeUpdateCheck(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastResumeCheck < RESUME_CHECK_MIN_INTERVAL_MS) return;
    lastResumeCheck = now;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.allSettled(regs.map((r) => r.update())))
      .catch(() => {});
    void checkForWedgedServiceWorker();
  });
}
