// Turn Table presets - localStorage helpers (namespaced)

export interface TurnTableConfig {
  schemaVersion: number;
  durationSec: number;
  degrees: number;
  direction: 'cw' | 'ccw';
  mode: 'camera' | 'object';
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  finalize: 'leaveAsEnded' | 'returnToStart' | 'snapToPose';
  preserveControls?: boolean; // Keep orbit controls enabled during playback (for gallery movies)
}

export interface TurnTablePreset {
  name: string;
  config: TurnTableConfig;
  createdAt: string; // ISO string
}

const PRESETS_KEY = 'tt_presets_v1';

// Default configuration
export const DEFAULT_CONFIG: TurnTableConfig = {
  schemaVersion: 1,
  durationSec: 8.0,
  degrees: 360,
  direction: 'cw',
  mode: 'camera',
  easing: 'linear',
  finalize: 'leaveAsEnded'
};

// Load all presets from localStorage
export function loadPresets(): TurnTablePreset[] {
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
    console.warn('🔧 TurnTable: Failed to load presets:', error);
    return [];
  }
}

// Save preset to localStorage
export function savePreset(name: string, config: TurnTableConfig): void {
  try {
    const presets = loadPresets();
    
    // Remove existing preset with same name
    const filtered = presets.filter(p => p.name !== name);
    
    // Add new preset
    const newPreset: TurnTablePreset = {
      name: name.trim(),
      config: { ...config },
      createdAt: new Date().toISOString()
    };
    
    filtered.push(newPreset);
    
    // Sort by creation date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('💾 TurnTable: Preset saved:', { name, config });
  } catch (error) {
    console.error('❌ TurnTable: Failed to save preset:', error);
    throw new Error('Failed to save preset');
  }
}

// Delete preset from localStorage
export function deletePreset(name: string): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('🗑️ TurnTable: Preset deleted:', name);
  } catch (error) {
    console.error('❌ TurnTable: Failed to delete preset:', error);
    throw new Error('Failed to delete preset');
  }
}

// Validate configuration
export function validateConfig(config: Partial<TurnTableConfig>): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  // Duration validation
  if (typeof config.durationSec !== 'number' || config.durationSec <= 0) {
    errors.durationSec = 'Duration must be greater than 0';
  } else if (config.durationSec > 600) {
    errors.durationSec = 'Duration cannot exceed 10 minutes (600 seconds)';
  }
  
  // Degrees validation
  if (typeof config.degrees !== 'number' || !Number.isFinite(config.degrees)) {
    errors.degrees = 'Degrees must be a finite number';
  } else if (Math.abs(config.degrees) > 100000) {
    errors.degrees = 'Degrees must be between -100,000 and 100,000';
  }
  
  // Direction validation
  if (!config.direction || !['cw', 'ccw'].includes(config.direction)) {
    errors.direction = 'Direction must be "cw" or "ccw"';
  }
  
  // Mode validation
  if (!config.mode || !['camera', 'object'].includes(config.mode)) {
    errors.mode = 'Mode must be "camera" or "object"';
  }
  
  // Easing validation
  if (!config.easing || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(config.easing)) {
    errors.easing = 'Easing must be one of: linear, ease-in, ease-out, ease-in-out';
  }
  
  // Finalize validation
  if (!config.finalize || !['leaveAsEnded', 'returnToStart', 'snapToPose'].includes(config.finalize)) {
    errors.finalize = 'Finalize must be one of: leaveAsEnded, returnToStart, snapToPose';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
