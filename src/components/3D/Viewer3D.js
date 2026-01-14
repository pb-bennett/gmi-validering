'use client';

import { Canvas } from '@react-three/fiber';
import { useState, useEffect } from 'react';
import useStore from '@/lib/store';
import Scene3D from './Scene3D';
import Controls3D from './Controls3D';
import Tooltip3D from './Tooltip3D';
import Legend3D from './Legend3D';

export default function Viewer3D() {
  const data = useStore((state) => state.data);
  const hiddenCodes = useStore(
    (state) => state.ui?.hiddenCodes || []
  );
  const hiddenTypes = useStore(
    (state) => state.ui?.hiddenTypes || []
  );
  const selectedObject3D = useStore(
    (state) => state.ui?.selectedObject3D
  );
  const setSelected3DObject = useStore(
    (state) => state.setSelected3DObject
  );
  const analysisIsOpen = useStore((state) => state.analysis?.isOpen);
  const selectAnalysisPipe = useStore(
    (state) => state.selectAnalysisPipe
  );
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    x: 0,
    y: 0,
  });

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

  if (!data) return null;

  const handleObjectClick = (objectData, event) => {
    // When Profilanalyse is open and clicking a pipe, switch to that profile
    if (
      analysisIsOpen &&
      objectData.type === 'pipe' &&
      objectData.lineIndex !== undefined
    ) {
      selectAnalysisPipe(objectData.lineIndex);
      // Don't show tooltip when in Profilanalyse mode
      return;
    }

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
          data={data}
          hiddenCodes={hiddenCodes}
          hiddenTypes={hiddenTypes}
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
    </div>
  );
}
