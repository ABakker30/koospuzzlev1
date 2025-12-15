// Content Studio Settings Service - localStorage persistence + named presets + database sync

import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'contentStudio_v2'; // Updated version to reset shadow defaults
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
      const serialized = JSON.stringify(settings);
      localStorage.setItem(STORAGE_KEY, serialized);
      console.log('💾 Settings saved successfully. Size:', serialized.length, 'bytes');
      
      // Verify save
      const verification = localStorage.getItem(STORAGE_KEY);
      if (verification === serialized) {
        console.log('✅ Save verified - settings persisted correctly');
      } else {
        console.error('❌ Save verification failed!');
      }
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
   * Merge stored settings with defaults to handle missing properties (DEEP merge)
   */
  private mergeWithDefaults(stored: Partial<StudioSettings>): StudioSettings {
    return {
      material: { ...DEFAULT_STUDIO_SETTINGS.material, ...stored.material },
      lights: {
        ...DEFAULT_STUDIO_SETTINGS.lights,
        ...stored.lights,
        // Deep merge nested objects
        hdr: stored.lights?.hdr 
          ? { ...DEFAULT_STUDIO_SETTINGS.lights.hdr, ...stored.lights.hdr }
          : DEFAULT_STUDIO_SETTINGS.lights.hdr,
        shadows: stored.lights?.shadows
          ? { ...DEFAULT_STUDIO_SETTINGS.lights.shadows, ...stored.lights.shadows }
          : DEFAULT_STUDIO_SETTINGS.lights.shadows,
        directional: stored.lights?.directional ?? DEFAULT_STUDIO_SETTINGS.lights.directional
      },
      camera: { ...DEFAULT_STUDIO_SETTINGS.camera, ...stored.camera },
      effect: { ...DEFAULT_STUDIO_SETTINGS.effect, ...(stored as any).effect },
      emptyCells: stored.emptyCells 
        ? {
            linkToEnvironment: stored.emptyCells.linkToEnvironment ?? DEFAULT_STUDIO_SETTINGS.emptyCells.linkToEnvironment,
            customMaterial: { ...DEFAULT_STUDIO_SETTINGS.emptyCells.customMaterial, ...stored.emptyCells.customMaterial }
          }
        : DEFAULT_STUDIO_SETTINGS.emptyCells
    };
  }

  /**
   * Load settings from database for a user
   * Returns null if not found or on error
   */
  async loadSettingsFromDB(userId: string): Promise<StudioSettings | null> {
    try {
      console.log('📥 Loading settings from DB for user:', userId);
      
      const { data, error } = await supabase
        .from('users')
        .select('studio_settings')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ Failed to load settings from DB:', error);
        return null;
      }

      if (data?.studio_settings) {
        console.log('✅ Settings loaded from DB');
        // Merge with defaults to handle schema changes
        return this.mergeWithDefaults(data.studio_settings);
      }

      console.log('ℹ️ No settings found in DB for user');
      return null;
    } catch (err) {
      console.error('❌ Error loading settings from DB:', err);
      return null;
    }
  }

  /**
   * Save settings to database for a user
   * Returns true on success, false on error
   */
  async saveSettingsToDB(userId: string, settings: StudioSettings): Promise<boolean> {
    try {
      console.log('💾 Saving settings to DB for user:', userId);
      
      const { error } = await supabase
        .from('users')
        .update({ studio_settings: settings })
        .eq('id', userId);

      if (error) {
        console.error('❌ Failed to save settings to DB:', error);
        return false;
      }

      console.log('✅ Settings saved to DB');
      return true;
    } catch (err) {
      console.error('❌ Error saving settings to DB:', err);
      return false;
    }
  }
}
