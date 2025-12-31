'use client';

import { useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';

export default function PipeNetwork({ pipes, wireframe, onClick }) {
  const meshRef = useRef();
  const count = pipes.length;

  // Create geometry and material
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4488ff,
    wireframe: wireframe,
    roughness: 0.7,
    metalness: 0.3,
  });

  useLayoutEffect(() => {
    if (!meshRef.current || pipes.length === 0) return;

    // Set userData to identify this as pipes
    meshRef.current.userData = { type: 'pipe' };

    const tempObject = new THREE.Object3D();
    const tempStart = new THREE.Vector3();
    const tempEnd = new THREE.Vector3();
    const tempMid = new THREE.Vector3();

    pipes.forEach((pipe, i) => {
      tempStart.set(pipe.start[0], pipe.start[1], pipe.start[2]);
      tempEnd.set(pipe.end[0], pipe.end[1], pipe.end[2]);

      // Calculate midpoint
      tempMid.addVectors(tempStart, tempEnd).multiplyScalar(0.5);
      tempObject.position.copy(tempMid);

      // Calculate length
      const length = tempStart.distanceTo(tempEnd);

      // Look at end point and rotate to align cylinder
      tempObject.lookAt(tempEnd);
      tempObject.rotateX(Math.PI / 2);

      // Scale: radius (X, Z) and length (Y)
      const radius = pipe.radius || 0.5;
      tempObject.scale.set(radius, length, radius);

      // Update matrix
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);

      // Set color if available
      if (pipe.color && meshRef.current.setColorAt) {
        const color = new THREE.Color(pipe.color);
        meshRef.current.setColorAt(i, color);
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [pipes]);

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
      {/* All pipes rendered in one draw call */}
    </instancedMesh>
  );
}
