'use client';

import { OrbitControls, Grid } from '@react-three/drei';
import {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import PipeNetwork from './PipeNetwork';
import PointObjects from './PointObjects';
import {
  transformPipes,
  transformPoints,
} from '@/lib/3d/transformGMIData';

export default function Scene3D({
  data,
  hiddenCodes = [],
  onObjectClick,
}) {
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const controlsRef = useRef();
  const hoveredPointRef = useRef(null);
  const { camera, gl, scene } = useThree();

  // Transform GMI data to 3D format
  const { pipes: allPipes, center } = useMemo(() => {
    if (!data?.lines) return { pipes: [], center: [0, 0, 0] };
    return transformPipes(data.lines, data.header);
  }, [data]);

  const allPointData = useMemo(() => {
    if (!data?.points)
      return { cylinders: [], spheres: [], loks: [] };
    return transformPoints(data.points, data.header, center);
  }, [data, center]);

  // Filter pipes based on hiddenCodes (Tema filter)
  const pipes = useMemo(() => {
    if (!hiddenCodes || hiddenCodes.length === 0) return allPipes;
    return allPipes.filter(
      (pipe) => !hiddenCodes.includes(pipe.fcode)
    );
  }, [allPipes, hiddenCodes]);

  // Filter point data based on hiddenCodes (Tema filter)
  const pointData = useMemo(() => {
    if (!hiddenCodes || hiddenCodes.length === 0) return allPointData;
    return {
      cylinders: allPointData.cylinders.filter(
        (p) => !hiddenCodes.includes(p.fcode)
      ),
      spheres: allPointData.spheres.filter(
        (p) => !hiddenCodes.includes(p.fcode)
      ),
      loks: allPointData.loks.filter(
        (p) => !hiddenCodes.includes(p.fcode)
      ),
    };
  }, [allPointData, hiddenCodes]);

  // Combine all point types for click detection
  const allPoints = useMemo(() => {
    return [
      ...pointData.cylinders,
      ...pointData.spheres,
      ...pointData.loks,
    ];
  }, [pointData]);

  // Listen for control events from UI
  useEffect(() => {
    const handleResetCamera = () => {
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        camera.position.set(100, 100, 100);
        controlsRef.current.update();
      }
    };

    const handleToggleWireframe = () => {
      setWireframe((prev) => !prev);
    };

    const handleToggleGrid = () => {
      setShowGrid((prev) => !prev);
    };

    window.addEventListener('reset3DCamera', handleResetCamera);
    window.addEventListener(
      'toggle3DWireframe',
      handleToggleWireframe
    );
    window.addEventListener('toggle3DGrid', handleToggleGrid);

    return () => {
      window.removeEventListener('reset3DCamera', handleResetCamera);
      window.removeEventListener(
        'toggle3DWireframe',
        handleToggleWireframe
      );
      window.removeEventListener('toggle3DGrid', handleToggleGrid);
    };
  }, [camera]);

  // Raycaster for hover detection
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouseRef = useRef(new THREE.Vector2());

  // Track mouse position for hover detection
  const handleMouseMove = useCallback(
    (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = mouseRef.current;
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        scene.children,
        true
      );

      if (
        intersects.length > 0 &&
        intersects[0].object.userData?.type
      ) {
        hoveredPointRef.current = intersects[0].point.clone();
      } else {
        hoveredPointRef.current = null;
      }
    },
    [gl, camera, raycaster, scene]
  );

  // Handle wheel event for hover-to-zoom
  const handleWheel = useCallback((event) => {
    if (hoveredPointRef.current && controlsRef.current) {
      // Smoothly move target towards hovered point when zooming
      const target = controlsRef.current.target;
      const hovered = hoveredPointRef.current;

      // Interpolate target towards hovered point (subtle effect)
      const lerpFactor = 0.1;
      target.lerp(hovered, lerpFactor);
      controlsRef.current.update();
    }
  }, []);

  // Handle click to recenter focus or show tooltip
  const handleCanvasClick = useCallback(
    (event) => {
      if (!controlsRef.current) return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = mouseRef.current;
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Check intersections with all objects in the scene
      const intersects = raycaster.intersectObjects(
        scene.children,
        true
      );

      if (intersects.length > 0) {
        const intersect = intersects[0];
        const point = intersect.point;

        // Try to find which object was clicked
        const instanceId = intersect.instanceId;

        if (
          instanceId !== undefined &&
          onObjectClick &&
          intersect.object.userData?.type
        ) {
          // Check if it's a pipe segment - use lineIndex from pipes array
          if (
            intersect.object.userData?.type === 'pipe' &&
            pipes[instanceId]
          ) {
            const pipeSegment = pipes[instanceId];
            const lineIndex = pipeSegment.lineIndex;
            const line = data.lines?.[lineIndex];

            if (line) {
              const coordinates = line.coordinates?.[0]
                ? [line.coordinates[0].y, line.coordinates[0].x] // [lat, lng]
                : null;

              onObjectClick(
                {
                  type: 'pipe',
                  fcode: line.attributes?.S_FCODE || 'UNKNOWN',
                  attributes: line.attributes || {},
                  coordinates: coordinates,
                  featureId: `ledninger-${lineIndex}`,
                },
                event
              );
            }
          } else if (intersect.object.userData?.type === 'point') {
            // Find the point data from one of the arrays
            let pointDataItem = null;
            let arrayType = null;

            if (
              intersect.object.userData?.arrayType === 'cylinder' &&
              pointData.cylinders[instanceId]
            ) {
              pointDataItem = pointData.cylinders[instanceId];
              arrayType = 'cylinder';
            } else if (
              intersect.object.userData?.arrayType === 'sphere' &&
              pointData.spheres[instanceId]
            ) {
              pointDataItem = pointData.spheres[instanceId];
              arrayType = 'sphere';
            } else if (
              intersect.object.userData?.arrayType === 'lok' &&
              pointData.loks[instanceId]
            ) {
              pointDataItem = pointData.loks[instanceId];
              arrayType = 'lok';
            }

            if (pointDataItem) {
              const pointIndex = pointDataItem.pointIndex;
              const pointObj = data.points?.[pointIndex];

              if (pointObj) {
                const coordinates = pointObj.coordinates?.[0]
                  ? [
                      pointObj.coordinates[0].y,
                      pointObj.coordinates[0].x,
                    ] // [lat, lng]
                  : null;

                onObjectClick(
                  {
                    type: 'point',
                    fcode: pointObj.attributes?.S_FCODE || 'UNKNOWN',
                    attributes: pointObj.attributes || {},
                    coordinates: coordinates,
                    featureId: `punkter-${pointIndex}`,
                  },
                  event
                );
              }
            }
          }
        }

        // Smoothly move the controls target to the clicked point
        controlsRef.current.target.copy(point);
        controlsRef.current.update();
      }
    },
    [
      gl,
      camera,
      raycaster,
      scene,
      data,
      pipes,
      pointData,
      onObjectClick,
    ]
  );

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel, { passive: true });
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [gl, handleMouseMove, handleWheel, handleCanvasClick]);

  return (
    <>
      {/* Lighting - brighter setup with multiple sources */}
      <ambientLight intensity={1.2} />
      <directionalLight
        position={[50, 100, 50]}
        intensity={1.5}
        castShadow={false}
      />
      <directionalLight position={[-50, 80, -50]} intensity={0.8} />
      <directionalLight position={[0, -50, 0]} intensity={0.4} />
      <hemisphereLight
        skyColor={0xffffff}
        groundColor={0xcccccc}
        intensity={0.6}
      />

      {/* Camera Controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={2000}
        maxPolarAngle={Math.PI / 1.5}
        zoomSpeed={2}
        panSpeed={2}
        rotateSpeed={1}
      />

      {/* Grid */}
      {showGrid && (
        <Grid
          args={[500, 500]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#6f6f6f"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#9d4b4b"
          fadeDistance={1000}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Render Pipes */}
      {pipes.length > 0 && (
        <PipeNetwork pipes={pipes} wireframe={wireframe} />
      )}

      {/* Render Point Cylinders (KUM, SLU, SLS, SAN) */}
      {pointData.cylinders.length > 0 && (
        <PointObjects
          points={pointData.cylinders}
          wireframe={wireframe}
          geometryType="cylinder"
          arrayType="cylinder"
        />
      )}

      {/* Render Point Spheres (other punkter) */}
      {pointData.spheres.length > 0 && (
        <PointObjects
          points={pointData.spheres}
          wireframe={wireframe}
          geometryType="sphere"
          arrayType="sphere"
        />
      )}

      {/* Render LOK (flat discs) */}
      {pointData.loks.length > 0 && (
        <PointObjects
          points={pointData.loks}
          wireframe={wireframe}
          geometryType="lok"
          arrayType="lok"
        />
      )}

      {/* Make wireframe and grid toggleable from parent */}
      <WireframeContext.Provider
        value={{ wireframe, setWireframe, showGrid, setShowGrid }}
      >
        <></>
      </WireframeContext.Provider>
    </>
  );
}

// Context for sharing state with Controls3D
import { createContext } from 'react';
export const WireframeContext = createContext(null);
