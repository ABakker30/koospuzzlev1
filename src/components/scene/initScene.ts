import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HDRLoader } from "../../services/HDRLoader";

type InitSceneParams = {
  mountEl: HTMLDivElement;
  brightness: number;

  onSceneReady?: (objects: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  }) => void;

  refs: {
    sceneRef: React.MutableRefObject<THREE.Scene | undefined>;
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | undefined>;
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | undefined>;
    controlsRef: React.MutableRefObject<any>;
    placedPiecesGroupRef: React.MutableRefObject<THREE.Group | null>;
    raycasterRef: React.MutableRefObject<THREE.Raycaster | undefined>;
    mouseRef: React.MutableRefObject<THREE.Vector2 | undefined>;
    ambientLightRef: React.MutableRefObject<THREE.AmbientLight | null>;
    directionalLightsRef: React.MutableRefObject<THREE.DirectionalLight[]>;
    hdrLoaderRef: React.MutableRefObject<any>;
    onFrameCallbackRef?: React.MutableRefObject<(() => void) | null>;
  };

  setHdrInitialized: (v: boolean) => void;
};

export function initScene({
  mountEl,
  brightness,
  onSceneReady,
  refs,
  setHdrInitialized,
}: InitSceneParams) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const placedPiecesGroup = new THREE.Group();
  scene.add(placedPiecesGroup);
  refs.placedPiecesGroupRef.current = placedPiecesGroup;

  const width = mountEl.clientWidth;
  const height = mountEl.clientHeight;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = false;
  mountEl.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0x404040, 0.6 * brightness);
  scene.add(ambient);
  refs.ambientLightRef.current = ambient;

  const dirs: THREE.DirectionalLight[] = [];
  const addDir = (x: number, y: number, z: number, i: number) => {
    const l = new THREE.DirectionalLight(0xffffff, i * brightness);
    l.position.set(x, y, z);
    scene.add(l);
    dirs.push(l);
  };

  addDir(10, 10, 5, 0.8);
  addDir(-10, -10, -5, 0.4);
  addDir(5, -10, 10, 0.3);
  addDir(-5, 10, -10, 0.3);

  refs.directionalLightsRef.current = dirs;

  // Raycasting
  refs.raycasterRef.current = new THREE.Raycaster();
  refs.mouseRef.current = new THREE.Vector2();

  // HDR
  if (!refs.hdrLoaderRef.current) {
    HDRLoader.resetInstance();
  }
  const hdrLoader = HDRLoader.getInstance();
  hdrLoader.initializePMREMGenerator(renderer);
  refs.hdrLoaderRef.current = hdrLoader;
  setHdrInitialized(true);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableRotate = true;

  // Store refs
  refs.sceneRef.current = scene;
  refs.cameraRef.current = camera;
  refs.rendererRef.current = renderer;
  refs.controlsRef.current = controls;

  if (onSceneReady) {
    onSceneReady({
      scene,
      camera,
      renderer,
      controls,
      spheresGroup: placedPiecesGroup,
      centroidWorld: new THREE.Vector3(0, 0, 0),
    });
  }

  // Render loop
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    // Call per-frame callback if provided (e.g., for transparent sorting)
    if (refs.onFrameCallbackRef?.current) {
      refs.onFrameCallbackRef.current();
    }
    renderer.render(scene, camera);
  };
  loop();

  const handleResize = () => {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  };

  const handleOrientationChange = () => setTimeout(handleResize, 100);

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleOrientationChange);
  setTimeout(handleResize, 50);

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleOrientationChange);
    cancelAnimationFrame(raf);

    if (renderer.domElement.parentNode === mountEl) {
      mountEl.removeChild(renderer.domElement);
    }

    renderer.dispose();
    controls.dispose();

    refs.hdrLoaderRef.current = null;
    setHdrInitialized(false);
  };
}
