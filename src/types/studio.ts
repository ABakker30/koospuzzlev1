// Content Studio types based on Build-Ready Spec v1

export type MaterialSettings = {
  color: string;        // "#RRGGBB"
  metalness: number;    // 0..1
  roughness: number;    // 0..1
};

export type LightSettings = {
  brightness: number;   // global brightness multiplier
  directional: number[]; // 5 directional light intensities (0..2)
  hdr: { enabled: boolean; envId?: string; intensity: number }; // envId key into HDR library, intensity 0..2
};

export type CameraSettings = {
  projection: "perspective" | "orthographic";
  fovDeg: number;       // used if perspective
  orthoZoom: number;    // used if orthographic
};

export type EffectId = "none" | "orbitSweep" | "explode" | "ripple" | "sparkle";

export type EffectCommon = {
  durationSec: number;
  output: { screen: boolean; export: boolean };
  export: {
    aspect: "square" | "portrait" | "landscape";
    resolution: "720p" | "1080p" | "4k";
    quality: "low" | "medium" | "high";
  };
};

export type EffectParams =
  | { id: "none" }
  | { id: "orbitSweep"; arcDeg: number; ease: number }
  | { id: "explode"; magnitude: number; ease: number; holdSec: number }
  | { id: "ripple"; amplitude: number; wavelength: number; speed: number }
  | { id: "sparkle"; frequency: number; amplitude: number };

export type StudioSettings = {
  material: MaterialSettings;
  lights: LightSettings;
  camera: CameraSettings;
  effect: EffectParams & EffectCommon;
};

// Video library entry
export type VideoEntry = {
  id: string; 
  createdAt: string;
  name: string;
  settings: StudioSettings; // snapshot used to render
  blobUrl: string; // saved video URL
};

// Default settings
export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  material: {
    color: "#ffffff",
    metalness: 0.8,
    roughness: 0.3
  },
  lights: {
    brightness: 1.0,
    directional: [1.0, 0.8, 0.6, 0.4, 0.2], // 5 directional light intensities
    hdr: { enabled: false, intensity: 1.0 }
  },
  camera: {
    projection: "perspective",
    fovDeg: 50,
    orthoZoom: 1.0
  },
  effect: {
    id: "none",
    durationSec: 3.0,
    output: { screen: true, export: false },
    export: {
      aspect: "landscape",
      resolution: "1080p",
      quality: "medium"
    }
  }
};
