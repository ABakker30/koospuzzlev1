import type { XYZ } from "../types/shape";
import type { Hull, HullFace } from "../services/ViewTransforms";
import QuickHull from "quickhull3d";

export function quickHullWithCoplanarMerge(pointsRounded3: XYZ[], epsilon: number = 1e-6): Hull {
  if (pointsRounded3.length < 4) {
    // Degenerate case - create a simple face
    return { faces: [{ area: 1, normal: { x: 0, y: 1, z: 0 }, vertices: pointsRounded3 }] };
  }

  // Convert points to the format quickhull3d expects
  let hullFaces: number[][];
  
  try {
    // Format 1: Array of [x,y,z] arrays
    const pointsArray = pointsRounded3.map((p: XYZ) => [p.x, p.y, p.z]);
    hullFaces = QuickHull(pointsArray as any);
  } catch (e1) {
    try {
      // Format 2: Flat array [x1,y1,z1,x2,y2,z2,...]
      const flatArray = pointsRounded3.flatMap((p: XYZ) => [p.x, p.y, p.z]);
      hullFaces = QuickHull(flatArray as any);
    } catch (e2) {
      try {
        // Format 3: Array of {x,y,z} objects
        const objArray = pointsRounded3.map((p: XYZ) => ({ x: p.x, y: p.y, z: p.z }));
        hullFaces = QuickHull(objArray as any);
      } catch (e3) {
        console.warn(`⚠️ QuickHull failed, using fallback bounding box`);
        return createBoundingBoxHullFromPoints(pointsRounded3);
      }
    }
  }
  
  // Convert to our HullFace format
  const faces: HullFace[] = hullFaces.map(face => {
    // face is an array of vertex indices
    const vertices = face.map(idx => pointsRounded3[idx]);
    const { area, normal } = calculateFaceAreaAndNormal(vertices, pointsRounded3);
    return { area, normal, vertices };
  });

  // Merge coplanar faces
  const mergedFaces = mergeCoplanarFaces(faces, epsilon);
  
  return { faces: mergedFaces };
}

function calculateFaceAreaAndNormal(vertices: XYZ[], allPoints?: XYZ[]): { area: number; normal: XYZ } {
  if (vertices.length < 3) {
    return { area: 0, normal: { x: 0, y: 1, z: 0 } };
  }

  // Use first three vertices to calculate normal and area
  const v0 = vertices[0];
  const v1 = vertices[1];
  const v2 = vertices[2];

  const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
  const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

  // Cross product for normal
  let normal = {
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x
  };

  // Normalize
  const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (length > 0) {
    normal.x /= length;
    normal.y /= length;
    normal.z /= length;
  }

  // Ensure normal points outward from centroid (if we have all points)
  if (allPoints && allPoints.length > 0) {
    const centroid = { x: 0, y: 0, z: 0 };
    for (const p of allPoints) {
      centroid.x += p.x;
      centroid.y += p.y;
      centroid.z += p.z;
    }
    centroid.x /= allPoints.length;
    centroid.y /= allPoints.length;
    centroid.z /= allPoints.length;

    // Vector from centroid to face
    const toFace = { x: v0.x - centroid.x, y: v0.y - centroid.y, z: v0.z - centroid.z };
    const dot = normal.x * toFace.x + normal.y * toFace.y + normal.z * toFace.z;
    
    // If dot product is negative, normal points inward - flip it
    if (dot < 0) {
      normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }
  }

  // Area is half the magnitude of cross product
  const area = length * 0.5;

  return { area, normal };
}

function mergeCoplanarFaces(faces: HullFace[], epsilon: number): HullFace[] {
  const merged: HullFace[] = [];
  const used = new Set<number>();

  for (let i = 0; i < faces.length; i++) {
    if (used.has(i)) continue;

    const face = faces[i];
    const coplanarFaces = [face];
    used.add(i);

    // Find coplanar faces
    for (let j = i + 1; j < faces.length; j++) {
      if (used.has(j)) continue;

      const other = faces[j];
      if (areCoplanar(face.normal, other.normal, epsilon)) {
        coplanarFaces.push(other);
        used.add(j);
      }
    }

    // Merge coplanar faces into one
    if (coplanarFaces.length === 1) {
      merged.push(face);
    } else {
      const mergedFace = mergeFaces(coplanarFaces);
      merged.push(mergedFace);
    }
  }

  return merged;
}

function areCoplanar(n1: XYZ, n2: XYZ, epsilon: number): boolean {
  const dot = Math.abs(n1.x * n2.x + n1.y * n2.y + n1.z * n2.z);
  return Math.abs(dot - 1) < epsilon;
}

function mergeFaces(faces: HullFace[]): HullFace {
  // Simple merge - combine all vertices and recalculate
  const allVertices: XYZ[] = [];
  let totalArea = 0;

  for (const face of faces) {
    allVertices.push(...face.vertices);
    totalArea += face.area;
  }

  // Use the normal from the largest face
  const largestFace = faces.reduce((max, face) => face.area > max.area ? face : max);

  return {
    area: totalArea,
    normal: largestFace.normal,
    vertices: allVertices
  };
}

function createBoundingBoxHullFromPoints(points: XYZ[]): Hull {
  console.log(`📦 Creating bounding box hull fallback for ${points.length} points`);
  
  // Compute bounding box
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  
  for (const p of points) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  
  // Create 6 faces of the bounding box
  const faces: HullFace[] = [
    { area: (max.x - min.x) * (max.z - min.z), normal: { x: 0, y: 1, z: 0 }, vertices: [] }, // top
    { area: (max.x - min.x) * (max.z - min.z), normal: { x: 0, y: -1, z: 0 }, vertices: [] }, // bottom
    { area: (max.y - min.y) * (max.z - min.z), normal: { x: 1, y: 0, z: 0 }, vertices: [] }, // right
    { area: (max.y - min.y) * (max.z - min.z), normal: { x: -1, y: 0, z: 0 }, vertices: [] }, // left
    { area: (max.x - min.x) * (max.y - min.y), normal: { x: 0, y: 0, z: 1 }, vertices: [] }, // front
    { area: (max.x - min.x) * (max.y - min.y), normal: { x: 0, y: 0, z: -1 }, vertices: [] }  // back
  ];
  
  console.log(`📦 Bounding box hull: 6 faces, largest area: ${Math.max(...faces.map(f => f.area)).toFixed(3)}`);
  return { faces };
}

