import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';

interface ShapeEditorCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  mode: "add" | "remove";
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
}

export default function ShapeEditorCanvas({ 
  cells, 
  view, 
  mode, 
  onCellsChange, 
  onSave,
  containerOpacity = 0.2,
  containerColor = "#ffcc99",
  containerRoughness = 0.7
}: ShapeEditorCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const neighborMeshRef = useRef<THREE.InstancedMesh | null>(null);
  
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);
  const [hoveredNeighbor, setHoveredNeighbor] = useState<number | null>(null);
  
  // Ref to always have latest cells value (prevents stale closure)
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Expose save function
  useEffect(() => {
    if (onSave) {
      (window as any).saveCurrentShape = onSave;
    }
  }, [cells, onSave]);

  // Expose OrbitControls target setting
  useEffect(() => {
    (window as any).setOrbitTarget = (center: THREE.Vector3) => {
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    };
    (window as any).resetCameraFlag = () => {
      if ((window as any).hasInitializedCamera) {
        (window as any).hasInitializedCamera = false;
        console.log('🔄 ShapeEditorCanvas: Camera initialization flag reset');
      }
    };
  }, []);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 ShapeEditorCanvas: Initializing Three.js');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(10, 10, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 7.5);
    scene.add(directional);

    mountRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    console.log('✅ ShapeEditorCanvas: Three.js initialized');

    return () => {
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Render main shape mesh
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    if (!scene || !camera || !controls) return;
    if (!cells.length || !view) return;

    // Remove previous mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
    }

    // Build instanced mesh
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(containerColor),
      transparent: true,
      opacity: containerOpacity,
      roughness: containerRoughness,
      metalness: 0.1
    });

    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const dummy = new THREE.Object3D();

    cells.forEach((cell, i) => {
      const worldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      dummy.position.copy(worldPos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);
    meshRef.current = mesh;

    // Fit camera on first load
    if (!(window as any).hasInitializedCamera) {
      fitToObject(mesh);
      (window as any).hasInitializedCamera = true;
    }

  }, [cells, view, containerOpacity, containerColor, containerRoughness]);

  // Generate neighbor spheres for add mode
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous neighbors
    if (neighborMeshRef.current) {
      scene.remove(neighborMeshRef.current);
      neighborMeshRef.current.geometry.dispose();
      if (Array.isArray(neighborMeshRef.current.material)) {
        neighborMeshRef.current.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        neighborMeshRef.current.material.dispose();
      }
      neighborMeshRef.current = null;
    }

    if (mode === "add" && cells.length && view) {
      const M = mat4ToThree(view.M_world);
      const radius = estimateSphereRadiusFromView(view);
      
      const neighbors: IJK[] = [];
      const occupied = new Set<string>();
      cells.forEach(c => occupied.add(`${c.i},${c.j},${c.k}`));

      // FCC neighbor offsets
      const fccOffsets: IJK[] = [
        { i: 1, j: 1, k: 0 }, { i: 1, j: -1, k: 0 }, { i: -1, j: 1, k: 0 }, { i: -1, j: -1, k: 0 },
        { i: 1, j: 0, k: 1 }, { i: 1, j: 0, k: -1 }, { i: -1, j: 0, k: 1 }, { i: -1, j: 0, k: -1 },
        { i: 0, j: 1, k: 1 }, { i: 0, j: 1, k: -1 }, { i: 0, j: -1, k: 1 }, { i: 0, j: -1, k: -1 }
      ];

      cells.forEach(c => {
        fccOffsets.forEach(offset => {
          const n = { i: c.i + offset.i, j: c.j + offset.j, k: c.k + offset.k };
          const key = `${n.i},${n.j},${n.k}`;
          if (!occupied.has(key) && !neighbors.some(nb => nb.i === n.i && nb.j === n.j && nb.k === n.k)) {
            neighbors.push(n);
          }
        });
      });

      if (neighbors.length > 0) {
        const geometry = new THREE.SphereGeometry(radius * 0.6, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.3
        });

        const neighborSpheres = new THREE.InstancedMesh(geometry, material, neighbors.length);
        const dummy = new THREE.Object3D();

        neighbors.forEach((n, i) => {
          const worldPos = new THREE.Vector3(n.i, n.j, n.k).applyMatrix4(M);
          dummy.position.copy(worldPos);
          dummy.updateMatrix();
          neighborSpheres.setMatrixAt(i, dummy.matrix);
        });
        neighborSpheres.instanceMatrix.needsUpdate = true;
        neighborSpheres.userData.neighbors = neighbors;

        scene.add(neighborSpheres);
        neighborMeshRef.current = neighborSpheres as any;
      }
    }
  }, [mode, cells, view]);

  // Hover detection for remove mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (mode !== "remove") return;

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const mesh = meshRef.current;
      if (!mesh) return;

      const intersections = raycaster.intersectObject(mesh);
      if (intersections.length > 0) {
        const instanceId = intersections[0].instanceId;
        if (instanceId !== undefined && instanceId !== hoveredSphere) {
          setHoveredSphere(instanceId);
        }
      } else if (hoveredSphere !== null) {
        setHoveredSphere(null);
      }
    };

    const onMouseClick = () => {
      if (mode !== "remove") return;
      if (hoveredSphere !== null && hoveredSphere < cellsRef.current.length) {
        const newCells = cellsRef.current.filter((_, i) => i !== hoveredSphere);
        onCellsChange(newCells);
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onMouseClick);

    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
    };
  }, [mode, hoveredSphere, onCellsChange]);

  // Hover detection for add mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (mode !== "add") return;

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const neighborMesh = neighborMeshRef.current;
      if (!neighborMesh) return;

      const intersections = raycaster.intersectObject(neighborMesh);
      if (intersections.length > 0) {
        const instanceId = intersections[0].instanceId;
        if (instanceId !== undefined && instanceId !== hoveredNeighbor) {
          setHoveredNeighbor(instanceId);
        }
      } else if (hoveredNeighbor !== null) {
        setHoveredNeighbor(null);
      }
    };

    const onMouseClick = () => {
      if (mode !== "add") return;
      const neighborMesh = neighborMeshRef.current;
      if (!neighborMesh || hoveredNeighbor === null) return;

      const neighbors = neighborMesh.userData.neighbors as IJK[];
      if (hoveredNeighbor < neighbors.length) {
        const newCell = neighbors[hoveredNeighbor];
        onCellsChange([...cellsRef.current, newCell]);
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onMouseClick);

    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
    };
  }, [mode, hoveredNeighbor, onCellsChange]);

  // Update hover highlight
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    if (hoveredSphere !== null) {
      const color = new THREE.Color(0xff0000);
      mesh.setColorAt(hoveredSphere, color);
      mesh.instanceColor!.needsUpdate = true;
    } else {
      // Reset all colors
      const baseColor = new THREE.Color(containerColor);
      for (let i = 0; i < cells.length; i++) {
        mesh.setColorAt(i, baseColor);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [hoveredSphere, cells.length, containerColor]);

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;

    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  return <div ref={mountRef} style={{ 
    width: "100%", 
    height: "100%", 
    position: "absolute",
    left: 0,
    overflow: "hidden"
  }} />;
}

// Helper functions
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

function estimateSphereRadiusFromView(view: ViewTransforms): number {
  const mat4 = view.M_world;
  const mat4ToThree = (M: number[][]) => {
    const matrix = new THREE.Matrix4();
    matrix.set(
      M[0][0], M[0][1], M[0][2], M[0][3],
      M[1][0], M[1][1], M[1][2], M[1][3],
      M[2][0], M[2][1], M[2][2], M[2][3],
      M[3][0], M[3][1], M[3][2], M[3][3]
    );
    return matrix;
  };
  
  const toV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(mat4ToThree(mat4));
  const p0 = toV3(0, 0, 0), p1 = toV3(1, 0, 0);
  const distance = p0.distanceTo(p1);
  const radius = distance / 2;
  return radius;
}
