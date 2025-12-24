import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AssemblyPiece, PieceId } from './loadSolutionForAssembly';
import { PieceTransform } from './computeAssemblyTransforms';

// Sphere coordinates are already in world units (spacing = 2*radius)
// No FCC_SPACING needed - data is pre-scaled

interface PieceProxiesProps {
  pieces: AssemblyPiece[];
  transforms: Record<PieceId, PieceTransform>;
  sphereRadiusWorld: number;
}

export const PieceProxies: React.FC<PieceProxiesProps> = ({
  pieces,
  transforms,
  sphereRadiusWorld,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    // Get scene from parent (assumes this is rendered inside a Three.js context)
    // For now, we'll need to pass the scene from AssemblyCanvas
    // This is a placeholder - we'll integrate properly
    return () => {
      // Cleanup
      if (groupRef.current) {
        groupRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!groupRef.current || !sceneRef.current) return;

    // Clear previous meshes
    groupRef.current.clear();

    // Shared sphere geometry for all instances
    const sphereGeometry = new THREE.SphereGeometry(sphereRadiusWorld, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      roughness: 0.5,
      metalness: 0.3,
    });

    // Render each piece
    pieces.forEach((piece) => {
      const transform = transforms[piece.pieceId];
      if (!transform) return;

      // Create a group for this piece
      const pieceGroup = new THREE.Group();
      pieceGroup.position.copy(transform.position);
      pieceGroup.quaternion.copy(transform.quaternion);

      // Add sphere instances for each sphere in the piece
      // Coordinates already in world units - use directly
      piece.spheres.forEach((sphere) => {
        const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(sphere.x, sphere.y, sphere.z);
        sphereMesh.castShadow = true;
        sphereMesh.receiveShadow = true;
        pieceGroup.add(sphereMesh);
      });

      groupRef.current!.add(pieceGroup);
    });
  }, [pieces, transforms, sphereRadiusWorld]);

  // This component needs to be integrated into the scene
  // For now, return null - we'll render directly in AssemblyCanvas
  return null;
};

// Export a function that creates and manages piece meshes directly
export function createPieceProxies(
  parent: THREE.Group | THREE.Scene,
  pieces: AssemblyPiece[],
  transforms: Record<PieceId, PieceTransform>,
  sphereRadiusWorld: number
): THREE.Group {
  const group = new THREE.Group();
  
  // Shared sphere geometry for all instances
  const sphereGeometry = new THREE.SphereGeometry(sphereRadiusWorld, 32, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3333,
    roughness: 0.5,
    metalness: 0.3,
  });

  // Render each piece
  pieces.forEach((piece) => {
    const transform = transforms[piece.pieceId];
    if (!transform) return;

    // Create a group for this piece
    const pieceGroup = new THREE.Group();
    pieceGroup.position.copy(transform.position);
    pieceGroup.quaternion.copy(transform.quaternion);

    // Add sphere instances for each sphere in the piece
    // Coordinates already in world units - use directly
    piece.spheres.forEach((sphere) => {
      const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphereMesh.position.set(sphere.x, sphere.y, sphere.z);
      sphereMesh.castShadow = true;
      sphereMesh.receiveShadow = true;
      pieceGroup.add(sphereMesh);
    });

    group.add(pieceGroup);
  });

  parent.add(group);
  return group;
}

// Function to update piece transforms and visibility
export function updatePieceTransforms(
  group: THREE.Group,
  transforms: Record<PieceId, PieceTransform>,
  pieceIds: PieceId[],
  visibilityMap?: Record<PieceId, boolean>
): void {
  // Assumes group.children are in the same order as pieceIds
  group.children.forEach((child, index) => {
    const pieceId = pieceIds[index];
    const transform = transforms[pieceId];
    if (!transform) return;

    child.position.copy(transform.position);
    child.quaternion.copy(transform.quaternion);
    
    // Update visibility if map provided
    if (visibilityMap !== undefined) {
      child.visible = visibilityMap[pieceId] ?? false;
    }
  });
}
