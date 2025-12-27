'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import DataDisplayModal from '@/components/DataDisplayModal';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import useStore from '@/lib/store';

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);
  const resetParsing = useStore((state) => state.resetParsing);
  const clearData = useStore((state) => state.clearData);
  const clearFile = useStore((state) => state.clearFile);
  const updateLastActive = useStore(
    (state) => state.updateLastActive
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(13);

  // Session heartbeat: update lastActive timestamp
  useEffect(() => {
    // Update immediately on mount
    updateLastActive();

    // Update every minute while active
    const interval = setInterval(updateLastActive, 60 * 1000);

    // Update on tab focus/visibility
    const handleActivity = () => {
      if (document.visibilityState === 'visible') {
        updateLastActive();
      }
    };

    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('focus', handleActivity);
    window.addEventListener('click', handleActivity); // Optional: track clicks too

    return () => {
      clearInterval(interval);
      document.removeEventListener(
        'visibilitychange',
        handleActivity
      );
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [updateLastActive]);

  const handleReset = () => {
    clearData();
    clearFile();
    resetParsing();
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gray-50">
      {/* Initial Upload Screen */}
      {parsingStatus !== 'done' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-xl w-full px-4">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">
                GMI Validering
              </h1>
              <p className="mt-2 text-gray-600">
                Last opp og valider GMI-filer
              </p>
            </div>
            <div className="bg-white shadow rounded-lg p-6">
              <FileUpload />
            </div>
          </div>
        </div>
      )}

      {/* Main App Layout (Sidebar + Map) */}
      {parsingStatus === 'done' && (
        <>
          {/* Sidebar */}
          <Sidebar onReset={handleReset} />

          {/* Map Area */}
          <div className="flex-1 relative h-full">
            <MapView onZoomChange={setZoomLevel} />

            {/* Floating Zoom Indicator */}
            <div className="absolute bottom-4 left-4 z-[1000]">
              <div className="bg-white/90 backdrop-blur px-3 py-2 rounded shadow border border-gray-200 text-sm font-mono">
                Zoom: {zoomLevel}
              </div>
            </div>

            {/* Floating Inspect Button */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
              <button
                onClick={() => setIsModalOpen(true)}
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
                🔍 Inspiser data
              </button>
            </div>

            {/* Data Inspector Modal */}
            <DataDisplayModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
