// installService — PWA "install at the peak" prompt plumbing.
//
// Chrome/Edge/Android fire `beforeinstallprompt` early in the page lifecycle;
// we stash it so the app can trigger the real install dialog later, at an
// emotional peak (right after a win) instead of on arrival. iOS has no
// prompt API, so eligible iOS visitors get an instructions variant instead.
//
// initInstallService() must run at module-init time (imported from main.tsx)
// or the beforeinstallprompt event fires before we listen.

import { track } from '../lib/observability';

const OFFER_EVENT = 'koos:install-offer';
const LAST_OFFER_KEY = 'koos_install_last_offer';
const OFFER_COUNT_KEY = 'koos_install_offer_count';
const INSTALLED_KEY = 'koos_installed';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // re-offer at most every 14 days
const MAX_OFFERS = 3; // then stop asking forever

// Chrome's non-standard event; not in lib.dom.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function initInstallService(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    // Chromium only fires this when the app is NOT installed. If we recorded
    // an install earlier, the user has since removed it — reset the offer
    // budget so the install-at-the-peak prompt can come back.
    try {
      if (localStorage.getItem(INSTALLED_KEY)) {
        localStorage.removeItem(INSTALLED_KEY);
        localStorage.removeItem(LAST_OFFER_KEY);
        localStorage.removeItem(OFFER_COUNT_KEY);
        track('pwa_uninstall_detected');
      }
    } catch { /* storage unavailable */ }
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try {
      localStorage.setItem(INSTALLED_KEY, '1');
    } catch { /* storage unavailable */ }
    track('pwa_installed');
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag
    (navigator as any).standalone === true
  );
}

export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; distinguish by touch support
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** True when we have a real install dialog to show (Chromium browsers). */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Show the browser's install dialog. Resolves to the user's choice. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferredPrompt;
  if (!evt) return 'unavailable';
  deferredPrompt = null; // the event is single-use
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  track('pwa_install_prompt_result', { outcome });
  return outcome;
}

/**
 * Called at a peak moment (e.g. a win). Decides eligibility and, when
 * eligible, asks the mounted <InstallAppPrompt /> to appear via a window
 * event. Silent no-op otherwise.
 */
export function offerInstallAtPeak(source: string): void {
  if (isStandalone()) return; // already installed
  if (!canPromptInstall() && !isIOS()) return; // browser can't install (e.g. Firefox)

  const count = Number(localStorage.getItem(OFFER_COUNT_KEY) || '0');
  if (count >= MAX_OFFERS) return;
  const last = Number(localStorage.getItem(LAST_OFFER_KEY) || '0');
  if (Date.now() - last < COOLDOWN_MS) return;

  localStorage.setItem(LAST_OFFER_KEY, String(Date.now()));
  localStorage.setItem(OFFER_COUNT_KEY, String(count + 1));
  track('pwa_install_offered', { source });
  window.dispatchEvent(new CustomEvent(OFFER_EVENT, { detail: { source } }));
}

/** Subscribe to offer requests (used by InstallAppPrompt). */
export function onInstallOffer(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(OFFER_EVENT, listener);
  return () => window.removeEventListener(OFFER_EVENT, listener);
}
