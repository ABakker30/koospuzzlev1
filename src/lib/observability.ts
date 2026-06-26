// Observability: error tracking (Sentry) + product analytics (PostHog).
//
// Both are OPT-IN via env vars and dynamically imported, so when the keys are
// absent (e.g. local dev, or before you've set up the accounts) this is a
// complete no-op with zero runtime cost — nothing loads, nothing sends.
//
// To enable, set in your build env / GitHub Secrets:
//   VITE_SENTRY_DSN     = https://...ingest.sentry.io/...
//   VITE_POSTHOG_KEY    = phc_...
//   VITE_POSTHOG_HOST   = https://us.i.posthog.com   (optional; this is the default)

type Props = Record<string, unknown>;

let sentry: typeof import('@sentry/react') | null = null;
let posthog: typeof import('posthog-js').default | null = null;

// ---------------------------------------------------------------------------
// Error tracking
// ---------------------------------------------------------------------------
export async function initErrorTracking(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      // Don't send default PII; we attach the user id explicitly on login.
      sendDefaultPii: false,
    });
    sentry = Sentry;
  } catch (err) {
    console.warn('Sentry init failed:', err);
  }
}

export function captureException(error: unknown, context?: Props): void {
  if (sentry) {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    console.error('[captureException]', error, context ?? '');
  }
}

// ---------------------------------------------------------------------------
// Product analytics
// ---------------------------------------------------------------------------
export async function initAnalytics(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  try {
    const mod = await import('posthog-js');
    const ph = mod.default;
    ph.init(key, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://us.i.posthog.com',
      capture_pageview: false,        // we send pageviews on route change
      disable_session_recording: true, // privacy-first default; enable later if wanted
      autocapture: true,
    });
    posthog = ph;
  } catch (err) {
    console.warn('PostHog init failed:', err);
  }
}

/** Track a named product event. No-op until analytics is configured. */
export function track(event: string, props?: Props): void {
  posthog?.capture(event, props);
}

/** Tie subsequent events to a user (call on login). */
export function identify(userId: string, traits?: Props): void {
  posthog?.identify(userId, traits);
  sentry?.setUser({ id: userId });
}

/** Clear identity (call on logout). */
export function resetUser(): void {
  posthog?.reset();
  sentry?.setUser(null);
}

/** Record a page view (call on route change). */
export function pageview(path: string): void {
  posthog?.capture('$pageview', { $current_url: window.location.origin + path });
}
