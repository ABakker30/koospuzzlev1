import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IJK } from "../types/shape";
import type { ViewTransforms } from "../services/ViewTransforms";

type Props = {
  cells: IJK[];
  view: ViewTransforms;  // includes M_world, pivotXZ, bboxOriented
  editMode: boolean;
  mode: "add" | "remove";
  onCellsChange: (newCells: IJK[]) => void;
};

export default function SceneCanvas({ cells, view, editMode, mode, onCellsChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<any>();
  const meshRef = useRef<THREE.InstancedMesh>();
  const didFitRef = useRef(false);
  const raycasterRef = useRef<THREE.Raycaster>();
  const mouseRef = useRef<THREE.Vector2>();
  const isEditingRef = useRef(false);

  // Hover state for remove mode
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);

  // Material settings (final values)
  const materialColor = "#2b6cff";
  const brightness = 2.7;
  const metalness = 0;
  const roughness = 0.19;

  useEffect(() => {
    if (!mountRef.current) return;


    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountRef.current.appendChild(renderer.domElement);

    // Lighting setup with base intensities
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(10, 10, 5);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight3.position.set(5, -10, 10);
    scene.add(directionalLight3);

    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight4.position.set(-5, 10, -10);
    scene.add(directionalLight4);

    // Apply brightness setting to all lights
    const baseIntensities = [0.6, 0.8, 0.4, 0.3, 0.3];
    const lights = [ambientLight, directionalLight1, directionalLight2, directionalLight3, directionalLight4];
    lights.forEach((light, i) => {
      light.intensity = baseIntensities[i] * brightness;
    });

    // Initialize raycaster and mouse for hover detection
    raycasterRef.current = new THREE.Raycaster();
    mouseRef.current = new THREE.Vector2();

    sceneRef.current = scene; 
    cameraRef.current = camera; 
    rendererRef.current = renderer;

    // Render loop
    let raf = 0;
    const loop = () => { 
      raf = requestAnimationFrame(loop); 
      if (controlsRef.current) controlsRef.current.update();
      renderer.render(scene, camera); 
    };
    loop();

    // Resize handling
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);


    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Synchronous shape processing when data is available
  useEffect(() => {
    const scene = sceneRef.current, camera = cameraRef.current, renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (!cells.length || !view) return;

    // Clean up previous geometry if it exists
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = undefined;
    }

    // Step 1: Convert to XYZ and orient (already done in ViewTransforms)
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    
    // Step 2: Compute bounding box and center from oriented positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity; 
    let minZ = Infinity, maxZ = -Infinity;
    
    const spherePositions: THREE.Vector3[] = [];
    for (let i = 0; i < cells.length; i++) {
      const p_ijk = new THREE.Vector3(cells[i].i, cells[i].j, cells[i].k);
      const p = p_ijk.applyMatrix4(M);
      spherePositions.push(p);
      
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    // Step 3: Force recreation of OrbitControls for each file load (ensures they work)
    if (!isEditingRef.current) {
      // Only recreate controls for new file loads, not during editing
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.copy(center);
      controls.enabled = true;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.enableRotate = true;
      controlsRef.current = controls;
    }

    // Step 4: Set camera to center and fill screen (only for new files, not during editing)
    if (!isEditingRef.current) {
      const fov = camera.fov * (Math.PI / 180);
      const distance = (size / 2) / Math.tan(fov / 2) * 1.2;
      
      camera.position.set(
        center.x + distance,
        center.y + distance * 0.5,
        center.z + distance
      );
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      controlsRef.current.update();
    } else {
      // Reset editing flag after handling the edit
      isEditingRef.current = false;
    }

    // Step 5: Create and show mesh
    const geom = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, // Use white base color so instance colors show correctly
      metalness: metalness,
      roughness: roughness
    });
    const mesh = new THREE.InstancedMesh(geom, mat, cells.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Set up instance colors for hover effects
    const colors = new Float32Array(cells.length * 3);
    const blueColor = new THREE.Color(materialColor);
    for (let i = 0; i < cells.length; i++) {
      colors[i * 3] = blueColor.r;
      colors[i * 3 + 1] = blueColor.g;
      colors[i * 3 + 2] = blueColor.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    // Position spheres
    for (let i = 0; i < cells.length; i++) {
      const p = spherePositions[i];
      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Add new mesh to scene
    scene.add(mesh);
    meshRef.current = mesh;
  }, [cells, view]);

  // Reset fit flag when cells change from empty to non-empty
  useEffect(() => {
    if (cells.length === 0) {
      didFitRef.current = false;
    }
  }, [cells.length]);

  // Edit mode detection
  useEffect(() => {
    if (editMode) {
      console.log(`🛠️ Edit mode entered - Mode: ${mode.toUpperCase()}`);
    }
  }, [editMode, mode]);

  // Mouse hover detection for remove mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const mesh = meshRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !mesh || !raycaster || !mouse) return;
    if (!editMode || mode !== "remove") return;

    const onMouseMove = (event: MouseEvent) => {
      // Convert mouse coordinates to normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Check for intersections with the mesh
      const intersections = raycaster.intersectObject(mesh);

      if (intersections.length > 0) {
        // We're over a sphere - prevent OrbitControls from handling this event
        event.preventDefault();
        event.stopPropagation();

        // Get the closest intersection
        const closestIntersection = intersections[0];
        const sphereIndex = closestIntersection.instanceId;

        if (sphereIndex !== undefined && sphereIndex !== hoveredSphere) {
          // Restore previous hovered sphere to blue
          if (hoveredSphere !== null) {
            const blueColor = new THREE.Color(materialColor);
            mesh.setColorAt(hoveredSphere, blueColor);
          }

          // Set new hovered sphere to red
          const redColor = new THREE.Color(0xff0000);
          mesh.setColorAt(sphereIndex, redColor);
          mesh.instanceColor!.needsUpdate = true;

          setHoveredSphere(sphereIndex);
        }
      } else {
        // No intersection - restore any hovered sphere to blue and let OrbitControls handle the event
        if (hoveredSphere !== null) {
          const blueColor = new THREE.Color(materialColor);
          mesh.setColorAt(hoveredSphere, blueColor);
          mesh.instanceColor!.needsUpdate = true;
          setHoveredSphere(null);
        }
        // Don't prevent default - let OrbitControls handle this mouse movement
      }
    };

    const onMouseClick = (event: MouseEvent) => {
      // Only process clicks when there's a hovered sphere (red sphere)
      if (hoveredSphere !== null) {
        // We're clicking on a sphere - prevent OrbitControls from handling this
        event.preventDefault();
        event.stopPropagation();

        const cellToRemove = cells[hoveredSphere];
        console.log(`🗑️ Removing cell: i=${cellToRemove.i}, j=${cellToRemove.j}, k=${cellToRemove.k}`);
        
        // Mark that we're editing to prevent camera auto-centering
        isEditingRef.current = true;
        
        // Remove from cells array
        const newCells = cells.filter((_, index) => index !== hoveredSphere);
        
        // Update parent component with new cells
        onCellsChange(newCells);
        
        // Clear hover state since cell is being removed
        setHoveredSphere(null);
      }
      // If not hovering over a sphere, let OrbitControls handle the click normally
    };

    // Add event listeners
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onMouseClick);

    // Cleanup function
    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
      // Restore any hovered sphere when leaving remove mode
      if (hoveredSphere !== null) {
        const blueColor = new THREE.Color(materialColor);
        mesh.setColorAt(hoveredSphere, blueColor);
        mesh.instanceColor!.needsUpdate = true;
        setHoveredSphere(null);
      }
    };
  }, [editMode, mode, hoveredSphere, materialColor]);

  return <div ref={mountRef} style={{ 
    width: "100%", 
    height: "100%", 
    position: "relative" 
  }} />;
}

