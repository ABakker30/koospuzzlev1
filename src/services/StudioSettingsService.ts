// Content Studio Settings Service - localStorage persistence + named presets

import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';

const STORAGE_KEY = 'contentStudio_v1';
const PRESETS_KEY = 'contentStudio_presets_v1';

export interface NamedPreset {
  name: string;
  settings: StudioSettings;
  createdAt: string;
}

export class StudioSettingsService {
  
  /**
   * Load current settings from localStorage
   */
  loadSettings(): StudioSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      console.log('💾 Loading settings from localStorage:', stored ? 'found' : 'not found');
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('💾 Parsed settings:', parsed);
        // Merge with defaults to handle missing properties
        const merged = this.mergeWithDefaults(parsed);
        console.log('💾 Merged settings:', merged);
        return merged;
      }
    } catch (error) {
      console.warn('Failed to load studio settings:', error);
    }
    console.log('💾 Using default settings');
    return { ...DEFAULT_STUDIO_SETTINGS };
  }

  /**
   * Save current settings to localStorage
   */
  saveSettings(settings: StudioSettings): void {
    try {
      console.log('💾 Saving settings to localStorage:', settings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      console.log('💾 Settings saved successfully');
    } catch (error) {
      console.error('Failed to save studio settings:', error);
    }
  }

  /**
   * Load all named presets
   */
  loadPresets(): NamedPreset[] {
    try {
      const stored = localStorage.getItem(PRESETS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load presets:', error);
    }
    return [];
  }

  /**
   * Save a named preset
   */
  savePreset(name: string, settings: StudioSettings): void {
    try {
      const presets = this.loadPresets();
      const existingIndex = presets.findIndex(p => p.name === name);
      
      const preset: NamedPreset = {
        name,
        settings: { ...settings },
        createdAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        presets[existingIndex] = preset;
      } else {
        presets.push(preset);
      }

      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save preset:', error);
    }
  }

  /**
   * Delete a named preset
   */
  deletePreset(name: string): void {
    try {
      const presets = this.loadPresets();
      const filtered = presets.filter(p => p.name !== name);
      localStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  }

  /**
   * Merge stored settings with defaults to handle missing properties
   */
  private mergeWithDefaults(stored: Partial<StudioSettings>): StudioSettings {
    return {
      material: { ...DEFAULT_STUDIO_SETTINGS.material, ...stored.material },
      lights: { ...DEFAULT_STUDIO_SETTINGS.lights, ...stored.lights },
      camera: { ...DEFAULT_STUDIO_SETTINGS.camera, ...stored.camera },
      effect: { ...DEFAULT_STUDIO_SETTINGS.effect, ...(stored as any).effect }
    };
  }
}
