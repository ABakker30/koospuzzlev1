// Cross-page environment preset carry-over.
//
// Choosing an environment preset on any page makes it "the latest setting":
// the next page opened starts with it, and can itself change it (which then
// carries forward again). One global key holds the latest choice; each
// page's legacy per-page key keeps being written for back-compat and acts
// as a fallback for users who picked a preset before this existed.
import { ENVIRONMENT_PRESETS } from '../constants/environmentPresets';
import type { StudioSettings } from '../types/studio';

const GLOBAL_KEY = 'app.environmentPreset';

/** Latest carried preset key, or '' when none/unknown. */
export function loadCarriedPreset(legacyKey?: string): string {
  try {
    const k =
      localStorage.getItem(GLOBAL_KEY) ||
      (legacyKey ? localStorage.getItem(legacyKey) : null);
    return k && ENVIRONMENT_PRESETS[k] ? k : '';
  } catch {
    return '';
  }
}

/** Settings of the latest carried preset, or null when none. */
export function carriedPresetSettings(legacyKey?: string): StudioSettings | null {
  const k = loadCarriedPreset(legacyKey);
  return k ? ENVIRONMENT_PRESETS[k] : null;
}

/** Record a preset choice as the latest setting (carries to the next page). */
export function saveCarriedPreset(presetKey: string, legacyKey?: string): void {
  try {
    localStorage.setItem(GLOBAL_KEY, presetKey);
    if (legacyKey) localStorage.setItem(legacyKey, presetKey);
  } catch {
    // storage unavailable — carry-over just doesn't persist
  }
}
