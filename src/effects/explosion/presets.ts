// Explosion Effect Presets and Validation

export interface ExplosionConfig {
  schemaVersion: number;
  durationSec: number;
  loop: boolean;
  pauseBetweenLoops: number;
  maxExplosionFactor: number;
  rotationEnabled: boolean;
  rotationDegrees: number;
  rotationEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  explosionEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface ExplosionPreset {
  name: string;
  config: ExplosionConfig;
  createdAt: string;
}

const PRESETS_KEY = 'explosion_presets_v1';

// Default configuration
export const DEFAULT_CONFIG: ExplosionConfig = {
  schemaVersion: 1,
  durationSec: 20.0,
  loop: true,
  pauseBetweenLoops: 2.0,
  maxExplosionFactor: 0.65,
  rotationEnabled: true,
  rotationDegrees: 180,
  rotationEasing: 'ease-in-out',
  explosionEasing: 'ease-in-out'
};

// Load all presets from localStorage
export function loadPresets(): ExplosionPreset[] {
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
    console.warn('🔧 Explosion: Failed to load presets:', error);
    return [];
  }
}

// Save preset to localStorage
export function savePreset(name: string, config: ExplosionConfig): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    const newPreset: ExplosionPreset = {
      name: name.trim(),
      config: { ...config },
      createdAt: new Date().toISOString()
    };
    
    filtered.push(newPreset);
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('💾 Explosion: Preset saved:', { name, config });
  } catch (error) {
    console.error('❌ Explosion: Failed to save preset:', error);
    throw new Error('Failed to save preset');
  }
}

// Delete preset from localStorage
export function deletePreset(name: string): void {
  try {
    const presets = loadPresets();
    const filtered = presets.filter(p => p.name !== name);
    
    localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    console.log('🗑️ Explosion: Preset deleted:', name);
  } catch (error) {
    console.error('❌ Explosion: Failed to delete preset:', error);
    throw new Error('Failed to delete preset');
  }
}

// Validate configuration
export function validateConfig(config: Partial<ExplosionConfig>): { isValid: boolean; errors: Record<string, string> } {
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
  
  // Max explosion factor validation
  if (typeof config.maxExplosionFactor !== 'number' || config.maxExplosionFactor < 0) {
    errors.maxExplosionFactor = 'Explosion factor must be 0 or greater';
  } else if (config.maxExplosionFactor > 10) {
    errors.maxExplosionFactor = 'Explosion factor cannot exceed 10';
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
  
  // Explosion easing validation
  if (!config.explosionEasing || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(config.explosionEasing)) {
    errors.explosionEasing = 'Explosion easing must be one of: linear, ease-in, ease-out, ease-in-out';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
