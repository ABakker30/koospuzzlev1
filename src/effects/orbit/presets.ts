// Orbit presets - localStorage helpers (namespaced)

import { OrbitConfig, OrbitPreset } from './types';

const PRESETS_KEY = 'orbit_presets_v1';

// Default configuration
export const DEFAULT_CONFIG: OrbitConfig = {
  schemaVersion: 1,
  durationSec: 10.0,
  loop: false,
  mode: 'free',
  lockTargetToCentroid: true,
  keys: [],
  finalize: 'leaveAsEnded'
};

// Load all presets from localStorage
export function loadPresets(): OrbitPreset[] {
  try {
    const stored = localStorage.getItem(PRESETS_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.filter(preset => 
      preset && 
      typeof preset.name === 'string' && 
      preset.config && 
      typeof preset.createdAt === 'string'
    );
  } catch (error) {
    console.warn('🎥 Orbit: Failed to load presets:', error);
    return [];
  }
}

// Save preset to localStorage
export function savePreset(name: string, config: OrbitConfig): void {
  try {
    const presets = loadPresets();
    
    // Remove existing preset with same name
    const filtered = presets.filter(p => p.name !== name);
    
    // Add new preset
    const newPreset: OrbitPreset = {
      name: name.trim(),
      config: { ...config },
      createdAt: new Date().toISOString()
    };
    
    filtered.push(newPreset);
    
    // Sort by creation date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('💾 Orbit: Preset saved:', { name, config });
  } catch (error) {
    console.error('❌ Orbit: Failed to save preset:', error);
    throw new Error('Failed to save preset');
  }
}

// Delete preset from localStorage
export function deletePreset(name: string): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('🗑️ Orbit: Preset deleted:', name);
  } catch (error) {
    console.error('❌ Orbit: Failed to delete preset:', error);
    throw new Error('Failed to delete preset');
  }
}

// Validation messages (copy-paste ready)
export const VALIDATION_MESSAGES = {
  DURATION_INVALID: "Duration must be greater than 0.",
  MIN_KEYFRAMES: "Need at least 2 keyframes.",
  TIME_RANGE: "Keyframe times must be within 0…Duration.",
  TIME_ORDER: "Keyframe times must be non-decreasing (use \"Distribute times evenly\").",
  IDENTICAL_KEYS: "Consecutive keyframes are identical; adjust positions (and targets if unlocked).",
  NO_CENTROID: "Load a shape to compute centroid for Orbit-Locked mode."
};

// Validate configuration
export function validateConfig(config: Partial<OrbitConfig>, centroid?: [number, number, number]): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  // Duration validation
  if (typeof config.durationSec !== 'number' || config.durationSec <= 0) {
    errors.durationSec = VALIDATION_MESSAGES.DURATION_INVALID;
  }
  
  // Keyframes validation
  if (!config.keys || config.keys.length < 2) {
    errors.keys = VALIDATION_MESSAGES.MIN_KEYFRAMES;
  } else {
    // Check keyframe times
    const keys = config.keys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.t !== undefined) {
        if (key.t < 0 || key.t > (config.durationSec || 0)) {
          errors.keyTimes = VALIDATION_MESSAGES.TIME_RANGE;
          break;
        }
        if (i > 0 && keys[i-1].t !== undefined && key.t < keys[i-1].t!) {
          errors.keyTimes = VALIDATION_MESSAGES.TIME_ORDER;
          break;
        }
      }
    }
    
    // Check for identical consecutive keyframes
    for (let i = 1; i < keys.length; i++) {
      const prev = keys[i-1];
      const curr = keys[i];
      const posMatch = prev.pos[0] === curr.pos[0] && prev.pos[1] === curr.pos[1] && prev.pos[2] === curr.pos[2];
      const targetMatch = !config.lockTargetToCentroid && prev.target && curr.target && 
        prev.target[0] === curr.target[0] && prev.target[1] === curr.target[1] && prev.target[2] === curr.target[2];
      
      if (posMatch && (config.lockTargetToCentroid || targetMatch)) {
        errors.identicalKeys = VALIDATION_MESSAGES.IDENTICAL_KEYS;
        break;
      }
    }
  }
  
  // Mode validation
  if (config.mode === 'locked' && !centroid) {
    errors.centroid = VALIDATION_MESSAGES.NO_CENTROID;
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
