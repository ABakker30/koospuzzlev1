import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const WORLD_SPHERE_RADIUS = Math.sqrt(0.5) / 2; // ≈ 0.3535
const TABLE_SURFACE_Y = 0;
const SPAWN_Y = 1.5;

export const PhysicsTest: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!mountRef.current) return;

    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Table mesh (visual)
    const tableGeometry = new THREE.PlaneGeometry(4, 4);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8,
    });
    const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.y = TABLE_SURFACE_Y;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // Grid helper
    const gridHelper = new THREE.GridHelper(4, 20, 0x666666, 0x333333);
    gridHelper.position.y = TABLE_SURFACE_Y + 0.001;
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    // Physics world setup
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -30, 0),
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.allowSleep = true;

    const pieceMaterial = new CANNON.Material('pieces');
    const groundMaterial = new CANNON.Material('ground');
    const contactMaterial = new CANNON.ContactMaterial(pieceMaterial, groundMaterial, {
      friction: 1.2,
      restitution: 0.0,
    });
    world.addContactMaterial(contactMaterial);
    world.defaultContactMaterial.friction = 1.2;
    world.defaultContactMaterial.contactEquationStiffness = 1e9;
    world.defaultContactMaterial.contactEquationRelaxation = 2;

    // Static table collider
    const tableBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    tableBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    tableBody.position.set(0, TABLE_SURFACE_Y, 0);
    world.addBody(tableBody);

    console.log('🧪 Physics Test: World created');

    // Create 4-sphere tetrahedral piece
    const tetraBody = new CANNON.Body({
      mass: 4 * 2, // 4 spheres * 2x mass
      material: pieceMaterial,
      position: new CANNON.Vec3(0, SPAWN_Y, 0),
      linearDamping: 0.5,
      angularDamping: 0.9,
      allowSleep: true,
      sleepSpeedLimit: 0.05,
      sleepTimeLimit: 0.5,
    });

    const r = WORLD_SPHERE_RADIUS;
    const d = 2 * r; // 0.707 - distance between touching spheres

    // Tetrahedral arrangement: 3 spheres forming base triangle, 1 on top
    // Base triangle (equilateral) in XZ plane at Y=0
    const h = (Math.sqrt(3) / 2) * d; // height of equilateral triangle
    const spherePositions = [
      { x: 0, y: 0, z: h * 2 / 3 },           // Base vertex 1 (front)
      { x: -d / 2, y: 0, z: -h / 3 },        // Base vertex 2 (back-left)
      { x: d / 2, y: 0, z: -h / 3 },         // Base vertex 3 (back-right)
      { x: 0, y: d * Math.sqrt(2/3), z: h / 3 } // Top vertex (apex)
    ];

    // Add sphere shapes
    let minY = Infinity;
    spherePositions.forEach(pos => {
      tetraBody.addShape(new CANNON.Sphere(r), new CANNON.Vec3(pos.x, pos.y, pos.z));
      minY = Math.min(minY, pos.y);
    });

    // Support pad under lowest point (base triangle center)
    const baseSpheres = spherePositions.filter(p => p.y <= minY + r * 0.25);
    const cx = baseSpheres.reduce((sum, p) => sum + p.x, 0) / baseSpheres.length;
    const cz = baseSpheres.reduce((sum, p) => sum + p.z, 0) / baseSpheres.length;
    const pad = new CANNON.Box(new CANNON.Vec3(r * 1.1, r * 0.02, r * 1.1));
    const padOffset = new CANNON.Vec3(cx, minY - r * 1.02, cz);
    tetraBody.addShape(pad, padOffset);

    tetraBody.updateMassProperties();
    tetraBody.updateAABB();

    // Add initial rotation and angular velocity for tumbling
    tetraBody.quaternion.setFromEuler(0.4, 0.6, 0.3); // Initial tilt
    tetraBody.angularVelocity.set(2, 1.5, 1); // Tumbling motion

    world.addBody(tetraBody);
    console.log('🧪 Physics Test: 4-sphere tetrahedral body created and spawned at Y =', SPAWN_Y);

    // Create visual tetrahedron
    const tetraGroup = new THREE.Group();
    const sphereGeometry = new THREE.SphereGeometry(r, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.5,
      metalness: 0.3,
    });

    // Add visual spheres at same positions as physics
    spherePositions.forEach((pos) => {
      const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphereMesh.position.set(pos.x, pos.y, pos.z);
      sphereMesh.castShadow = true;
      tetraGroup.add(sphereMesh);
    });

    scene.add(tetraGroup);

    // Animation loop
    let lastTime = performance.now() / 1000;
    let frameCount = 0;

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();

      // Physics step
      const currentTime = performance.now() / 1000;
      const dt = Math.min(currentTime - lastTime, 0.1);
      lastTime = currentTime;
      world.step(1 / 60, dt, 5);

      // Update visual from physics
      tetraGroup.position.copy(tetraBody.position as any);
      tetraGroup.quaternion.copy(tetraBody.quaternion as any);

      // Log status every 60 frames
      frameCount++;
      if (frameCount % 60 === 0) {
        console.log(
          `🧪 Frame ${frameCount}: Y=${tetraBody.position.y.toFixed(3)}, ` +
          `sleeping=${tetraBody.sleepState}, ` +
          `vel=${tetraBody.velocity.length().toFixed(3)}`
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: 'white',
          fontFamily: 'monospace',
          fontSize: '14px',
          background: 'rgba(0,0,0,0.7)',
          padding: '10px',
          borderRadius: '4px',
          zIndex: 1000,
        }}
      >
        <div>🧪 Physics Test - Tetrahedron</div>
        <div>4 spheres, radius={WORLD_SPHERE_RADIUS.toFixed(4)}</div>
        <div>Edge length={(2 * WORLD_SPHERE_RADIUS).toFixed(4)}</div>
        <div>Check console for status logs</div>
      </div>
    </div>
  );
};
