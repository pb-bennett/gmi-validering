'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import FileUpload from '@/components/FileUpload';
import DataDisplayModal from '@/components/DataDisplayModal';
import ZValidationModal from '@/components/ZValidationModal';
import InclineAnalysisModal from '@/components/InclineAnalysisModal';
import FieldValidationSidebar from '@/components/FieldValidationSidebar';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import DataTable from '@/components/DataTable';
import TabSwitcher from '@/components/TabSwitcher';
import TerrainFetcher from '@/components/TerrainFetcher';
import DevDiagnosticsPanel from '@/components/DevDiagnosticsPanel';
import WmsLayerModal from '@/components/WmsLayerModal';
import useStore from '@/lib/store';

// Dynamic import for 3D viewer to prevent SSR issues with Three.js
const Viewer3D = dynamic(() => import('@/components/3D/Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500">
      Loading 3D...
    </div>
  ),
});

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);
  const parsingError = useStore((state) => state.parsing.error);
  const dataTableOpen = useStore((state) => state.ui.dataTableOpen);
  const toggleDataTable = useStore((state) => state.toggleDataTable);
  const resetAll = useStore((state) => state.resetAll);
  const updateLastActive = useStore(
    (state) => state.updateLastActive,
  );
  const analysisOpen = useStore((state) => state.analysis.isOpen);
  const fieldValidationOpen = useStore(
    (state) => state.ui.fieldValidationOpen,
  );
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const closeDataInspector = useStore(
    (state) => state.closeDataInspector,
  );
  const [zoomLevel, setZoomLevel] = useState(13);
  
  // State for "Add Layer" modal
  const [showAddLayerModal, setShowAddLayerModal] = useState(false);
  
  // State for WMS layer modal
  const [showWmsModal, setShowWmsModal] = useState(false);
  const customWmsConfig = useStore((state) => state.customWmsConfig);

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
        handleActivity,
      );
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [updateLastActive]);

  const handleReset = () => {
    closeDataInspector();
    resetAll();
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gray-50">
      {/* Floating Reset Button - Always visible when data is loaded */}
      {parsingStatus === 'done' && (
        <button
          onClick={handleReset}
          aria-label="Last inn ny fil"
          title="Nullstill appen og last inn en ny GMI-fil"
          style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            padding: '8px 12px',
            width: '220px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            color: '#2563eb',
            border: '1px solid #2563eb',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: '8px',
            zIndex: 10002,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            fontSize: '13px',
            lineHeight: 1.2,
            fontWeight: 500,
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
            e.currentTarget.style.borderColor = '#1d4ed8';
            e.currentTarget.style.color = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              'rgba(255, 255, 255, 0.95)';
            e.currentTarget.style.borderColor = '#2563eb';
            e.currentTarget.style.color = '#2563eb';
          }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Nullstill og last opp ny</span>
        </button>
      )}
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

            {/* Error Display */}
            {parsingStatus === 'error' && parsingError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-red-800">
                      Feil ved lasting av fil
                    </h3>
                    <p className="mt-1 text-sm text-red-700">
                      {parsingError}
                    </p>
                    <button
                      onClick={handleReset}
                      className="mt-3 text-sm font-medium text-red-600 hover:text-red-800 underline"
                    >
                      Prøv igjen med en annen fil
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white shadow rounded-lg p-6">
              <FileUpload />
            </div>
          </div>
        </div>
      )}

      {/* Main App Layout (Sidebar + Map) */}
      {parsingStatus === 'done' && (
        <>
          {/* Background terrain fetcher - runs in background */}
          <TerrainFetcher />

          {/* Dev diagnostics panel - bottom right corner */}
          <DevDiagnosticsPanel />

          {/* Sidebar - Hidden when data table is open OR field validation is open */}
          {!dataTableOpen && !fieldValidationOpen && (
            <Sidebar 
              onReset={handleReset} 
              onAddFile={() => setShowAddLayerModal(true)}
            />
          )}

          {/* Field Validation Sidebar - 33% width */}
          {fieldValidationOpen && (
            <div className="w-1/3 h-full flex-none">
              <FieldValidationSidebar />
            </div>
          )}

          {/* Map Area */}
          <div
            className={`relative flex flex-col h-full ${
              fieldValidationOpen ? 'w-2/3 flex-none' : 'flex-1'
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

                  {/* WMS Layer Control - Small button near bottom left */}
                  <div
                    className="absolute bottom-4 left-28"
                    style={{ zIndex: 1000 }}
                  >
                    <div className="flex items-center gap-1">
                      {/* WMS Settings Button */}
                      <button
                        onClick={() => setShowWmsModal(true)}
                        className="px-2 py-1.5 rounded shadow text-xs font-medium border transition-colors bg-white/90 text-gray-600 border-gray-200 hover:bg-gray-100 backdrop-blur flex items-center gap-1"
                        title={customWmsConfig ? 'Endre WMS-innstillinger' : 'Legg til Gemini WMS'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {customWmsConfig ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                          ) : (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          )}
                          {customWmsConfig && (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          )}
                        </svg>
                        {customWmsConfig ? '' : 'WMS'}
                      </button>
                    </div>
                  </div>

                  {/* Floating Inspect Button - Only show when table is closed AND analysis is closed AND field validation is closed */}
                  {!dataTableOpen &&
                    !analysisOpen &&
                    !fieldValidationOpen && (
                      <div
                        className="absolute bottom-4 -translate-x-1/2"
                        style={{
                          zIndex: 1000,
                          left: 'calc(50% - 320px)',
                        }}
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
              </>
            )}

            {/* Show 3D view when viewer is open and activeViewTab is '3d' */}
            {viewer3DOpen && activeViewTab === '3d' && <Viewer3D />}

            {/* Profile analysis modal - overlays both 2D and 3D views */}
            <InclineAnalysisModal />
          </div>
        </>
      )}

      {/* Data Inspector Modal */}
      <DataDisplayModal />
      <ZValidationModal />

      {/* Tab Switcher - Shows when 3D viewer is open */}
      <TabSwitcher />
      
      {/* Add Layer Modal */}
      {showAddLayerModal && (
        <div 
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50"
          onClick={() => setShowAddLayerModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Legg til nytt lag</h2>
              <button
                onClick={() => setShowAddLayerModal(false)}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FileUpload 
              isAddingLayer={true}
              onComplete={() => setShowAddLayerModal(false)}
            />
          </div>
        </div>
      )}

      {/* WMS Layer Modal */}
      <WmsLayerModal 
        isOpen={showWmsModal} 
        onClose={() => setShowWmsModal(false)} 
      />
    </div>
  );
}
