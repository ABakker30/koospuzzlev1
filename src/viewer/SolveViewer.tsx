// Three.js viewer for Auto-Solve

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IJK, StatusV2 } from "../engines/types";

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

  // Helper to place a sphere at ijk via worldFromIJK
  function addSphere(g: THREE.Group, ijk: IJK, r: number, mat: THREE.Material) {
    const geom = new THREE.SphereGeometry(r, 16, 12);
    const mesh = new THREE.Mesh(geom, mat);
    const M = new THREE.Matrix4();
    M.fromArray(worldFromIJK);
    const p = new THREE.Vector4(ijk[0], ijk[1], ijk[2], 1).applyMatrix4(M);
    mesh.position.set(p.x, p.y, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // Render base container (empties as glass if available in status)
  useEffect(() => {
    if (!sceneRef.current) return;
    const occ = occGroupRef.current!;
    occ.clear();
    const empty = emptyGroupRef.current!;
    empty.clear();

    const matOcc = new THREE.MeshStandardMaterial({
      color: 0x0077ff,
      metalness: 0.1,
      roughness: 0.4
    });
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff,
      transmission: 0.9,
      opacity: 0.4,
      transparent: true
    });

    // If status has empties_idx, draw those as glass
    const empties = status?.empties_idx ?? [];
    const emptySet = new Set<number>(empties);

    containerCells.forEach((c, idx) => {
      if (emptiesGlass && emptySet.has(idx)) {
        addSphere(empty, c, sphereRadius, matGlass);
      }
    });

    // Optionally draw occupied subset if you want; for now, draw nothing else here.
  }, [containerCells, worldFromIJK, sphereRadius, status?.empties_idx, emptiesGlass]);

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