// —— utils ——
function mat4ToThree(M: number[][]): THREE.Matrix4 { 
  return new THREE.Matrix4().set(
    M[0][0], M[0][1], M[0][2], M[0][3],
    M[1][0], M[1][1], M[1][2], M[1][3],
    M[2][0], M[2][1], M[2][2], M[2][3],
    M[3][0], M[3][1], M[3][2], M[3][3]
  );
}

function fitCameraToBbox(camera: THREE.PerspectiveCamera, bbox: {min: any, max: any}, pad = 1.2) {
  const min = new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z);
  const max = new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z);
  const size = new THREE.Vector3().subVectors(max, min).multiplyScalar(pad);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect;
  const hFov = 2 * Math.atan(Math.tan(vFov/2) * aspect);

  const distV = (size.y * 0.5) / Math.tan(vFov/2);
  const distH = (size.x * 0.5) / Math.tan(hFov/2);
  const dist = Math.max(distV, distH) + size.z * 0.5; // add depth

  camera.position.copy(center.clone().add(new THREE.Vector3(dist, dist, dist)));
  camera.near = Math.max(0.01, dist * 0.01);
  camera.far  = Math.max(camera.far, dist * 10);
  camera.updateProjectionMatrix();
}

function estimateSphereRadiusFromView(view: ViewTransforms): number {
  // sample ijk (0,0,0) and (1,0,0) through M_world, distance/2
  const toV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(mat4ToThree(view.M_world));
  const p0 = toV3(0, 0, 0), p1 = toV3(1, 0, 0);
  return 0.5 * p0.distanceTo(p1);
}
