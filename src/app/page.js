'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import DataDisplayModal from '@/components/DataDisplayModal';
import InclineAnalysisModal from '@/components/InclineAnalysisModal';
import FieldValidationSidebar from '@/components/FieldValidationSidebar';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import DataTable from '@/components/DataTable';
import useStore from '@/lib/store';

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
  const fieldValidationOpen = useStore((state) => state.ui.fieldValidationOpen);
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
      {/* Always-visible FIXED Close Button (fallback) */}
      {parsingStatus === 'done' && dataTableOpen && (
        <button
          id="fixed-debug-close"
          onClick={() => {
            console.log('FIXED DEBUG CLOSE CLICKED');
            toggleDataTable();
          }}
          aria-label="Lukk tabell (debug large)"
          style={{
            position: 'fixed',
            top: '8px',
            left: '8px',
            width: '160px',
            height: '64px',
            borderRadius: '8px',
            background: 'lime',
            color: '#111',
            border: '4px solid #000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontSize: '18px',
            fontWeight: 700,
          }}
          title="DEBUG: Lukk tabell (fast)"
        >
          DEBUG CLOSE
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
          {!dataTableOpen && !analysisOpen && !fieldValidationOpen && (
            <Sidebar onReset={handleReset} />
          )}

          {/* Field Validation Sidebar - 50% width */}
          {fieldValidationOpen && (
            <div className="w-1/2 h-full flex-none">
              <FieldValidationSidebar />
            </div>
          )}

          {/* Map Area */}
          <div className={`relative flex flex-col h-full ${fieldValidationOpen ? 'w-1/2 flex-none' : 'flex-1'}`}>
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
              {!dataTableOpen && !analysisOpen && !fieldValidationOpen && (
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

              {/* Close Table Button - Show when table is open, positioned at bottom-right of map */}
              {dataTableOpen && (
                <div
                  className="absolute bottom-4 right-4"
                  style={{ zIndex: 1000 }}
                >
                  <button
                    onClick={toggleDataTable}
                    className="px-4 py-2 rounded-lg shadow-lg font-medium border-2 transition-all"
                    style={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      borderColor: '#dc2626',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        '#b91c1c';
                      e.currentTarget.style.borderColor = '#b91c1c';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        '#dc2626';
                      e.currentTarget.style.borderColor = '#dc2626';
                    }}
                    title="Lukk tabell (tilbake til sidebar)"
                  >
                    ✕ Lukk tabell
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
          </div>
        </>
      )}
    </div>
  );
}
