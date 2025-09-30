import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';
import type { StudioSettings } from '../types/studio';
import { HDRLoader } from '../services/HDRLoader';
import type { EffectCtx } from '../special-effects/_shared/types';
import { updateShadowPlaneIntensity, validateShadowSystem } from './utils/shadowUtils';

interface StudioCanvasProps {
  cells: IJK[];
  view: ViewTransforms;
  settings: StudioSettings;
  onSettingsChange: (settings: StudioSettings) => void;
  onContextReady?: (ctx: EffectCtx) => void;
}

// Helper: convert 4x4 numeric matrix to THREE.Matrix4
function mat4ToThree(M: number[][]): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.set(
    M[0][0], M[0][1], M[0][2], M[0][3],
    M[1][0], M[1][1], M[1][2], M[1][3],
    M[2][0], M[2][1], M[2][2], M[2][3],
    M[3][0], M[3][1], M[3][2], M[3][3]
  );
  return matrix;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  cells,
  view,
  settings,
  onSettingsChange,
  onContextReady
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Core
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();

  // Content
  const groupRef = useRef<THREE.Group>(); // parent group so we can offset model
  const instancedMeshRef = useRef<THREE.InstancedMesh>();
  const shadowPlaneRef = useRef<THREE.Mesh>();

  // Lights
  const ambientLightRef = useRef<THREE.AmbientLight>();
  const directionalLightsRef = useRef<THREE.DirectionalLight[]>([]);
  const keyLightRef = useRef<THREE.DirectionalLight>();
  const hdrLoaderRef = useRef<HDRLoader>();

  // Init once
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambient = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambient);

    const directionalLights = [
      new THREE.DirectionalLight(0xffffff, 1.0), // right
      new THREE.DirectionalLight(0xffffff, 0.8), // left
      new THREE.DirectionalLight(0xffffff, 0.6), // top (key)
      new THREE.DirectionalLight(0xffffff, 0.4), // bottom
      new THREE.DirectionalLight(0xffffff, 0.2), // front
    ];

    directionalLights[0].position.set(20, 0, 0);
    directionalLights[1].position.set(-20, 0, 0);
    directionalLights[2].position.set(30, 40, 30); // key light angled down
    directionalLights[3].position.set(0, -20, 0);
    directionalLights[4].position.set(0, 0, 20);

    directionalLights.forEach(l => scene.add(l));
    keyLightRef.current = directionalLights[2];

    // DEBUG: make sure the key light can actually cast a shadow regardless of settings
    const keyLight = keyLightRef.current!;
    keyLight.castShadow = true;
    keyLight.intensity = 2.0;                // << strong direct light so shadows are obvious
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.05;
    
    // console.log('🔴 DEBUG: Key light forced ON - intensity=2.0, castShadow=true');

    // HDR
    HDRLoader.resetInstance();
    const hdrLoader = HDRLoader.getInstance();
    hdrLoader.initializePMREMGenerator(renderer);
    hdrLoaderRef.current = hdrLoader;

    // Parent group for model (lets us offset to sit on plane)
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Ground plane at y = 0
    console.log('🌑 CREATION: Creating new shadow plane');
    const planeGeo = new THREE.PlaneGeometry(200, 200);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0; // <- canonical ground height
    plane.receiveShadow = true;
    scene.add(plane);
    shadowPlaneRef.current = plane;
    console.log('🌑 CREATION: Shadow plane created and assigned to ref');
    
    // console.log('🔴 DEBUG: Red ground plane created at y=0, size=200x200');

    // Store refs
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    ambientLightRef.current = ambient;
    directionalLightsRef.current = directionalLights;

    mountRef.current.appendChild(renderer.domElement);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const width = mountRef.current?.clientWidth || window.innerWidth;
      const height = mountRef.current?.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    // Provide context to special effects system
    if (onContextReady) {
      const effectCtx: EffectCtx = {
        scene,
        camera,
        renderer,
        controls,
        setNeedsRedraw: () => {
          // Force a render on next frame
          renderer.render(scene, camera);
        }
      };
      onContextReady(effectCtx);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Build geometry & position model on plane
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const group = groupRef.current;

    if (!scene || !camera || !controls || !group || !cells.length || !view) return;

    // Clear previous instanced mesh
    if (instancedMeshRef.current) {
      group.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      if (Array.isArray(instancedMeshRef.current.material)) {
        instancedMeshRef.current.material.forEach(m => m.dispose());
      } else {
        instancedMeshRef.current.material.dispose();
      }
      instancedMeshRef.current = undefined;
    }

    const M = mat4ToThree(view.M_world);

    // Positions and bounds (in world space before offset)
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const positions: THREE.Vector3[] = [];
    for (const cell of cells) {
      const p = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      positions.push(p);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }

    // Sphere radius = half of closest inter-cell distance
    let minDistance = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = positions[i].distanceTo(positions[j]);
        if (d > 0 && d < minDistance) minDistance = d;
      }
    }
    const radius = minDistance === Infinity ? 0.4 : minDistance * 0.5;

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );

    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    // Build instanced spheres
    const geo = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: settings.material.color,
      metalness: settings.material.metalness,
      roughness: settings.material.roughness
    });

    const instanced = new THREE.InstancedMesh(geo, mat, positions.length);
    instanced.castShadow = true;
    // Let only the plane receive shadows for clearer contact shadow
    instanced.receiveShadow = false;
    instanced.frustumCulled = false;

    const tmp = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      tmp.makeTranslation(positions[i].x, positions[i].y, positions[i].z);
      instanced.setMatrixAt(i, tmp);
    }
    instanced.instanceMatrix.needsUpdate = true;

    group.add(instanced);
    instancedMeshRef.current = instanced;

    // Step E — Double-check the basics (quick asserts)
    // console.log('🔴 DEBUG: shadow enabled?', rendererRef.current?.shadowMap.enabled);
    // console.log('🔴 DEBUG: mesh cast?', instanced.castShadow, 'plane receive?', shadowPlaneRef.current?.receiveShadow);
    // console.log('🔴 DEBUG: key intensity', keyLightRef.current?.intensity, 'castShadow', keyLightRef.current?.castShadow);

    // === Land the model on the plane (y = 0) ===
    // The lowest visible point is minY - radius from centers; to touch plane at y=0:
    const offsetY = radius - minY; // raises model so its lowest sphere tangent touches plane
    group.position.set(0, offsetY, 0);

    // Update camera & controls to look at the new center (with offset)
    const centerWithOffset = new THREE.Vector3(center.x, center.y + offsetY, center.z);
    const dist = Math.max(size, radius * 6) * 2;
    camera.position.set(
      centerWithOffset.x + dist * 0.7,
      centerWithOffset.y + dist * 0.7,
      centerWithOffset.z + dist * 0.7
    );
    controls.target.copy(centerWithOffset);
    controls.update();

    // console.log('🔴 DEBUG: Model bounds:', { minY, maxY, radius, offsetY });
    // console.log('🔴 DEBUG: Camera pos:', camera.position);
    // console.log('🔴 DEBUG: Controls target:', controls.target);
    // console.log('🔴 DEBUG: Center with offset:', centerWithOffset);

    // === Configure shadow light now that we know bounds & offset ===
    const keyLight = keyLightRef.current;
    if (keyLight) {
      keyLight.castShadow = settings.lights.shadows.enabled;

      keyLight.target.position.copy(centerWithOffset);
      scene.add(keyLight.target);

      const half = Math.max(size * 0.75, 10);
      const cam = keyLight.shadow.camera as THREE.OrthographicCamera;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.near = 0.1;

      // Ensure far covers light->target distance and ground
      const lightToTarget = keyLight.position.clone().sub(keyLight.target.position).length();
      cam.far = Math.max(lightToTarget + half * 3, 200);

      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.05;

      cam.updateProjectionMatrix();     // << REQUIRED
      keyLight.shadow.needsUpdate = true;    // << Helpful when static
      
      // console.log('🔴 DEBUG: Shadow camera configured - bounds:', { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom, near: cam.near, far: cam.far });

      // // Debug: visualize shadow frustum (removed for production)
      // const camHelper = new THREE.CameraHelper(cam);
      // scene.add(camHelper);
      // const lightHelper = new THREE.DirectionalLightHelper(keyLight, 5);
      // scene.add(lightHelper);
    }

    // Shadow plane visibility is handled in lighting effect with intensity updates

  }, [cells, view]);

  // Update materials when settings change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!instancedMeshRef.current?.material || !scene) return;

    const material = instancedMeshRef.current.material as THREE.MeshStandardMaterial;
    material.color.set(settings.material.color);
    material.metalness = settings.material.metalness;
    material.roughness = settings.material.roughness;

    material.envMapIntensity = settings.lights.hdr.enabled
      ? settings.lights.hdr.intensity
      : 1.0;

    if (material.envMap) {
      material.envMap = null; // use scene.environment
    }

    material.needsUpdate = true;
  }, [settings.material, settings.lights.hdr]);

  // Update lighting + HDR when settings change
  // ⚠️  CRITICAL: Shadow intensity updates MUST be in this effect!
  // ⚠️  DO NOT move shadow plane updates to geometry or init effects!
  useEffect(() => {
    const scene = sceneRef.current;
    const hdrLoader = hdrLoaderRef.current;
    if (!scene || !ambientLightRef.current) return;

    // Background
    scene.background = new THREE.Color(settings.lights.backgroundColor);

    // Ambient
    ambientLightRef.current.intensity = 0.3 * settings.lights.brightness;

    // Directionals - protect key light from being zeroed out
    directionalLightsRef.current.forEach((light, i) => {
      if (i < settings.lights.directional.length) {
        const v = settings.lights.directional[i] * settings.lights.brightness;
        // keep a minimum intensity on the key light so shadows never disappear
        light.intensity = (light === keyLightRef.current) ? Math.max(v, 0.3) : v;
      }
    });

    // Keep one shadow light even with HDR
    const keyLight = keyLightRef.current;
    if (keyLight) keyLight.castShadow = settings.lights.shadows.enabled;

    // CRITICAL: Update shadow plane intensity - MUST be in lighting effect!
    console.log('🌑 RUNTIME DEBUG: Shadow settings:', settings.lights.shadows);
    console.log('🌑 RUNTIME DEBUG: Shadow plane exists:', !!shadowPlaneRef.current);
    console.log('🌑 RUNTIME DEBUG: Shadow plane material:', shadowPlaneRef.current?.material?.constructor.name);
    console.log('🌑 RUNTIME DEBUG: Shadow plane visible:', shadowPlaneRef.current?.visible);
    console.log('🌑 RUNTIME DEBUG: Shadow plane opacity:', (shadowPlaneRef.current?.material as THREE.ShadowMaterial)?.opacity);
    console.log('🌑 RUNTIME DEBUG: Key light exists:', !!keyLightRef.current);
    console.log('🌑 RUNTIME DEBUG: Key light castShadow:', keyLightRef.current?.castShadow);
    
    updateShadowPlaneIntensity(shadowPlaneRef, settings.lights.shadows.intensity);
    
    // FALLBACK: Direct shadow plane update (from memory pattern)
    if (shadowPlaneRef.current && shadowPlaneRef.current.material instanceof THREE.ShadowMaterial) {
      // Shadow intensity slider controls shadow darkness (0.0 = invisible, 2.0 = very dark)
      const shadowOpacity = settings.lights.shadows.intensity * 0.4; // Scale 0-2 range to 0-0.8 opacity
      shadowPlaneRef.current.material.opacity = Math.max(0.05, shadowOpacity); // Minimum visibility
      shadowPlaneRef.current.material.needsUpdate = true;
      shadowPlaneRef.current.visible = settings.lights.shadows.enabled; // Ensure plane is visible
      console.log('🌑 FALLBACK: Direct shadow update applied, opacity:', shadowOpacity, 'visible:', settings.lights.shadows.enabled);
    }
    
    // Validate shadow system is working correctly
    validateShadowSystem(shadowPlaneRef, keyLightRef, settings.lights.shadows);

    if (settings.lights.hdr.enabled) {
      // ensure some direct light so shadows appear over IBL
      directionalLightsRef.current.forEach((light) => {
        light.intensity = Math.max(light.intensity, 0.25 * settings.lights.brightness);
      });
    }

    // HDR env
    if (settings.lights.hdr.enabled && settings.lights.hdr.envId && hdrLoader) {
      hdrLoader
        .loadEnvironment(settings.lights.hdr.envId)
        .then((envMap) => {
          if (!envMap) return;
          scene.environment = envMap;
          if (instancedMeshRef.current?.material instanceof THREE.MeshStandardMaterial) {
            const mat = instancedMeshRef.current.material;
            mat.envMap = envMap; // keep both for compatibility
            mat.envMapIntensity = settings.lights.hdr.intensity;
            mat.needsUpdate = true;
          }
        })
        .catch((e) => console.error('HDR load error', e));
    } else {
      scene.environment = null;
      if (instancedMeshRef.current?.material instanceof THREE.MeshStandardMaterial) {
        const mat = instancedMeshRef.current.material;
        mat.envMap = null;
        mat.envMapIntensity = 1.0;
        mat.needsUpdate = true;
      }
    }
  }, [settings.lights]);

  // Update camera settings - SIMPLIFIED
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    
    // Only handle perspective camera settings - keep it simple
    if (camera instanceof THREE.PerspectiveCamera) {
      // Convert from focal length (mm) to FOV (degrees)
      const sensorWidth = 36; // 35mm full frame sensor width in mm
      const focalLengthMm = settings.camera.fovDeg;
      const fovRadians = 2 * Math.atan(sensorWidth / (2 * focalLengthMm));
      const fovDegrees = fovRadians * (180 / Math.PI);
      
      camera.fov = fovDegrees;
      camera.updateProjectionMatrix();
      
      console.log(`📷 Focal length: ${focalLengthMm}mm → FOV: ${fovDegrees.toFixed(1)}°`);
    }
    
    // For orthographic, we'll handle it differently - don't switch camera types
    console.log(`📷 Camera projection setting: ${settings.camera.projection} (not implemented yet)`);
  }, [settings.camera]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    />
  );
};
