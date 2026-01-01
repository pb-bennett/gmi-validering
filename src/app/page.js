'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import FileUpload from '@/components/FileUpload';
import DataDisplayModal from '@/components/DataDisplayModal';
import InclineAnalysisModal from '@/components/InclineAnalysisModal';
import FieldValidationSidebar from '@/components/FieldValidationSidebar';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import DataTable from '@/components/DataTable';
import TabSwitcher from '@/components/TabSwitcher';
import useStore from '@/lib/store';

// Dynamic import for 3D viewer to prevent SSR issues with Three.js
const Viewer3D = dynamic(() => import('@/components/3D/Viewer3D'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-gray-500">Loading 3D...</div>
});

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);
  const dataTableOpen = useStore((state) => state.ui.dataTableOpen);
  const toggleDataTable = useStore((state) => state.toggleDataTable);
  const resetParsing = useStore((state) => state.resetParsing);
  const clearData = useStore((state) => state.clearData);
  const clearFile = useStore((state) => state.clearFile);
  const updateLastActive = useStore(
    (state) => state.updateLastActive
  );
  const analysisOpen = useStore((state) => state.analysis.isOpen);
  const fieldValidationOpen = useStore(
    (state) => state.ui.fieldValidationOpen
  );
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
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
      {/* Global Close DataTable Button - ALWAYS visible when table is open */}
      {parsingStatus === 'done' && dataTableOpen && (
        <button
          onClick={toggleDataTable}
          aria-label="Lukk tabell"
          style={{
            position: 'fixed',
            bottom: '36%',
            right: '16px',
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            zIndex: 10000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontSize: '14px',
            fontWeight: 600,
          }}
          title="Lukk tabell"
        >
          ✕ Lukk tabell
        </button>
      )}
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
          {/* Sidebar - Hidden when data table is open OR analysis is open OR field validation is open */}
          {!dataTableOpen &&
            !analysisOpen &&
            !fieldValidationOpen && <Sidebar onReset={handleReset} />}

          {/* Field Validation Sidebar - 50% width */}
          {fieldValidationOpen && (
            <div className="w-1/2 h-full flex-none">
              <FieldValidationSidebar />
            </div>
          )}

          {/* Map Area */}
          <div
            className={`relative flex flex-col h-full ${
              fieldValidationOpen ? 'w-1/2 flex-none' : 'flex-1'
            }`}
          >
            {/* Show Map view when activeViewTab is 'map' or 3D viewer is not open */}
            {(!viewer3DOpen || activeViewTab === 'map') && (
              <>
                {/* Map - Full height or 67% when table open, or 55% when analysis open */}
                <div
                  className="relative"
                  style={{
                    height: dataTableOpen
                      ? '67%'
                      : analysisOpen
                      ? '55%'
                      : '100%',
                    transition: 'height 0.2s ease',
                  }}
                >
                  <MapView onZoomChange={setZoomLevel} />

                  {/* Floating Zoom Indicator */}
                  <div
                    className="absolute bottom-4 left-4"
                    style={{ zIndex: 1000 }}
                  >
                    <div className="bg-white/90 backdrop-blur px-3 py-2 rounded shadow border border-gray-200 text-sm font-mono">
                      Zoom: {zoomLevel}
                    </div>
                  </div>

                  {/* Floating Inspect Button - Only show when table is closed AND analysis is closed AND field validation is closed */}
                  {!dataTableOpen &&
                    !analysisOpen &&
                    !fieldValidationOpen && (
                      <div
                        className="absolute bottom-4 left-1/2 -translate-x-1/2"
                        style={{ zIndex: 1000 }}
                      >
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
                    )}
                </div>

                {/* Data Table - Fixed 33% height */}
                {dataTableOpen && (
                  <div
                    style={{
                      height: '33%',
                      transition: 'height 0.2s ease',
                    }}
                  >
                    <DataTable />
                  </div>
                )}

                {/* Data Inspector Modal */}
                <DataDisplayModal
                  isOpen={isModalOpen}
                  onClose={() => setIsModalOpen(false)}
                />
                <InclineAnalysisModal />
              </>
            )}

            {/* Show 3D view when viewer is open and activeViewTab is '3d' */}
            {viewer3DOpen && activeViewTab === '3d' && <Viewer3D />}
          </div>
        </>
      )}

      {/* Tab Switcher - Shows when 3D viewer is open */}
      <TabSwitcher />
    </div>
  );
}
