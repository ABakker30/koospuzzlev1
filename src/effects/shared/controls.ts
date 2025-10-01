// OrbitControls utilities for camera-mode safety
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function setControlsEnabled(controls: OrbitControls, enabled: boolean) {
  controls.enabled = enabled;
  // Optional: prevent wheel/pan during play without disabling full control
  // controls.enableZoom = enabled;
  // controls.enablePan  = enabled;
  // controls.enableRotate = enabled;
}
