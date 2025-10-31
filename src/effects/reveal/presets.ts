// Reveal Effect Presets and Validation

export interface RevealConfig {
  schemaVersion: number;
  durationSec: number;
  loop: boolean;
  preserveControls?: boolean; // Keep orbit controls enabled during playback (for gallery movies)
  pauseBetweenLoops: number;
  rotationEnabled: boolean;
  rotationDegrees: number;
  rotationEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  revealEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface RevealPreset {
  name: string;
  config: RevealConfig;
  createdAt: string;
}

const PRESETS_KEY = 'reveal_presets_v1';

// Default configuration
export const DEFAULT_CONFIG: RevealConfig = {
  schemaVersion: 1,
  durationSec: 20.0,
  loop: true,
  pauseBetweenLoops: 1.0,
  rotationEnabled: true,
  rotationDegrees: 180,
  rotationEasing: 'ease-in-out',
  revealEasing: 'ease-in-out'
};

// Load all presets from localStorage
export function loadPresets(): RevealPreset[] {
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
    console.warn('🔧 Reveal: Failed to load presets:', error);
    return [];
  }
}

// Save preset to localStorage
export function savePreset(name: string, config: RevealConfig): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    const newPreset: RevealPreset = {
      name: name.trim(),
      config: { ...config },
      createdAt: new Date().toISOString()
    };
    
    filtered.push(newPreset);
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('💾 Reveal: Preset saved:', { name, config });
  } catch (error) {
    console.error('❌ Reveal: Failed to save preset:', error);
    throw new Error('Failed to save preset');
  }
}

// Delete preset from localStorage
export function deletePreset(name: string): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('🗑️ Reveal: Preset deleted:', name);
  } catch (error) {
    console.error('❌ Reveal: Failed to delete preset:', error);
    throw new Error('Failed to delete preset');
  }
}

// Validate configuration
export function validateConfig(config: Partial<RevealConfig>): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  // Duration validation
  if (typeof config.durationSec !== 'number' || config.durationSec <= 0) {
    errors.durationSec = 'Duration must be greater than 0';
  } else if (config.durationSec > 600) {
    errors.durationSec = 'Duration cannot exceed 10 minutes (600 seconds)';
  }
  
  // Pause validation
  if (typeof config.pauseBetweenLoops !== 'number' || config.pauseBetweenLoops < 0) {
    errors.pauseBetweenLoops = 'Pause must be 0 or greater';
  }
  
  // Rotation degrees validation
  if (config.rotationEnabled && (typeof config.rotationDegrees !== 'number' || !Number.isFinite(config.rotationDegrees))) {
    errors.rotationDegrees = 'Rotation degrees must be a finite number';
  } else if (config.rotationEnabled && Math.abs(config.rotationDegrees || 0) > 100000) {
    errors.rotationDegrees = 'Rotation degrees must be between -100,000 and 100,000';
  }
  
  // Rotation easing validation
  if (!config.rotationEasing || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(config.rotationEasing)) {
    errors.rotationEasing = 'Rotation easing must be one of: linear, ease-in, ease-out, ease-in-out';
  }
  
  // Reveal easing validation
  if (!config.revealEasing || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(config.revealEasing)) {
    errors.revealEasing = 'Reveal easing must be one of: linear, ease-in, ease-out, ease-in-out';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
