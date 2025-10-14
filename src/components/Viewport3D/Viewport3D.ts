// Viewport3D: Three.js wrapper for Manual Puzzle 3D rendering
// MVP: Container cells as spheres, hover/click, X-Ray, Slice Y

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ContainerV3, IJK, VisibilitySettings } from '../../types/lattice';

export interface ViewportOpts {
  sphereRadius?: number;
}

export class Viewport3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container?: ContainerV3;
  
  // Cells rendering
  private cellsGroup: THREE.Group;
  private instancedMesh?: THREE.InstancedMesh;
  private cellPositions: Map<string, IJK> = new Map(); // key: "i,j,k" -> IJK
  
  // Hover & selection
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private hoveredCell: IJK | null = null;
  private selectedAnchor: IJK | null = null;
  private hoverSphere?: THREE.Mesh;
  private anchorSphere?: THREE.Mesh;
  
  // Visibility
  private visibility: VisibilitySettings = {
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 0.1 }
  };
  private slicePlanes: THREE.Mesh[] = [];
  
  // Callbacks
  private onHoverCellCallback?: (ijk: IJK | null) => void;
  private onClickCellCallback?: (ijk: IJK) => void;
  
  // Options
  private sphereRadius: number;
  
  constructor(canvasEl: HTMLElement, opts: ViewportOpts = {}) {
    this.sphereRadius = opts.sphereRadius ?? 0.5;
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a); // Dark gray, not pure black
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      canvasEl.clientWidth / canvasEl.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 10, 10);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    canvasEl.appendChild(this.renderer.domElement);
    
    // Controls - match SceneCanvas settings
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 100;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.enableRotate = true;
    
    // Lighting - match SceneCanvas multi-light setup
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    this.scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    directionalLight1.position.set(10, 10, 5);
    this.scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-10, -10, -5);
    this.scene.add(directionalLight2);
    
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight3.position.set(5, -10, 10);
    this.scene.add(directionalLight3);
    
    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight4.position.set(-5, 10, -10);
    this.scene.add(directionalLight4);
    
    // Groups
    this.cellsGroup = new THREE.Group();
    this.scene.add(this.cellsGroup);
    
    // Debug: Add a test cube at origin to verify rendering works
    const testGeometry = new THREE.BoxGeometry(1, 1, 1);
    const testMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(0, 0, 0);
    this.scene.add(testCube);
    console.log('🎲 Debug test cube added at origin (red, 1x1x1)');
    
    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Event listeners
    this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.renderer.domElement.addEventListener('click', this.handleClick.bind(this));
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // Animation loop
    this.animate();
    
    // Debug: Log canvas and renderer info
    console.log('✅ Viewport3D initialized');
    console.log(`   Canvas size: ${canvasEl.clientWidth} x ${canvasEl.clientHeight}`);
    console.log(`   Renderer size: ${this.renderer.domElement.width} x ${this.renderer.domElement.height}`);
    console.log(`   Canvas parent:`, canvasEl.parentElement);
    console.log(`   Canvas style:`, canvasEl.style.cssText);
  }
  
  setContainer(container: ContainerV3): void {
    this.container = container;
    this.cellPositions.clear();
    this.hoveredCell = null;
    this.selectedAnchor = null;
    
    // Clear previous geometry
    if (this.instancedMesh) {
      this.cellsGroup.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
    }
    
    console.log(`🔨 Building container: ${container.name} (${container.cells.length} cells)`);
    
    // Create instanced mesh for all cells
    const geometry = new THREE.SphereGeometry(this.sphereRadius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 1.0,
      metalness: 0,
      roughness: 0.5
    });
    
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, container.cells.length);
    
    // Position each cell
    const matrix = new THREE.Matrix4();
    
    container.cells.forEach((ijk, index) => {
      const [i, j, k] = ijk;
      const key = `${i},${j},${k}`;
      this.cellPositions.set(key, ijk);
      
      // Convert IJK to world position (FCC lattice)
      const pos = this.ijkToWorld(ijk);
      matrix.setPosition(pos.x, pos.y, pos.z);
      this.instancedMesh!.setMatrixAt(index, matrix);
    });
    
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.cellsGroup.add(this.instancedMesh);
    
    console.log(`📊 InstancedMesh created with ${container.cells.length} instances`);
    console.log(`📍 First cell position:`, this.ijkToWorld(container.cells[0]));
    console.log(`🎨 Material:`, material);
    console.log(`🔍 InstancedMesh visible:`, this.instancedMesh.visible);
    console.log(`🔍 InstancedMesh in scene:`, this.scene.children.includes(this.cellsGroup));
    console.log(`🔍 CellsGroup children:`, this.cellsGroup.children.length);
    
    // Fit camera
    this.fitCamera();
    
    // Apply visibility settings
    this.updateVisibility();
    
    console.log(`✅ Container rendered: ${container.cells.length} cells`);
  }
  
  setVisibility(settings: Partial<VisibilitySettings>): void {
    this.visibility = { ...this.visibility, ...settings };
    this.updateVisibility();
  }
  
  onHoverCell(callback: (ijk: IJK | null) => void): void {
    this.onHoverCellCallback = callback;
  }
  
  onClickCell(callback: (ijk: IJK) => void): void {
    this.onClickCellCallback = callback;
  }
  
  setAnchor(ijk: IJK | null): void {
    this.selectedAnchor = ijk;
    this.updateAnchorVisual();
  }
  
  resetCamera(): void {
    if (this.container) {
      this.fitCamera();
    }
  }
  
  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('click', this.handleClick);
    
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      (this.instancedMesh.material as THREE.Material).dispose();
    }
    
    this.controls.dispose();
    this.renderer.dispose();
    
    console.log('🗑️ Viewport3D disposed');
  }
  
  // Private methods
  
  private ijkToWorld(ijk: IJK): THREE.Vector3 {
    // FCC lattice: convert IJK to world XYZ
    // Same as ijkToXyz in lib/ijk.ts
    // a1 = (0.5, 0.5, 0), a2 = (0.5, 0, 0.5), a3 = (0, 0.5, 0.5)
    const [i, j, k] = ijk;
    return new THREE.Vector3(
      0.5 * (i + j),
      0.5 * (i + k),
      0.5 * (j + k)
    );
  }
  
  private updateVisibility(): void {
    if (!this.instancedMesh) return;
    
    const material = this.instancedMesh.material as THREE.MeshStandardMaterial;
    
    // X-Ray mode
    material.opacity = this.visibility.xray ? 0.25 : 1.0;
    material.needsUpdate = true;
    
    // Slice Y
    this.updateSliceY();
    
    console.log('🎨 Visibility updated:', this.visibility);
  }
  
  private updateSliceY(): void {
    if (!this.container || !this.instancedMesh) return;
    
    // Remove old slice planes
    this.slicePlanes.forEach(plane => this.scene.remove(plane));
    this.slicePlanes = [];
    
    const { center, thickness } = this.visibility.sliceY;
    
    // Compute world Y bounds
    const allY = this.container.cells.map(ijk => this.ijkToWorld(ijk).y);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const range = maxY - minY;
    
    const centerY = minY + range * center;
    const halfThickness = (range * thickness) / 2;
    const lowY = centerY - halfThickness;
    const highY = centerY + halfThickness;
    
    // For MVP: We can't easily hide individual instances without instance colors
    // Just log for now - full implementation would require instance color buffer
    console.log(`🔪 Slice Y active: ${lowY.toFixed(2)} to ${highY.toFixed(2)} (world Y)`);
    
    // Add visual planes at bounds
    if (thickness < 1.0 && thickness > 0) {
      const planeGeometry = new THREE.PlaneGeometry(50, 50);
      const planeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
      });
      
      const lowPlane = new THREE.Mesh(planeGeometry, planeMaterial);
      lowPlane.rotation.x = Math.PI / 2;
      lowPlane.position.y = lowY;
      this.scene.add(lowPlane);
      this.slicePlanes.push(lowPlane);
      
      const highPlane = new THREE.Mesh(planeGeometry, planeMaterial.clone());
      highPlane.rotation.x = Math.PI / 2;
      highPlane.position.y = highY;
      this.scene.add(highPlane);
      this.slicePlanes.push(highPlane);
    }
  }
  
  private handleMouseMove(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.updateHover();
  }
  
  private handleClick(_event: MouseEvent): void {
    if (this.hoveredCell && this.onClickCellCallback) {
      this.selectedAnchor = this.hoveredCell;
      this.onClickCellCallback(this.hoveredCell);
      this.updateAnchorVisual();
      console.log(`📍 Anchor set: [${this.hoveredCell}]`);
    }
  }
  
  private updateHover(): void {
    if (!this.instancedMesh) return;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.instancedMesh);
    
    let newHovered: IJK | null = null;
    
    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      const index = intersects[0].instanceId;
      const ijk = this.container!.cells[index];
      newHovered = ijk;
    }
    
    if (newHovered !== this.hoveredCell) {
      this.hoveredCell = newHovered;
      if (this.onHoverCellCallback) {
        this.onHoverCellCallback(newHovered);
      }
      this.updateHoverVisual();
    }
  }
  
  private updateHoverVisual(): void {
    // Remove old hover sphere
    if (this.hoverSphere) {
      this.scene.remove(this.hoverSphere);
      this.hoverSphere = undefined;
    }
    
    if (this.hoveredCell) {
      const pos = this.ijkToWorld(this.hoveredCell);
      const geometry = new THREE.SphereGeometry(this.sphereRadius * 1.2, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: 0x4499ff,
        transparent: true,
        opacity: 0.6
      });
      
      this.hoverSphere = new THREE.Mesh(geometry, material);
      this.hoverSphere.position.copy(pos);
      this.scene.add(this.hoverSphere);
    }
  }
  
  private updateAnchorVisual(): void {
    // Remove old anchor sphere
    if (this.anchorSphere) {
      this.scene.remove(this.anchorSphere);
      this.anchorSphere = undefined;
    }
    
    if (this.selectedAnchor) {
      const pos = this.ijkToWorld(this.selectedAnchor);
      const geometry = new THREE.SphereGeometry(this.sphereRadius * 1.3, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: 0x0066ff,
        emissive: 0x0033aa,
        emissiveIntensity: 0.5
      });
      
      this.anchorSphere = new THREE.Mesh(geometry, material);
      this.anchorSphere.position.copy(pos);
      this.scene.add(this.anchorSphere);
    }
  }
  
  private fitCamera(): void {
    if (!this.container || this.container.cells.length === 0) return;
    
    const box = new THREE.Box3();
    this.container.cells.forEach(ijk => {
      const pos = this.ijkToWorld(ijk);
      box.expandByPoint(pos);
    });
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const distance = maxDim * 2.5;
    this.camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );
    
    this.controls.target.copy(center);
    this.controls.update();
    
    console.log(`📷 Camera fitted to container bounds:`);
    console.log(`   Box min:`, box.min);
    console.log(`   Box max:`, box.max);
    console.log(`   Center:`, center);
    console.log(`   Size:`, size);
    console.log(`   MaxDim:`, maxDim);
    console.log(`   Camera position:`, this.camera.position);
    console.log(`   Camera target:`, this.controls.target);
  }
  
  private handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    
    this.camera.aspect = parent.clientWidth / parent.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
  };
  
  private animate = (): void => {
    requestAnimationFrame(this.animate);
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
