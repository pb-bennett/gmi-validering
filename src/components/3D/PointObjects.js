'use client';

import { useRef, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

export default function PointObjects({
  points,
  wireframe,
  geometryType = 'cylinder',
  arrayType = 'cylinder',
}) {
  const meshRef = useRef();
  const count = points.length;

  // Create geometry based on type
  const geometry = useMemo(() => {
    switch (geometryType) {
      case 'sphere':
        return new THREE.SphereGeometry(1, 16, 12);
      case 'lok':
        // Flat disc (cylinder with very small height)
        return new THREE.CylinderGeometry(1, 1, 1, 16, 1);
      case 'cylinder':
      default:
        return new THREE.CylinderGeometry(1, 1, 1, 8, 1);
    }
  }, [geometryType]);

  // Material - created once (wireframe updated separately via useLayoutEffect)
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xff8844,
        wireframe: false,
        roughness: 0.7,
        metalness: 0.3,
      }),
    []
  );

  useLayoutEffect(() => {
    if (!meshRef.current || points.length === 0) return;

    // Set userData to identify this as points with array type
    meshRef.current.userData = {
      type: 'point',
      arrayType: arrayType,
    };

    const tempObject = new THREE.Object3D();

    points.forEach((point, i) => {
      if (geometryType === 'sphere') {
        // Spheres: position at point, scale by radius
        tempObject.position.set(
          point.position[0],
          point.position[1],
          point.position[2]
        );
        tempObject.rotation.set(0, 0, 0);
        const radius = point.radius || 0.5;
        tempObject.scale.set(radius, radius, radius);
      } else if (geometryType === 'lok') {
        // LOK: flat disc on top of ground
        tempObject.position.set(
          point.position[0],
          point.position[1] + point.thickness / 2,
          point.position[2]
        );
        tempObject.rotation.set(0, 0, 0);
        const radius = point.radius || 0.3;
        const thickness = point.thickness || 0.07;
        tempObject.scale.set(radius, thickness, radius);
      } else {
        // Cylinders (KUM, SLU, SLS, SAN): vertical cylinders with depth
        tempObject.position.set(
          point.position[0],
          point.position[1] + (point.depth || 2) / 2, // Center the cylinder vertically
          point.position[2]
        );
        tempObject.rotation.set(0, 0, 0);
        const radius = point.radius || 1;
        const depth = point.depth || 2;
        tempObject.scale.set(radius, depth, radius);
      }

      // Update matrix
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);

      // Set color if available
      if (point.color && meshRef.current.setColorAt) {
        const color = new THREE.Color(point.color);
        meshRef.current.setColorAt(i, color);
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [points, geometryType, arrayType]);

  // Update wireframe material
  useLayoutEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.wireframe = wireframe;
      meshRef.current.material.needsUpdate = true;
    }
  }, [wireframe]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, count]}>
      {/* All points rendered in one draw call */}
    </instancedMesh>
  );
}
