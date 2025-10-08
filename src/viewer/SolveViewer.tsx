// Three.js viewer for Auto-Solve

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IJK, StatusV2 } from "../engines/types";
import { ijkToXyz } from "../lib/ijk";
import { quickHullWithCoplanarMerge } from "../lib/quickhull-adapter";

type Props = {
  containerCells: IJK[];
  worldFromIJK: number[];   // 16 numbers (THREE.Matrix4 elements)
  sphereRadius?: number;    // default 1
  status?: StatusV2;        // live/last status for partial viz
  emptiesGlass?: boolean;
};

export default function SolveViewer({
  containerCells,
  worldFromIJK,
  sphereRadius = 1,
  status,
  emptiesGlass = true
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<OrbitControls>();
  const occGroupRef = useRef<THREE.Group>();
  const emptyGroupRef = useRef<THREE.Group>();

  // Initialize Three.js scene
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f8f8);
    
    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(8, 8, 8);
    camera.lookAt(0, 0, 0);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 8, 5);
    light.castShadow = true;
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const occGroup = new THREE.Group();
    scene.add(occGroup);
    occGroupRef.current = occGroup;
    
    const emptyGroup = new THREE.Group();
    scene.add(emptyGroup);
    emptyGroupRef.current = emptyGroup;

    const grid = new THREE.GridHelper(40, 40);
    grid.position.y = 0;
    scene.add(grid);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

    // Handle resize
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // Render base container with orientation (like Solution Viewer)
  useEffect(() => {
    if (!sceneRef.current || containerCells.length === 0) return;
    const occ = occGroupRef.current!;
    occ.clear();
    const empty = emptyGroupRef.current!;
    empty.clear();

    // 1) Convert IJK to XYZ
    const centers = containerCells.map(ijk => {
      const xyz = ijkToXyz({ i: ijk[0], j: ijk[1], k: ijk[2] });
      return new THREE.Vector3(xyz.x, xyz.y, xyz.z);
    });

    // 2) Compute convex hull to find largest face
    const xyzPoints = centers.map(v => ({ x: v.x, y: v.y, z: v.z }));
    const hull = quickHullWithCoplanarMerge(xyzPoints, 1e-6);

    let rotationMatrix = new THREE.Matrix4(); // Identity by default

    if (hull.faces && hull.faces.length > 0) {
      // Find largest face
      let bestFace = hull.faces[0];
      for (const face of hull.faces) {
        if (face.area > bestFace.area) {
          bestFace = face;
        }
      }

      // EXACT copy from Solution Viewer - rotate to -Y (down) to make face the base
      const targetNormal = new THREE.Vector3(0, -1, 0);
      const currentNormal = new THREE.Vector3(bestFace.normal.x, bestFace.normal.y, bestFace.normal.z);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
      rotationMatrix.makeRotationFromQuaternion(quaternion);
    }

    // 3) Apply rotation
    const rotatedCenters = centers.map(center => center.clone().applyMatrix4(rotationMatrix));

    // 4) Calculate centroid and min Y
    const centroid = new THREE.Vector3();
    let minY = Infinity;
    rotatedCenters.forEach(center => {
      centroid.add(center);
      if (center.y < minY) minY = center.y;
    });
    centroid.multiplyScalar(1 / rotatedCenters.length);

    // 5) Center and place on ground
    const offsetY = -minY + sphereRadius; // Lift so lowest sphere bottom touches Y=0
    const finalCenters = rotatedCenters.map(center => new THREE.Vector3(
      center.x - centroid.x,
      center.y + offsetY,
      center.z - centroid.z
    ));

    // 6) Render spheres
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff,
      transmission: 0.9,
      opacity: 0.4,
      transparent: true
    });

    const empties = status?.empties_idx ?? [];
    const emptySet = new Set<number>(empties);

    finalCenters.forEach((center, idx) => {
      if (emptiesGlass && emptySet.has(idx)) {
        const geom = new THREE.SphereGeometry(sphereRadius, 32, 24);
        const mesh = new THREE.Mesh(geom, matGlass);
        mesh.position.copy(center);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        empty.add(mesh);
      }
    });
  }, [containerCells, sphereRadius, status?.empties_idx, emptiesGlass]);

  // Render partial placements as they arrive (stack)
  useEffect(() => {
    if (!sceneRef.current || !status?.stack) return;
    const occ = occGroupRef.current!;
    occ.clear();
    const matOcc = new THREE.MeshStandardMaterial({
      color: 0x0077ff,
      metalness: 0.1,
      roughness: 0.4
    });

    // If you have piece orientations loaded, expand each placement to its 4 ijk cells and draw them.
    // For now (no pieces wired), just skip; when pieces are wired, call addSphere for each cell.
  }, [status?.stack, worldFromIJK, sphereRadius]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
