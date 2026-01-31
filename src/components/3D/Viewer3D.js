'use client';

import { Canvas } from '@react-three/fiber';
import { useState, useEffect, useMemo } from 'react';
import useStore from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import Scene3D from './Scene3D';
import Controls3D from './Controls3D';
import Tooltip3D from './Tooltip3D';
import Legend3D from './Legend3D';

export default function Viewer3D() {
  const data = useStore((state) => state.data);
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore(
    useShallow((state) => state.layerOrder),
  );
  const isMultiLayerMode = layerOrder && layerOrder.length > 0;

  const hiddenCodes = useStore(
    (state) => state.ui?.hiddenCodes || [],
  );
  const hiddenTypes = useStore(
    (state) => state.ui?.hiddenTypes || [],
  );
  // Felt filter state for 3D
  const feltFilterActive = useStore(
    (state) => state.ui?.feltFilterActive || false,
  );
  const feltHiddenValues = useStore(
    (state) => state.ui?.feltHiddenValues || [],
  );
  // Felt highlighting on hover
  const highlightedFeltField = useStore(
    (state) => state.ui?.highlightedFeltField,
  );
  const highlightedFeltValue = useStore(
    (state) => state.ui?.highlightedFeltValue,
  );
  const highlightedFeltObjectType = useStore(
    (state) => state.ui?.highlightedFeltObjectType,
  );
  const selectedObject3D = useStore(
    (state) => state.ui?.selectedObject3D,
  );
  const dataTableOpen = useStore((state) => state.ui.dataTableOpen);
  const analysisOpen = useStore((state) => state.analysis.isOpen);
  const fieldValidationOpen = useStore(
    (state) => state.ui.fieldValidationOpen,
  );
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const setSelected3DObject = useStore(
    (state) => state.setSelected3DObject,
  );
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    x: 0,
    y: 0,
  });

  // Combine data from all visible layers for 3D rendering
  const combinedData = useMemo(() => {
    if (!isMultiLayerMode) {
      return data;
    }

    // Combine all visible layer data
    const combined = {
      header: null,
      points: [],
      lines: [],
    };

    for (const layerId of layerOrder) {
      const layer = layers[layerId];
      if (!layer || !layer.visible || !layer.data) continue;

      // Use header from first layer with data
      if (!combined.header && layer.data.header) {
        combined.header = layer.data.header;
      }

      // Collect points with layer metadata
      if (layer.data.points) {
        layer.data.points.forEach((point, idx) => {
          combined.points.push({
            ...point,
            _layerId: layerId,
            _layerHiddenCodes: layer.hiddenCodes || [],
            _layerHiddenTypes: layer.hiddenTypes || [],
            _originalIndex: idx,
          });
        });
      }

      // Collect lines with layer metadata
      if (layer.data.lines) {
        layer.data.lines.forEach((line, idx) => {
          combined.lines.push({
            ...line,
            _layerId: layerId,
            _layerHiddenCodes: layer.hiddenCodes || [],
            _layerHiddenTypes: layer.hiddenTypes || [],
            _originalIndex: idx,
          });
        });
      }
    }

    return combined.points.length > 0 || combined.lines.length > 0
      ? combined
      : null;
  }, [isMultiLayerMode, data, layers, layerOrder]);

  // Clear selected object when it's been processed
  useEffect(() => {
    if (selectedObject3D) {
      // Clear the selection after a short delay to allow camera to focus
      const timer = setTimeout(() => {
        setSelected3DObject(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedObject3D, setSelected3DObject]);

  if (!combinedData) return null;

  const handleObjectClick = (objectData, event) => {
    setTooltipData(objectData);
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const handleCloseTooltip = () => {
    setTooltipData(null);
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-gray-100 to-gray-200">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [100, 100, 100], fov: 60 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene3D
          data={combinedData}
          hiddenCodes={hiddenCodes}
          hiddenTypes={hiddenTypes}
          feltFilterActive={feltFilterActive}
          feltHiddenValues={feltHiddenValues}
          highlightedFeltField={highlightedFeltField}
          highlightedFeltValue={highlightedFeltValue}
          highlightedFeltObjectType={highlightedFeltObjectType}
          selectedObject={selectedObject3D}
          onObjectClick={handleObjectClick}
        />
      </Canvas>

      {/* Floating controls */}
      <Controls3D />

      {/* Legend */}
      <Legend3D />

      {/* Tooltip */}
      {tooltipData && (
        <Tooltip3D
          object={tooltipData}
          position={tooltipPosition}
          onClose={handleCloseTooltip}
        />
      )}

      {/* Floating Inspect Button (3D) */}
      {!dataTableOpen && !analysisOpen && !fieldValidationOpen && (
        <div
          className="absolute bottom-4 -translate-x-1/2"
          style={{ zIndex: 1000, left: 'calc(50% - 320px)' }}
        >
          <button
            onClick={() => openDataInspector(null)}
            className="px-4 py-2 rounded shadow font-medium border transition-colors"
            style={{
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                'var(--color-page-bg)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor =
                'var(--color-card)')
            }
          >
            Inspiser data
          </button>
        </div>
      )}
    </div>
  );
}
