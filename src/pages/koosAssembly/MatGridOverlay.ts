import * as THREE from 'three';

export type MatGridMode = 'A_SQUARE' | 'B_TRIANGULAR';

interface MatGridOverlayProps {
  mode: MatGridMode;
  cells: number;
  size: number;
  y: number;
}

export function createMatGridOverlay(props: MatGridOverlayProps): THREE.LineSegments {
  const { mode, cells, size, y } = props;
  
  const positions: number[] = [];
  const half = size / 2;

  if (mode === 'A_SQUARE') {
    // Square grid: 13 vertical + 13 horizontal lines (cell boundaries)
    const step = size / cells;

    for (let i = 0; i <= cells; i++) {
      const offset = -half + i * step;
      
      // Vertical line (parallel to Z)
      positions.push(-half, y, offset);
      positions.push(half, y, offset);
      
      // Horizontal line (parallel to X)
      positions.push(offset, y, -half);
      positions.push(offset, y, half);
    }
  } else {
    // Triangular grid: three families of parallel lines at 0°, 60°, -60°
    const step = size / cells;
    
    // Helper: clip line to square bounds
    const clipLineToSquare = (
      angle: number,
      k: number
    ): [THREE.Vector2, THREE.Vector2] | null => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const nx = -sinA; // Normal x
      const nz = cosA;  // Normal z
      
      const intersections: THREE.Vector2[] = [];
      
      // Check intersection with 4 edges of square
      // Edge 1: x = -half
      if (Math.abs(nx) > 0.001) {
        const z = (k - nx * (-half)) / nz;
        if (z >= -half && z <= half) {
          intersections.push(new THREE.Vector2(-half, z));
        }
      }
      
      // Edge 2: x = half
      if (Math.abs(nx) > 0.001) {
        const z = (k - nx * half) / nz;
        if (z >= -half && z <= half) {
          intersections.push(new THREE.Vector2(half, z));
        }
      }
      
      // Edge 3: z = -half
      if (Math.abs(nz) > 0.001) {
        const x = (k - nz * (-half)) / nx;
        if (x >= -half && x <= half) {
          intersections.push(new THREE.Vector2(x, -half));
        }
      }
      
      // Edge 4: z = half
      if (Math.abs(nz) > 0.001) {
        const x = (k - nz * half) / nx;
        if (x >= -half && x <= half) {
          intersections.push(new THREE.Vector2(x, half));
        }
      }
      
      // Remove duplicates and return first two
      const unique: THREE.Vector2[] = [];
      for (const pt of intersections) {
        const isDuplicate = unique.some(
          u => Math.abs(u.x - pt.x) < 0.001 && Math.abs(u.y - pt.y) < 0.001
        );
        if (!isDuplicate) {
          unique.push(pt);
        }
      }
      
      if (unique.length >= 2) {
        return [unique[0], unique[1]];
      }
      return null;
    };
    
    // Three families of parallel lines
    const angles = [0, Math.PI / 3, -Math.PI / 3]; // 0°, 60°, -60°
    
    for (const angle of angles) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const nx = -sinA;
      const nz = cosA;
      
      // Determine range of k values that cover the square
      const cornerDots = [
        nx * (-half) + nz * (-half),
        nx * half + nz * (-half),
        nx * (-half) + nz * half,
        nx * half + nz * half,
      ];
      const kMin = Math.min(...cornerDots);
      const kMax = Math.max(...cornerDots);
      
      // Generate lines spaced by step
      const numLines = Math.ceil((kMax - kMin) / step) + 1;
      for (let i = 0; i < numLines; i++) {
        const k = kMin + i * step;
        const segment = clipLineToSquare(angle, k);
        
        if (segment) {
          const [p1, p2] = segment;
          positions.push(p1.x, y, p1.y);
          positions.push(p2.x, y, p2.y);
        }
      }
    }
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  // Create material (subtle, low opacity)
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.15,
  });

  return new THREE.LineSegments(geometry, material);
}
