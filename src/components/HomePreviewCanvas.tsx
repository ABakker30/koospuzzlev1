import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { listContractSolutions, getContractSolutionSignedUrl } from '../api/contracts';
import { orientSolutionWorld } from '../pages/solution-viewer/pipeline/orient';
import { buildSolutionGroup } from '../pages/solution-viewer/pipeline/build';
import { loadAllPieces } from '../engines/piecesLoader';
import type { SolutionJSON } from '../pages/solution-viewer/types';
import { buildEffectContext } from '../studio/EffectContext';
import { getEffect } from '../effects/registry';
import type { TurnTableConfig } from '../effects/turntable/presets';
import type { RevealConfig } from '../effects/reveal/presets';
import { getPublicPresets } from '../api/studioPresets';
import { HDRLoader } from '../services/HDRLoader';
import type { StudioSettings } from '../types/studio';
import { DEFAULT_STUDIO_SETTINGS } from '../types/studio';

// Helper function to determine if a color is dark
function isColorDark(hexColor: string): boolean {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate luminance (perceived brightness)
  // Using ITU-R BT.709 formula
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  
  // Dark if luminance is less than 0.5
  return luminance < 0.5;
}

export function HomePreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const activeEffectRef = useRef<any>(null);
  // Force rebuild - all disposed refs have been replaced with globalDisposed
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
  } | null>(null);
  const animationIdRef = useRef<number>(0);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disposedRef = useRef(false);
  const [solutionInfo, setSolutionInfo] = useState<{
    creator: string;
    createdAt: string;
    isDarkBackground: boolean;
  } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Reset disposed flag for this mount cycle
    disposedRef.current = false;
    console.log('🔄 Component effect running, disposedRef reset to false');
    
    // Prevent multiple simultaneous loads
    if (mountedRef.current) {
      console.log('⚠️ Effect already running, skipping duplicate load');
      return;
    }
    mountedRef.current = true;

    const loadAndAnimate = async () => {
      const canvas = canvasRef.current;
      if (!canvas || disposedRef.current) return;
      
      // Cancel previous animation loop if exists
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }

      // Load studio preset for materials
      let studioSettings: StudioSettings = DEFAULT_STUDIO_SETTINGS;
      try {
        const presets = await getPublicPresets();
        if (presets.length > 0) {
          const randomPreset = presets[Math.floor(Math.random() * presets.length)];
          studioSettings = randomPreset.settings;
          console.log(`🎨 Using studio preset: ${randomPreset.name}`);
        }
      } catch (error) {
        console.warn('⚠️ Could not load studio presets, using defaults:', error);
      }

      // Setup scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(studioSettings.lights.backgroundColor || '#000000');

      // Wait a moment for layout to stabilize, then get dimensions
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const canvasRect = canvas.getBoundingClientRect();
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      console.log('📐 Canvas dimensions:', canvasRect.width, 'x', canvasRect.height);
      console.log('📐 Parent dimensions:', parentRect?.width, 'x', parentRect?.height);

      // Setup camera (create fresh each time for new solution)
      const camera = new THREE.PerspectiveCamera(
        studioSettings.camera.fovDeg,
        canvasRect.width / canvasRect.height,
        0.1,
        1000
      );
      // Initial position (will be updated after solution loads)
      camera.position.set(15, 10, 15);

      // Setup renderer (reuse if exists)
      let renderer = sceneObjectsRef.current?.renderer;
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false, // Don't use alpha - we want solid background
        });
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      
      // Always update renderer size to match canvas display size
      // Set canvas width/height attributes explicitly to match display size
      canvas.width = canvasRect.width;
      canvas.height = canvasRect.height;
      renderer.setSize(canvasRect.width, canvasRect.height, false); // false = don't set canvas style
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      console.log('📐 Renderer sized to:', canvasRect.width, 'x', canvasRect.height);
      renderer.shadowMap.enabled = studioSettings.lights.shadows.enabled;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Setup controls (create fresh each time to bind to new camera)
      if (sceneObjectsRef.current?.controls) {
        sceneObjectsRef.current.controls.dispose();
      }
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(0, 0, 0);
      controls.update();

      // Store scene objects for reuse
      sceneObjectsRef.current = { scene, camera, renderer, controls };

      // Add lights based on studio settings
      const ambientLight = new THREE.AmbientLight(0xffffff, studioSettings.lights.brightness * 0.3);
      scene.add(ambientLight);

      // Add 5 directional lights as per studio settings
      const directionalLights = [
        new THREE.DirectionalLight(0xffffff, studioSettings.lights.directional[0]),
        new THREE.DirectionalLight(0xffffff, studioSettings.lights.directional[1]),
        new THREE.DirectionalLight(0xffffff, studioSettings.lights.directional[2]),
        new THREE.DirectionalLight(0xffffff, studioSettings.lights.directional[3]),
        new THREE.DirectionalLight(0xffffff, studioSettings.lights.directional[4])
      ];

      directionalLights[0].position.set(20, 0, 0);  // right
      directionalLights[1].position.set(-20, 0, 0); // left
      directionalLights[2].position.set(30, 40, 30); // top (key)
      directionalLights[3].position.set(0, -20, 0); // bottom
      directionalLights[4].position.set(0, 0, 20);  // front

      directionalLights.forEach(l => scene.add(l));

      // Configure key light for shadows
      const keyLight = directionalLights[2];
      keyLight.castShadow = studioSettings.lights.shadows.enabled;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.05;

      // Ground plane for shadows
      const planeGeo = new THREE.PlaneGeometry(200, 200);
      const shadowOpacity = studioSettings.lights.shadows.intensity * 0.4;
      const planeMat = new THREE.ShadowMaterial({ 
        opacity: Math.max(0.05, shadowOpacity)
      });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0;
      plane.receiveShadow = true;
      plane.visible = studioSettings.lights.shadows.enabled;
      scene.add(plane);

      // Setup HDR if enabled
      if (studioSettings.lights.hdr.enabled) {
        try {
          HDRLoader.resetInstance();
          const hdrLoader = HDRLoader.getInstance();
          hdrLoader.initializePMREMGenerator(renderer);
          const envMap = await hdrLoader.loadEnvironment(studioSettings.lights.hdr.envId || 'studio');
          if (envMap) {
            scene.environment = envMap;
            console.log('✨ HDR environment loaded');
          }
        } catch (error) {
          console.warn('⚠️ Could not load HDR environment:', error);
        }
      }

      // Load random solution
      try {
        console.log('🏠 HomePreview: Loading random solution...');
        
        const allSolutions = await listContractSolutions();
        console.log(`📊 Total solutions in database: ${allSolutions.length}`);
        
        if (allSolutions.length === 0) {
          console.log('⚠️ No solutions available');
          setIsLoading(false);
          return;
        }

        // Since metadata doesn't have cell counts, count from placements directly
        // Filter for solutions with substantial placements (assuming pieces with ~5 cells each, 100 cells = ~20 pieces)
        const solutionsWithCounts = allSolutions.map(s => ({
          solution: s,
          placementCount: s.placements?.length || 0
        })).filter(item => item.placementCount > 0);

        console.log(`📊 Solutions with placements: ${solutionsWithCounts.length}`);
        console.log(`📊 Placement counts:`, solutionsWithCounts.map(s => s.placementCount).slice(0, 10));

        if (solutionsWithCounts.length === 0) {
          console.log('⚠️ No valid solutions with placements available');
          setIsLoading(false);
          return;
        }

        // Use solutions with the most pieces (likely 100-cell puzzles)
        const maxPlacements = Math.max(...solutionsWithCounts.map(s => s.placementCount));
        console.log(`📊 Maximum placements found: ${maxPlacements}`);
        
        const largestSolutions = solutionsWithCounts.filter(s => s.placementCount === maxPlacements);
        const randomItem = largestSolutions[Math.floor(Math.random() * largestSolutions.length)];
        const randomSolution = randomItem.solution;
        
        console.log(`🎲 Picked random solution: ${randomSolution.id} (${randomItem.placementCount} pieces)`);
        
        // Extract creator info for overlay
        // Note: contracts_solutions table doesn't track users, so all are anonymous
        const creatorName = 'Anonymous';
        const createdDate = new Date(randomSolution.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        
        // Determine if background is dark for text color selection
        const bgColor = studioSettings.lights.backgroundColor || '#f0f0f0';
        const isDark = isColorDark(bgColor);
        
        setSolutionInfo({
          creator: creatorName,
          createdAt: createdDate,
          isDarkBackground: isDark
        });

        // Fetch solution file
        const signedUrl = await getContractSolutionSignedUrl(randomSolution.id);
        const response = await fetch(signedUrl);
        const solutionData = await response.json();

        let legacySolution: SolutionJSON;

        // Check if already in legacy format
        if (solutionData.placements?.[0]?.cells_ijk) {
          legacySolution = solutionData as SolutionJSON;
        } else {
          // Convert from contract format
          const piecesDb = await loadAllPieces();
          legacySolution = {
            version: 1,
            containerCidSha256: randomSolution.shape_id || '',
            lattice: 'fcc',
            piecesUsed: {},
            placements: solutionData.placements.map((p: any) => {
              const [i, j, k] = p.ijk || p.anchorIJK || [0, 0, 0];
              const pieceId = p.pieceId || p.piece;
              const oriIndex = p.orientationIndex ?? p.ori ?? 0;
              
              const orientations = piecesDb.get(pieceId);
              if (!orientations) return null;
              
              const orientation = orientations[oriIndex];
              if (!orientation) return null;
              
              const cells_ijk = orientation.cells.map((cell: any) => [
                cell[0] + i, cell[1] + j, cell[2] + k
              ] as [number, number, number]);
              
              return {
                piece: pieceId,
                ori: oriIndex,
                t: [i, j, k] as [number, number, number],
                cells_ijk
              };
            }).filter((p: any) => p !== null),
            sid_state_sha256: randomSolution.id,
            sid_route_sha256: '',
            sid_state_canon_sha256: '',
            mode: 'preview',
            solver: { engine: 'unknown', seed: 0, flags: {} }
          };
        }

        // Orient and build
        const oriented = orientSolutionWorld(legacySolution);
        const { root } = buildSolutionGroup(oriented);
        
        // Apply material settings from preset to all meshes (preserve distinct piece colors)
        root.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            // DON'T override color - buildSolutionGroup already assigned distinct colors per piece
            // Only apply material properties from preset
            child.material.metalness = studioSettings.material.metalness;
            child.material.roughness = studioSettings.material.roughness;
            child.material.envMapIntensity = studioSettings.lights.hdr.enabled 
              ? studioSettings.lights.hdr.intensity 
              : 1.0;
            child.material.needsUpdate = true;
            child.castShadow = true;
            child.receiveShadow = false;
          }
        });
        
        scene.add(root);

        // Fit camera to object (zoomed in closer)
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 1.2; // Reduced from 1.8 to zoom in closer
        
        const newCameraPos = {
          x: center.x + distance * 0.7,
          y: center.y + distance * 0.5,
          z: center.z + distance * 0.7
        };
        
        camera.position.set(newCameraPos.x, newCameraPos.y, newCameraPos.z);
        controls.target.copy(center);
        controls.update();
        
        console.log(`📷 Camera repositioned for new solution - distance: ${distance.toFixed(2)}, center:`, center);

        // Configure shadow camera for the scene bounds
        if (keyLight.castShadow) {
          keyLight.target.position.copy(center);
          scene.add(keyLight.target);

          const half = Math.max(maxDim * 0.75, 10);
          const cam = keyLight.shadow.camera as THREE.OrthographicCamera;
          cam.left = -half;
          cam.right = half;
          cam.top = half;
          cam.bottom = -half;
          cam.near = 0.1;

          const lightToTarget = keyLight.position.clone().sub(keyLight.target.position).length();
          cam.far = Math.max(lightToTarget + half * 3, 200);
          cam.updateProjectionMatrix();
          keyLight.shadow.needsUpdate = true;
        }

        setIsLoading(false);

        console.log('🎨 Scene setup complete, root has', root.children.length, 'children');

        // Setup effect context
        const effectContext = buildEffectContext({
          scene,
          spheresGroup: root,
          camera,
          controls,
          renderer,
          centroidWorld: center
        });

        console.log('🎬 Effect context created, scheduling effect trigger in 500ms...');

        // Trigger random effect after a short delay
        setTimeout(() => {
          console.log('⏰ Effect trigger timeout fired, disposedRef.current:', disposedRef.current);
          if (disposedRef.current) {
            console.warn('⚠️ Cannot trigger effect - component disposed');
            return;
          }
          
          // Randomly select from available effects (turntable, reveal, orbit, explosion)
          const effects = ['turntable', 'reveal', 'orbit', 'explosion'];
          const randomEffect = effects[Math.floor(Math.random() * effects.length)];
          console.log(`🎲 Playing random effect: ${randomEffect}`);

          const effectDef = getEffect(randomEffect);
          if (effectDef && effectDef.constructor) {
            const instance = new effectDef.constructor();
            instance.init(effectContext);

            // Generate duration based on effect type
            let effectDuration: number;
            if (randomEffect === 'turntable') {
              effectDuration = 12 + Math.random() * 8; // 12-20s
            } else if (randomEffect === 'reveal') {
              effectDuration = 10 + Math.random() * 5; // 10-15s
            } else if (randomEffect === 'orbit') {
              effectDuration = 15 + Math.random() * 10; // 15-25s
            } else { // explosion
              effectDuration = 8 + Math.random() * 4; // 8-12s
            }

            if (randomEffect === 'turntable') {
              const config: TurnTableConfig = {
                schemaVersion: 1,
                durationSec: effectDuration,
                degrees: 360,
                direction: Math.random() > 0.5 ? 'cw' : 'ccw',
                mode: 'object',
                easing: 'ease-in-out',
                finalize: 'returnToStart'
              };
              instance.setConfig(config);
            } else if (randomEffect === 'reveal') {
              const config: RevealConfig = {
                schemaVersion: 1,
                durationSec: effectDuration,
                loop: false, // No loop - complete once then reload
                pauseBetweenLoops: 0,
                rotationEnabled: true,
                rotationDegrees: 180,
                rotationEasing: 'ease-in-out',
                revealEasing: 'ease-in-out'
              };
              instance.setConfig(config);
            } else if (randomEffect === 'orbit') {
              // Orbit uses auto-keyframes for a circular path
              const config = {
                schemaVersion: 1,
                autoKeyframes: true,
                durationSec: effectDuration,
                loop: false
              };
              instance.setConfig(config);
            } else if (randomEffect === 'explosion') {
              // Explosion separates pieces outward
              const config = {
                schemaVersion: 1,
                durationSec: effectDuration,
                maxDistance: 15,
                rotationEnabled: true,
                rotationDegrees: 360,
                loop: false
              };
              instance.setConfig(config);
            }

            // Set up completion callback to reload when animation actually finishes
            if (instance.setOnComplete) {
              instance.setOnComplete(() => {
                if (!disposedRef.current) {
                  console.log('🔄 Animation completed via callback, reloading with new solution...');
                  
                  // Wait 1 second before reload for smooth transition
                  setTimeout(() => {
                    if (!disposedRef.current) {
                      setIsLoading(true);
                      setSolutionInfo(null);
                      
                      // Dispose old effect
                      if (activeEffectRef.current && activeEffectRef.current.dispose) {
                        activeEffectRef.current.dispose();
                        activeEffectRef.current = null;
                      }
                      
                      // Clear current scene content
                      if (root) {
                        root.traverse((child) => {
                          if (child instanceof THREE.Mesh) {
                            child.geometry?.dispose();
                            if (Array.isArray(child.material)) {
                              child.material.forEach(m => m.dispose());
                            } else {
                              child.material?.dispose();
                            }
                          }
                        });
                        scene.remove(root);
                      }
                      
                      // Reload with new solution
                      loadAndAnimate();
                    }
                  }, 1000);
                }
              });
            }
            
            activeEffectRef.current = instance;
            console.log(`⏱️ Effect started, will reload when animation completes`);
            
            setTimeout(() => {
              if (!disposedRef.current && instance.play) {
                console.log(`▶️ Playing ${randomEffect} effect now`);
                instance.play();
                console.log(`✅ Effect play() called, instance state:`, instance);
              } else {
                console.warn(`⚠️ Cannot play effect - disposedRef.current: ${disposedRef.current}, hasPlay: ${!!instance.play}`);
              }
            }, 100);
          }
        }, 500);

      } catch (error) {
        console.error('❌ Failed to load preview:', error);
        setIsLoading(false);
      }

      // Animation loop
      const animate = () => {
        if (disposedRef.current) return;
        
        animationIdRef.current = requestAnimationFrame(animate);
        
        controls.update();
        
        // Tick active effect
        if (activeEffectRef.current) {
          const time = performance.now() / 1000;
          activeEffectRef.current.tick(time);
        }
        
        renderer.render(scene, camera);
      };
      
      console.log('🎬 Starting animation loop');
      animate();

      // Handle resize
      const handleResize = () => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        console.log('🔄 Resize:', rect.width, 'x', rect.height);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(rect.width, rect.height, false);
      };

      window.addEventListener('resize', handleResize);
      
      // Use ResizeObserver for more reliable canvas container resizing
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(canvas);
      
      // Force initial resize after a short delay to ensure proper sizing
      const resizeTimeout = setTimeout(() => {
        handleResize();
      }, 100);

      // Cleanup
      return () => {
        // Don't set disposed here - managed at top level
        clearTimeout(resizeTimeout);
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }
        if (reloadTimeoutRef.current) {
          clearTimeout(reloadTimeoutRef.current);
        }
        if (activeEffectRef.current && activeEffectRef.current.dispose) {
          activeEffectRef.current.dispose();
        }
        // Don't dispose renderer here - it's reused across reloads
        // Controls are disposed and recreated in loadAndAnimate for each new solution
      };
    };

    loadAndAnimate();

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleanup: Component unmounting');
      disposedRef.current = true;
      mountedRef.current = false; // Allow remount
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (activeEffectRef.current?.dispose) {
        activeEffectRef.current.dispose();
      }
      if (sceneObjectsRef.current) {
        sceneObjectsRef.current.renderer.dispose();
        sceneObjectsRef.current.controls.dispose();
      }
    };

  }, []);

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'absolute',
      inset: 0,
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          borderRadius: 'inherit',
          backgroundColor: '#f0f0f0',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 'inherit',
          }}
        >
          <div style={{ textAlign: 'center', color: '#666' }}>
            <div style={{ 
              fontSize: '2rem',
              animation: 'spin 1s linear infinite'
            }}>
              ⟳
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Loading preview...
            </div>
          </div>
        </div>
      )}
      {solutionInfo && !isLoading && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            background: solutionInfo.isDarkBackground 
              ? 'rgba(255, 255, 255, 0.9)' 
              : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            color: solutionInfo.isDarkBackground ? '#000' : '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: '0.85rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
            Community Puzzle
          </div>
          <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>
            {solutionInfo.createdAt}
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
