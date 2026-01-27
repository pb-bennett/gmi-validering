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
  hiddenTypes = [],
  feltFilterActive = false,
  feltHiddenValues = [],
  highlightedFeltField = null,
  highlightedFeltValue = null,
  highlightedFeltObjectType = null,
  selectedObject = null,
  onObjectClick,
}) {
  const [showGrid, setShowGrid] = useState(true);
  const controlsRef = useRef();
  const hoveredPointRef = useRef(null);
  const { camera, gl, scene } = useThree();

  // Helper function to check if an item is hidden by type filter
  const isHiddenByType = (item) => {
    if (!hiddenTypes || hiddenTypes.length === 0) return false;
    const typeVal =
      item.type || item.attributes?.Type || '(Mangler Type)';
    const fcode = item.fcode;
    return hiddenTypes.some(
      (ht) =>
        ht.type === typeVal && (ht.code === null || ht.code === fcode)
    );
  };

  // Helper function to check if an item is hidden by Felt filter
  const isHiddenByFeltFilter = (item, objectType) => {
    if (!feltFilterActive || !feltHiddenValues || feltHiddenValues.length === 0)
      return false;
    const attrs = item.attributes || {};
    return feltHiddenValues.some((hidden) => {
      if (hidden.objectType !== objectType) return false;
      const featureValue = attrs[hidden.fieldName];
      const normalizedValue =
        featureValue === null ||
        featureValue === undefined ||
        featureValue === ''
          ? '(Mangler)'
          : String(featureValue);
      return normalizedValue === hidden.value;
    });
  };

  // Helper function to check if an item is highlighted by Felt hover
  const isHighlightedByFelt = (item, objectType) => {
    if (!highlightedFeltField || !highlightedFeltValue) return false;
    if (highlightedFeltObjectType !== objectType) return false;
    const attrs = item.attributes || {};
    const featureValue = attrs[highlightedFeltField];
    const normalizedValue =
      featureValue === null ||
      featureValue === undefined ||
      featureValue === ''
        ? '(Mangler)'
        : String(featureValue);
    return normalizedValue === highlightedFeltValue;
  };

  // Transform GMI data to 3D format
  const {
    pipes: allPipes,
    center,
    extent,
  } = useMemo(() => {
    if (!data?.lines)
      return {
        pipes: [],
        center: [0, 0, 0],
        extent: { width: 100, height: 10, depth: 100 },
      };
    return transformPipes(data.lines, data.header);
  }, [data]);

  const allPointData = useMemo(() => {
    if (!data?.points)
      return { cylinders: [], spheres: [], loks: [] };
    // Pass lines data to enable sphere size scaling based on nearby pipes
    return transformPoints(
      data.points,
      data.header,
      center,
      data.lines
    );
  }, [data, center]);

  // Filter pipes based on active filter mode (Tema or Felt)
  const pipes = useMemo(() => {
    return allPipes.filter((pipe) => {
      if (feltFilterActive) {
        // Use Felt filter when active
        return !isHiddenByFeltFilter(pipe, 'lines');
      } else {
        // Use Tema/Type filter when Felt is not active
        if (hiddenCodes && hiddenCodes.includes(pipe.fcode))
          return false;
        if (isHiddenByType(pipe)) return false;
        return true;
      }
    });
  }, [allPipes, hiddenCodes, hiddenTypes, feltFilterActive, feltHiddenValues]);

  // Filter point data based on active filter mode (Tema or Felt)
  const pointData = useMemo(() => {
    const filterPoint = (p) => {
      if (feltFilterActive) {
        // Use Felt filter when active
        return !isHiddenByFeltFilter(p, 'points');
      } else {
        // Use Tema/Type filter when Felt is not active
        if (hiddenCodes && hiddenCodes.includes(p.fcode)) return false;
        if (isHiddenByType(p)) return false;
        return true;
      }
    };

    return {
      cylinders: allPointData.cylinders.filter(filterPoint),
      spheres: allPointData.spheres.filter(filterPoint),
      loks: allPointData.loks.filter(filterPoint),
    };
  }, [allPointData, hiddenCodes, hiddenTypes, feltFilterActive, feltHiddenValues]);

  // Combine all point types for click detection
  const allPoints = useMemo(() => {
    return [
      ...pointData.cylinders,
      ...pointData.spheres,
      ...pointData.loks,
    ];
  }, [pointData]);

  // Focus camera on selected object when it changes
  useEffect(() => {
    if (!selectedObject || !controlsRef.current) return;

    let targetPosition = null;

    if (selectedObject.type === 'point') {
      // Find the point in allPoints by pointIndex
      const point = allPoints.find(
        (p) => p.pointIndex === selectedObject.index
      );
      if (point) {
        targetPosition = point.position;
      }
    } else if (selectedObject.type === 'line') {
      // Find the first segment of the line
      const lineSegments = pipes.filter(
        (p) => p.lineIndex === selectedObject.index
      );
      if (lineSegments.length > 0) {
        targetPosition = lineSegments[0].start;
      }
    }

    if (targetPosition) {
      // Set camera to look at the target
      controlsRef.current.target.set(
        targetPosition[0],
        targetPosition[1],
        targetPosition[2]
      );

      // Position camera above and to the side of the target
      camera.position.set(
        targetPosition[0] + 30,
        targetPosition[1] + 40,
        targetPosition[2] + 30
      );

      controlsRef.current.update();
    }
  }, [selectedObject, allPoints, pipes, camera]);

  // Listen for control events from UI
  useEffect(() => {
    const handleResetCamera = () => {
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        camera.position.set(100, 100, 100);
        controlsRef.current.update();
      }
    };

    const handleToggleGrid = () => {
      setShowGrid((prev) => !prev);
    };

    window.addEventListener('reset3DCamera', handleResetCamera);
    window.addEventListener('toggle3DGrid', handleToggleGrid);

    return () => {
      window.removeEventListener('reset3DCamera', handleResetCamera);
      window.removeEventListener('toggle3DGrid', handleToggleGrid);
    };
  }, [camera]);

  // Raycaster for hover detection
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouseRef = useRef(new THREE.Vector2());

  // Track drag vs click so we don't open tooltips while rotating camera
  const pointerDownPosRef = useRef(null);
  const didDragRef = useRef(false);
  const DRAG_THRESHOLD_PX = 6;
  const CLICK_SUPPRESS_MS = 250;
  const lastPointerUpRef = useRef({ time: 0, wasDrag: false });

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

      // If this click was part of a drag-rotate/pan, ignore it
      const lastUp = lastPointerUpRef.current;
      if (
        lastUp?.wasDrag &&
        Date.now() - lastUp.time < CLICK_SUPPRESS_MS
      ) {
        lastPointerUpRef.current = { time: 0, wasDrag: false };
        didDragRef.current = false;
        return;
      }

      // Reset suppression state for next interaction
      lastPointerUpRef.current = { time: 0, wasDrag: false };

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
                  lineIndex: lineIndex, // Include lineIndex for profilanalyse integration
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
                    pointIndex: pointIndex,
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

    const onMouseDown = (e) => {
      // Only consider left button for drag-vs-click
      if (e.button !== 0) return;
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      didDragRef.current = false;
    };

    const onMouseMoveForDrag = (e) => {
      if (!pointerDownPosRef.current) return;
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
    };

    const onMouseUp = () => {
      lastPointerUpRef.current = {
        time: Date.now(),
        wasDrag: didDragRef.current,
      };
      pointerDownPosRef.current = null;
      // Note: keep didDragRef.current until click handler runs
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMoveForDrag);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: true });
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMoveForDrag);
      canvas.removeEventListener('mouseup', onMouseUp);
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
        maxDistance={Math.max(
          2000,
          Math.max(extent.width, extent.depth) * 2
        )}
        maxPolarAngle={Math.PI / 1.5}
        zoomSpeed={2}
        panSpeed={2}
        rotateSpeed={1}
      />

      {/* Grid - dynamically sized based on data extent */}
      {showGrid && (
        <Grid
          args={[
            Math.max(500, Math.ceil(extent.width / 100) * 100 + 200),
            Math.max(500, Math.ceil(extent.depth / 100) * 100 + 200),
          ]}
          cellSize={
            extent.width > 1000 || extent.depth > 1000 ? 20 : 10
          }
          cellThickness={0.5}
          cellColor="#6f6f6f"
          sectionSize={
            extent.width > 1000 || extent.depth > 1000 ? 100 : 50
          }
          sectionThickness={1}
          sectionColor="#9d4b4b"
          fadeDistance={Math.max(
            1000,
            Math.max(extent.width, extent.depth) * 0.8
          )}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      {/* Render Pipes */}
      {pipes.length > 0 && (
        <PipeNetwork pipes={pipes} wireframe={false} />
      )}

      {/* Render Point Cylinders (KUM, SLU, SLS, SAN) */}
      {pointData.cylinders.length > 0 && (
        <PointObjects
          points={pointData.cylinders}
          wireframe={false}
          geometryType="cylinder"
          arrayType="cylinder"
        />
      )}

      {/* Render Point Spheres (other punkter) */}
      {pointData.spheres.length > 0 && (
        <PointObjects
          points={pointData.spheres}
          wireframe={false}
          geometryType="sphere"
          arrayType="sphere"
        />
      )}

      {/* Render LOK (flat discs) */}
      {pointData.loks.length > 0 && (
        <PointObjects
          points={pointData.loks}
          wireframe={false}
          geometryType="lok"
          arrayType="lok"
        />
      )}
    </>
  );
}
