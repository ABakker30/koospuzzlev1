import * as THREE from 'three';

/**
 * CRITICAL SHADOW UTILITY
 * 
 * This function MUST be called from the lighting effect useEffect(..., [settings.lights])
 * NOT from geometry or initialization effects.
 * 
 * This pattern keeps getting lost during refactoring - always use this utility!
 */
export function updateShadowPlaneIntensity(
  shadowPlaneRef: React.RefObject<THREE.Mesh> | React.MutableRefObject<THREE.Mesh | undefined>,
  shadowIntensity: number
): void {
  if (!shadowPlaneRef.current || !(shadowPlaneRef.current.material instanceof THREE.ShadowMaterial)) {
    return;
  }

  // Shadow intensity slider controls shadow darkness (0.0 = invisible, 2.0 = very dark)
  const shadowOpacity = shadowIntensity * 0.4; // Scale 0-2 range to 0-0.8 opacity
  shadowPlaneRef.current.material.opacity = Math.max(0.05, shadowOpacity); // Minimum visibility
  shadowPlaneRef.current.material.needsUpdate = true;

  console.log(`🌑 Shadow intensity updated: ${shadowIntensity} → opacity ${shadowOpacity.toFixed(2)}`);
}

/**
 * Validate shadow system is properly wired
 */
export function validateShadowSystem(
  shadowPlaneRef: React.RefObject<THREE.Mesh> | React.MutableRefObject<THREE.Mesh | undefined>,
  keyLightRef: React.RefObject<THREE.DirectionalLight> | React.MutableRefObject<THREE.DirectionalLight | undefined>,
  shadowSettings: { enabled: boolean; intensity: number }
): boolean {
  const issues: string[] = [];

  if (!shadowPlaneRef.current) {
    issues.push('Shadow plane not found');
  } else if (!(shadowPlaneRef.current.material instanceof THREE.ShadowMaterial)) {
    issues.push('Shadow plane does not use ShadowMaterial');
  }

  if (!keyLightRef.current) {
    issues.push('Key light not found');
  } else if (!keyLightRef.current.castShadow && shadowSettings.enabled) {
    issues.push('Key light not casting shadows when shadows enabled');
  }

  if (issues.length > 0) {
    console.warn('🌑 Shadow system validation failed:', issues);
    return false;
  }

  console.log('🌑 Shadow system validation passed');
  return true;
}
