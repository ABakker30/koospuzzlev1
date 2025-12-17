import type { StudioSettings } from '../types/studio';

/**
 * Predefined environment presets for consistent visual styles
 * Extracted from user-created presets in the manual solve page
 */

const BASE_PRESET: StudioSettings = {
  camera: {
    fovDeg: 35,
    orthoZoom: 1,
    projection: 'perspective'
  },
  effect: {
    id: 'none',
    export: {
      aspect: 'landscape',
      quality: 'medium',
      resolution: '1080p'
    },
    output: {
      export: false,
      screen: true
    },
    durationSec: 3
  },
  lights: {
    hdr: {
      envId: 'studio',
      enabled: true,
      intensity: 1.5 // Will be overridden per preset
    },
    shadows: {
      enabled: true, // Will be overridden per preset
      intensity: 1
    },
    brightness: 2.7,
    directional: [1, 0.8, 0.6, 0.4, 0.2],
    backgroundColor: '#000000' // Will be overridden per preset
  },
  material: {
    color: '#ffffff',
    opacity: 1,
    metalness: 1, // Will be overridden per preset
    roughness: 0  // Will be overridden per preset
  },
  emptyCells: {
    customMaterial: {
      color: '#4a4a4a',
      opacity: 0.48,
      metalness: 0.02,
      roughness: 0
    },
    linkToEnvironment: false
  }
};

export const ENVIRONMENT_PRESETS: Record<string, StudioSettings> = {
  'metallic-light': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 1.5 },
      shadows: { enabled: true, intensity: 1 },
      backgroundColor: '#ffffff'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 1,
      roughness: 0
    },
    emptyCells: {
      customMaterial: {
        color: '#4a4a4a',
        opacity: 0.48,
        metalness: 0.02,
        roughness: 0
      },
      linkToEnvironment: false
    }
  },
  
  'metallic-dark': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 1.5 },
      shadows: { enabled: true, intensity: 1 },
      backgroundColor: '#000000'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 1,
      roughness: 0
    },
    emptyCells: {
      customMaterial: {
        color: '#4a4a4a',
        opacity: 0.48,
        metalness: 0.02,
        roughness: 0
      },
      linkToEnvironment: false
    }
  },
  
  'shiny-light': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 1.0 },
      shadows: { enabled: false, intensity: 1 },
      backgroundColor: '#ffffff'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 0,
      roughness: 0
    },
    emptyCells: {
      customMaterial: {
        color: '#4a4a4a',
        opacity: 0.59,
        metalness: 0.78,
        roughness: 0.4
      },
      linkToEnvironment: false
    },
    sphereColorTheme: 'default'
  },
  
  'shiny-dark': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 1.0 },
      shadows: { enabled: false, intensity: 1 },
      backgroundColor: '#000000'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 0,
      roughness: 0
    },
    emptyCells: {
      customMaterial: {
        color: '#4a4a4a',
        opacity: 0.59,
        metalness: 0.78,
        roughness: 0.4
      },
      linkToEnvironment: false
    },
    sphereColorTheme: 'default'
  },
  
  'matte-light': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 0.4 },
      shadows: { enabled: false, intensity: 1 },
      backgroundColor: '#ffffff'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 0,
      roughness: 0.48
    },
    emptyCells: {
      customMaterial: {
        color: '#978c8c',
        opacity: 0.68,
        metalness: 0,
        roughness: 0.57
      },
      linkToEnvironment: false
    },
    sphereColorTheme: 'default'
  },
  
  'matte-dark': {
    ...BASE_PRESET,
    lights: {
      ...BASE_PRESET.lights,
      hdr: { envId: 'studio', enabled: true, intensity: 0.4 },
      shadows: { enabled: false, intensity: 1 },
      backgroundColor: '#000000'
    },
    material: {
      ...BASE_PRESET.material,
      metalness: 0,
      roughness: 0.48
    },
    emptyCells: {
      customMaterial: {
        color: '#a8a4a4',
        opacity: 0.7,
        metalness: 0,
        roughness: 0.44
      },
      linkToEnvironment: false
    },
    sphereColorTheme: 'default'
  }
};

export const PRESET_LABELS: Record<string, string> = {
  'metallic-light': 'Metallic Light',
  'metallic-dark': 'Metallic Dark',
  'shiny-light': 'Shiny Light',
  'shiny-dark': 'Shiny Dark',
  'matte-light': 'Matte Light',
  'matte-dark': 'Matte Dark'
};

export const PRESET_ORDER = [
  'metallic-light',
  'metallic-dark',
  'shiny-light',
  'shiny-dark',
  'matte-light',
  'matte-dark'
];
