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
import useStore from '@/lib/store';

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
  const { camera, gl, scene, size } = useThree();
  const hoveredTerrainPoint = useStore(
    (state) => state.analysis.hoveredTerrainPoint,
  );
  const selectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore((state) => state.analysis.layerId);
  const layers = useStore((state) => state.layers);

  // Helper function to check if an item is hidden by type filter (global or per-layer)
  const isHiddenByType = (item) => {
    const typeVal =
      item.type || item.attributes?.Type || '(Mangler Type)';
    const fcode = item.fcode;

    // Check global hidden types
    const globalHidden =
      hiddenTypes &&
      hiddenTypes.length > 0 &&
      hiddenTypes.some(
        (ht) =>
          ht.type === typeVal &&
          (ht.code === null || ht.code === fcode),
      );

    // Check per-layer hidden types
    const layerHiddenTypes = item._layerHiddenTypes || [];
    const layerHidden =
      layerHiddenTypes.length > 0 &&
      layerHiddenTypes.some(
        (ht) =>
          ht.type === typeVal &&
          (ht.code === null || ht.code === fcode),
      );

    return globalHidden || layerHidden;
  };

  // Helper function to check if an item is hidden by code filter (global or per-layer)
  const isHiddenByCode = (item) => {
    const fcode = item.fcode;

    // Check global hidden codes
    const globalHidden = hiddenCodes && hiddenCodes.includes(fcode);

    // Check per-layer hidden codes
    const layerHiddenCodes = item._layerHiddenCodes || [];
    const layerHidden = layerHiddenCodes.includes(fcode);

    return globalHidden || layerHidden;
  };

  // Helper function to check if an item is hidden by Felt filter
  const isHiddenByFeltFilter = (item, objectType) => {
    const attrs = item.attributes || {};
    const layerFeltHidden = item._layerFeltHiddenValues || [];
    if (
      Array.isArray(layerFeltHidden) &&
      layerFeltHidden.length > 0
    ) {
      const match = layerFeltHidden.some((hidden) => {
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
      if (match) return true;
    }

    if (
      !feltFilterActive ||
      !feltHiddenValues ||
      feltHiddenValues.length === 0
    )
      return false;

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
      data.lines,
    );
  }, [data, center]);

  // Filter pipes based on active filter mode (Tema or Felt)
  const pipes = useMemo(() => {
    return allPipes.filter((pipe) => {
      if (feltFilterActive) {
        // Use Felt filter when active
        return !isHiddenByFeltFilter(pipe, 'lines');
      } else {
        // Use Tema/Type filter when Felt is not active (global + per-layer)
        if (isHiddenByCode(pipe)) return false;
        if (isHiddenByType(pipe)) return false;
        return true;
      }
    });
  }, [
    allPipes,
    hiddenCodes,
    hiddenTypes,
    feltFilterActive,
    feltHiddenValues,
  ]);

  // Filter point data based on active filter mode (Tema or Felt)
  const pointData = useMemo(() => {
    const filterPoint = (p) => {
      if (feltFilterActive) {
        // Use Felt filter when active
        return !isHiddenByFeltFilter(p, 'points');
      } else {
        // Use Tema/Type filter when Felt is not active (global + per-layer)
        if (isHiddenByCode(p)) return false;
        if (isHiddenByType(p)) return false;
        return true;
      }
    };

    return {
      cylinders: allPointData.cylinders.filter(filterPoint),
      spheres: allPointData.spheres.filter(filterPoint),
      loks: allPointData.loks.filter(filterPoint),
    };
  }, [
    allPointData,
    hiddenCodes,
    hiddenTypes,
    feltFilterActive,
    feltHiddenValues,
  ]);

  // Combine all point types for click detection
  const allPoints = useMemo(() => {
    return [
      ...pointData.cylinders,
      ...pointData.spheres,
      ...pointData.loks,
    ];
  }, [pointData]);

  // Compute 3D marker position when hovering profile plot
  const hoveredProfileMarker = useMemo(() => {
    if (!hoveredTerrainPoint || selectedPipeIndex === null)
      return null;
    const activeData = analysisLayerId
      ? layers[analysisLayerId]?.data
      : data;
    const line = activeData?.lines?.[selectedPipeIndex];
    const coords = line?.coordinates;
    if (!coords || coords.length < 2) return null;

    const targetDist =
      hoveredTerrainPoint.lineDist !== undefined
        ? hoveredTerrainPoint.lineDist
        : hoveredTerrainPoint.dist;

    let distSoFar = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen < 0.0001) continue;

      if (targetDist <= distSoFar + segLen) {
        const t = (targetDist - distSoFar) / segLen;
        const x = p1.x + dx * t;
        const y = p1.y + dy * t;

        const z1 = p1.z ?? 0;
        const z2 = p2.z ?? 0;
        const baseZ = Number.isFinite(hoveredTerrainPoint.pipeZ)
          ? hoveredTerrainPoint.pipeZ
          : z1 + (z2 - z1) * t;

        // Match pipe centerline offset logic (same as transformPipes)
        const dimensjon = line?.attributes?.Dimensjon || 200;
        const radius = dimensjon / 2000; // mm -> m radius
        const hoyderef = line?.attributes?.Høydereferanse || 'UKJENT';
        let zOffset = 0;
        switch (hoyderef) {
          case 'BUNN_INNVENDIG':
          case 'UNDERKANT_UTVENDIG':
            zOffset = radius;
            break;
          case 'TOPP_UTVENDIG':
          case 'TOPP_INNVENDIG':
            zOffset = -radius;
            break;
          case 'PÅ_BAKKEN':
            zOffset = -radius;
            break;
          case 'SENTER':
          default:
            zOffset = 0;
        }

        const z = baseZ + zOffset;

        return [
          x - center[0],
          (z || 0) - center[2],
          -(y - center[1]),
        ];
      }

      distSoFar += segLen;
    }

    return null;
  }, [
    hoveredTerrainPoint,
    selectedPipeIndex,
    analysisLayerId,
    data,
    layers,
    center,
  ]);

  // Focus camera on selected object when it changes
  useEffect(() => {
    if (!selectedObject || !controlsRef.current) return;

    let targetPosition = null;

    if (selectedObject.type === 'point') {
      // Find the point in allPoints by pointIndex
      const point = allPoints.find((p) => {
        if (selectedObject.layerId) {
          return (
            p.layerId === selectedObject.layerId &&
            p.originalIndex === selectedObject.index
          );
        }
        return (
          p.pointIndex === selectedObject.index ||
          p.originalIndex === selectedObject.index
        );
      });
      if (point) {
        targetPosition = point.position;
      }
    } else if (selectedObject.type === 'line') {
      // Focus on the full extent of the line and align view with its direction
      const lineSegments = pipes.filter((p) => {
        if (selectedObject.layerId) {
          return (
            p.layerId === selectedObject.layerId &&
            p.originalIndex === selectedObject.index
          );
        }
        return (
          p.lineIndex === selectedObject.index ||
          p.originalIndex === selectedObject.index
        );
      });
      if (lineSegments.length > 0) {
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(
          -Infinity,
          -Infinity,
          -Infinity,
        );

        lineSegments.forEach((seg) => {
          const s = new THREE.Vector3(
            seg.start[0],
            seg.start[1],
            seg.start[2],
          );
          const e = new THREE.Vector3(
            seg.end[0],
            seg.end[1],
            seg.end[2],
          );
          min.min(s);
          min.min(e);
          max.max(s);
          max.max(e);
        });

        const center = new THREE.Vector3()
          .addVectors(min, max)
          .multiplyScalar(0.5);
        targetPosition = [center.x, center.y, center.z];

        // Estimate direction from first to last segment (projected to XZ plane)
        const first = lineSegments[0];
        const last = lineSegments[lineSegments.length - 1];
        const dir = new THREE.Vector3(
          last.end[0] - first.start[0],
          0,
          last.end[2] - first.start[2],
        );
        if (dir.lengthSq() < 1e-6) {
          dir.set(1, 0, 0);
        }
        dir.normalize();

        // Perpendicular direction (for side-on view)
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

        const extentVec = new THREE.Vector3().subVectors(max, min);
        const extentXZ = Math.sqrt(
          extentVec.x * extentVec.x + extentVec.z * extentVec.z,
        );
        const extentY = Math.max(1, extentVec.y);

        const aspect = size.width / Math.max(1, size.height);
        const vFov = THREE.MathUtils.degToRad(camera.fov || 60);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

        const distX = extentXZ / 2 / Math.tan(hFov / 2);
        const distY = extentY / 2 / Math.tan(vFov / 2);
        const distance = Math.max(30, distX, distY) * 1.2;
        const height = Math.max(20, extentY * 0.6, distance * 0.35);

        // Position camera to show the full line length, aligned to its direction
        camera.position.set(
          center.x + perp.x * distance,
          center.y + height,
          center.z + perp.z * distance,
        );
      }
    }

    if (targetPosition) {
      // Set camera to look at the target
      controlsRef.current.target.set(
        targetPosition[0],
        targetPosition[1],
        targetPosition[2],
      );

      controlsRef.current.update();
    }
  }, [selectedObject, allPoints, pipes, camera, size]);

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
        true,
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
    [gl, camera, raycaster, scene],
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
        true,
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
              const layerId = line._layerId || null;
              const originalIndex =
                line._originalIndex !== undefined
                  ? line._originalIndex
                  : lineIndex;
              const coordinates = line.coordinates?.[0]
                ? [line.coordinates[0].y, line.coordinates[0].x] // [lat, lng]
                : null;

              onObjectClick(
                {
                  type: 'pipe',
                  fcode: line.attributes?.S_FCODE || 'UNKNOWN',
                  attributes: line.attributes || {},
                  coordinates: coordinates,
                  featureId: layerId
                    ? `ledninger-${layerId}-${originalIndex}`
                    : `ledninger-${lineIndex}`,
                  lineIndex: originalIndex,
                  layerId: layerId,
                },
                event,
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
                const layerId = pointObj._layerId || null;
                const originalIndex =
                  pointObj._originalIndex !== undefined
                    ? pointObj._originalIndex
                    : pointIndex;
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
                    featureId: layerId
                      ? `punkter-${layerId}-${originalIndex}`
                      : `punkter-${pointIndex}`,
                    pointIndex: originalIndex,
                    layerId: layerId,
                  },
                  event,
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
    ],
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
          Math.max(extent.width, extent.depth) * 2,
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
            Math.max(extent.width, extent.depth) * 0.8,
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

      {hoveredProfileMarker && (
        <mesh position={hoveredProfileMarker}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshStandardMaterial color="#ffd700" emissive="#ffcc00" />
        </mesh>
      )}
    </>
  );
}
