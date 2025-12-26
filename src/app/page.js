'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import DataDisplayModal from '@/components/DataDisplayModal';
import MapView from '@/components/MapView';
import useStore from '@/lib/store';

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);
  const resetParsing = useStore((state) => state.resetParsing);
  const clearData = useStore((state) => state.clearData);
  const clearFile = useStore((state) => state.clearFile);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(13);

  const handleReset = () => {
    clearData();
    clearFile();
    resetParsing();
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Initial Upload Screen */}
      {parsingStatus !== 'done' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="max-w-xl w-full px-4">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">GMI Validering</h1>
              <p className="mt-2 text-gray-600">Last opp og valider GMI-filer</p>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <FileUpload />
            </div>
          </div>
        </div>
      )}

      {/* Main Map View */}
      {parsingStatus === 'done' && (
        <>
          <div className="absolute inset-0 z-0">
            <MapView onZoomChange={setZoomLevel} />
          </div>

          {/* Floating Controls */}
          <div className="absolute bottom-4 left-4 z-[1000] flex gap-2 items-center">
            <div className="bg-white/90 backdrop-blur px-3 py-2 rounded shadow border border-gray-200 text-sm font-mono">
              Zoom: {zoomLevel}
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-gray-800 px-4 py-2 rounded shadow hover:bg-gray-50 font-medium border border-gray-200"
            >
              🔍 Inspect Data
            </button>
            <button
              onClick={handleReset}
              className="bg-white text-red-600 px-4 py-2 rounded shadow hover:bg-red-50 font-medium border border-gray-200"
            >
              Reset
            </button>
          </div>

          {/* Data Inspector Modal */}
          <DataDisplayModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
          />
        </>
      )}
    </div>
  );
}

