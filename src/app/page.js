'use client';

import { startTransition, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { EnvelopeSimpleIcon, InfoIcon, GearSixIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import FileUpload from '@/components/FileUpload';
import GlobalFileDrop from '@/components/GlobalFileDrop';
import DataDisplayModal from '@/components/DataDisplayModal';
import ZValidationModal from '@/components/ZValidationModal';
import InclineAnalysisModal from '@/components/InclineAnalysisModal';
import FieldValidationSidebar from '@/components/FieldValidationSidebar';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import LayerDataTable from '@/components/LayerDataTable';
import MapPaneToolbar from '@/components/MapPaneToolbar';
import { MapPanePresentationProvider } from '@/components/MapPanePresentationProvider';
import TerrainFetcher from '@/components/TerrainFetcher';
import WmsLayerModal from '@/components/WmsLayerModal';
import ShareQrModal from '@/components/ShareQrModal';
import StatsModal from '@/components/StatsModal';
import AppInfoModal from '@/components/AppInfoModal';
import { TestModeActivation } from '@/components/TestModeControl';
import { CURRENT_APP_VERSION, LATEST_ANNOUNCED_RELEASE } from '@/data/appReleases.mjs';
import { decideAutomaticAppInfo } from '@/lib/appInfoState.mjs';
import WorkspaceShell from '@/components/WorkspaceShell';
import BrandWordmark from '@/components/BrandWordmark';
import { VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM } from '@/components/validation-v2/fieldDetailLayout';
import { getTerrainStats } from '@/lib/analysis/terrain';
import { claimStatisticsCue } from '@/lib/statisticsCue.mjs';
import TestModeControl from '@/components/TestModeControl';
import useStore from '@/lib/store';

const DEV_RUNTIME_SNAPSHOTS_KEY = 'gmi:dev:runtime:snapshots';
const DEV_RUNTIME_EVENTS_KEY = 'gmi:dev:runtime:events';
const DEV_RUNTIME_MAX_ITEMS = 120;
const PUBLIC_REPO_URL =
  'https://github.com/pb-bennett/gmi-validering';

function appendDevRuntimeItem(key, item) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list)
      ? [...list.slice(-(DEV_RUNTIME_MAX_ITEMS - 1)), item]
      : [item];
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage failures in diagnostics path
  }
}

// Dynamic import for 3D viewer to prevent SSR issues with Three.js
const Viewer3D = dynamic(() => import('@/components/3D/Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gmi-text-subtle">
      Loading 3D...
    </div>
  ),
});

export default function Home() {
  const parsingStatus = useStore((state) => state.parsing.status);
  const parsingError = useStore((state) => state.parsing.error);
  const resetAll = useStore((state) => state.resetAll);
  const updateLastActive = useStore(
    (state) => state.updateLastActive,
  );
  const analysisOpen = useStore((state) => state.analysis.isOpen);
  const layerDataTableOpen = useStore(
    (state) => state.ui.layerDataTable?.isOpen,
  );
  const fieldValidationOpen = useStore(
    (state) => state.ui.fieldValidationOpen,
  );
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [dockedInspectorOpen, setDockedInspectorOpen] = useState(false);
  const openDataInspector = useStore(
    (state) => state.openDataInspector,
  );
  const closeDataInspector = useStore(
    (state) => state.closeDataInspector,
  );
  const [zoomLevel, setZoomLevel] = useState(13);
  const primaryViewHeight = analysisOpen ? '55%' : '100%';
  const inspectorWidthPx = VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM * 16;
  const canDockInspector =
    viewportWidth - sidebarWidth >= 480 + inspectorWidthPx;

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  // State for "Add Layer" modal
  const [showAddLayerModal, setShowAddLayerModal] = useState(false);

  // State for WMS layer modal
  const [showWmsModal, setShowWmsModal] = useState(false);
  const customWmsConfig = useStore((state) => state.customWmsConfig);

  // State for stats modal
  const [showStats, setShowStats] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [statisticsCueActive, setStatisticsCueActive] = useState(false);
  const [showAppInfo, setShowAppInfo] = useState(false);
  const [appInfoInitialTab, setAppInfoInitialTab] = useState('about');
  const appInfoTriggerRef = useRef(null);
  const appInfoAutoCheckedRef = useRef(false);

  // Decide and claim the first info popup before the heartbeat can create the legacy key.
  useEffect(() => {
    if (appInfoAutoCheckedRef.current) return;
    appInfoAutoCheckedRef.current = true;

    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // The info modal remains usable when browser storage is unavailable.
    }

    const decision = decideAutomaticAppInfo({
      storage,
      latestAnnouncedRelease: LATEST_ANNOUNCED_RELEASE,
    });
    if (!decision.open) return;

    startTransition(() => {
      setAppInfoInitialTab(decision.tab);
      setShowAppInfo(true);
    });
  }, []);

  useEffect(() => {
    let sessionStorage;
    try {
      sessionStorage = window.sessionStorage;
    } catch {
      return;
    }

    const shouldCue = claimStatisticsCue(sessionStorage);
    if (!shouldCue) return;

    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
    } catch {
      // If motion preference detection fails, keep the cue harmlessly enabled.
    }

    if (!reducedMotion) setStatisticsCueActive(true);
  }, []);

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

  // Dev-only persistent breadcrumbs for crashes/OOM (survive renderer restarts)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const captureSnapshot = (reason = 'interval') => {
      const state = useStore.getState();
      const terrainStats = getTerrainStats();
      const heap =
        typeof performance !== 'undefined' && performance.memory
          ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit,
            }
          : null;

      const layerIds = state.layerOrder || [];
      let layerQueueTotal = 0;
      for (const layerId of layerIds) {
        layerQueueTotal +=
          state.layers[layerId]?.terrain?.fetchQueue?.length || 0;
      }

      appendDevRuntimeItem(DEV_RUNTIME_SNAPSHOTS_KEY, {
        ts: new Date().toISOString(),
        reason,
        parsingStatus: state.parsing?.status,
        activeViewTab: state.ui?.activeViewTab,
        analysisOpen: !!state.analysis?.isOpen,
        layerCount: layerIds.length,
        baseQueue: state.terrain?.fetchQueue?.length || 0,
        layerQueueTotal,
        terrainCacheSize: terrainStats.cacheSize,
        terrainCacheLimit: terrainStats.cacheLimit,
        terrainCacheEvictions: terrainStats.cacheEvictions,
        terrainApiQueue: terrainStats.requestQueueLength,
        terrainApiQueueMax: terrainStats.maxRequestQueueLength,
        heap,
      });
    };

    const onError = (event) => {
      appendDevRuntimeItem(DEV_RUNTIME_EVENTS_KEY, {
        ts: new Date().toISOString(),
        type: 'error',
        message: event?.message || 'Unknown error',
        source: event?.filename || null,
        line: event?.lineno || null,
        column: event?.colno || null,
      });
      captureSnapshot('window-error');
    };

    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      appendDevRuntimeItem(DEV_RUNTIME_EVENTS_KEY, {
        ts: new Date().toISOString(),
        type: 'unhandledrejection',
        message:
          reason?.message ||
          (typeof reason === 'string'
            ? reason
            : 'Unhandled rejection'),
      });
      captureSnapshot('unhandled-rejection');
    };

    captureSnapshot('mount');
    const interval = setInterval(
      () => captureSnapshot('interval'),
      5000,
    );

    window.addEventListener('error', onError);
    window.addEventListener(
      'unhandledrejection',
      onUnhandledRejection,
    );

    return () => {
      clearInterval(interval);
      window.removeEventListener('error', onError);
      window.removeEventListener(
        'unhandledrejection',
        onUnhandledRejection,
      );
      captureSnapshot('unmount');
    };
  }, []);

  const handleReset = () => {
    closeDataInspector();
    resetAll();
  };

  const openAppInfo = (tab = 'about', opener = null) => {
    if (opener) {
      appInfoTriggerRef.current = opener;
      opener.focus();
    }
    setAppInfoInitialTab(tab);
    setShowAppInfo(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-gmi-surface-soft">
      <GlobalFileDrop enabled={parsingStatus !== 'parsing'} />
      <TestModeActivation />
      {/* Floating Stats Button */}
      {!(layerDataTableOpen || dockedInspectorOpen || analysisOpen) && (
      <button
        className={
          statisticsCueActive
            ? 'statistics-button statistics-button--cue'
            : 'statistics-button'
        }
        onClick={() => setShowStats(true)}
        aria-label="Vis bruksstatistikk"
        title="Vis bruksstatistikk"
        onAnimationEnd={(event) => {
          if (event.animationName === 'statistics-button-entrance') {
            setStatisticsCueActive(false);
          }
        }}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 10002,
          padding: '10px 16px',
          borderRadius: '12px',
          backgroundColor: '#007595',
          color: '#ffffff',
          border: '1px solid #007595',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 6px 18px rgba(0,117,149,0.28)',
          fontSize: '13px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#0F172B';
          e.currentTarget.style.borderColor = '#0F172B';
          e.currentTarget.style.boxShadow =
            '0 6px 20px rgba(0,117,149,0.38)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            '#007595';
          e.currentTarget.style.borderColor = '#007595';
          e.currentTarget.style.boxShadow =
            '0 6px 18px rgba(0,117,149,0.28)';
        }}
      >
        <svg
          className="w-4 h-4 text-gmi-brand-cyan"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
           <span className="statistics-button__badge">Ny</span>
           <span>Statistikk</span>
      </button>
      )}

      {/* Stats Modal */}
      <StatsModal
        isOpen={showStats}
        onClose={() => setShowStats(false)}
      />
      <AppInfoModal
        isOpen={showAppInfo}
        initialTab={appInfoInitialTab}
        onClose={() => setShowAppInfo(false)}
        openerRef={appInfoTriggerRef}
      />

      {/* Initial Upload Screen */}
      {parsingStatus !== 'done' && (
        <div className="flex-1 flex items-center justify-center overflow-y-auto py-6">
          <div className="my-auto max-w-xl w-full px-4">
            <div className="text-center mb-8">
              <BrandWordmark large />
              <p className="mt-2 text-gmi-text-muted">
                Last opp og valider GMI-filer
              </p>
              <div className="mt-4 flex justify-center empty:hidden">
                <TestModeControl />
              </div>
            </div>

            {/* Error Display */}
            {parsingStatus === 'error' && parsingError && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
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

            <div className="rounded-xl border border-gmi-border bg-gmi-surface p-6 shadow-sm">
              <FileUpload />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  ref={appInfoTriggerRef}
                  type="button"
                  onClick={(event) => openAppInfo('about', event.currentTarget)}
                  aria-haspopup="dialog"
                  aria-label={`Om appen, versjon ${CURRENT_APP_VERSION}`}
                  title="Informasjon om appen og versjonshistorikk"
                  className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-1.5 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-xs font-medium"
                >
                  <InfoIcon size={15} weight="regular" aria-hidden="true" />
                  <span className="whitespace-nowrap">Om appen · v{CURRENT_APP_VERSION}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => openAppInfo('contact', event.currentTarget)}
                  aria-haspopup="dialog"
                  className="gmi-compact-button gmi-focus-ring inline-flex min-h-9 items-center gap-1.5 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-xs font-medium"
                >
                  <EnvelopeSimpleIcon size={15} weight="regular" aria-hidden="true" />
                  <span className="whitespace-nowrap">Kontakt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main App Layout (Sidebar + Map) */}
      {parsingStatus === 'done' && (
        <>
          {/* Background terrain fetcher - runs in background */}
          <TerrainFetcher />

          <WorkspaceShell
            sidebarWidth={sidebarWidth}
            onOpenAppInfo={(event) => openAppInfo('about', event.currentTarget)}
            appInfoTriggerRef={appInfoTriggerRef}
            sidebar={fieldValidationOpen ? (
              <FieldValidationSidebar
                sidebarWidth={sidebarWidth}
                canDockInspector={canDockInspector}
                onDockedInspectorChange={setDockedInspectorOpen}
                onOpenContact={(event) => openAppInfo('contact', event.currentTarget)}
              />
            ) : (
              <Sidebar
                onReset={handleReset}
                onAddFile={() => setShowAddLayerModal(true)}
                onOpenContact={(event) => openAppInfo('contact', event.currentTarget)}
                width={sidebarWidth}
                onWidthChange={setSidebarWidth}
              />
            )}
            bottomDockOpen={layerDataTableOpen}
            bottomDock={<LayerDataTable />}
            primary={(
              <div className="flex h-full min-h-0 min-w-0 flex-1">
                <MapPanePresentationProvider className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
                <MapPaneToolbar
                  onReset={handleReset}
                  onShare={() => setShowShareModal(true)}
                  showShare={parsingStatus === 'done'}
                />
                <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            {/* Show Map view when activeViewTab is 'map' or 3D viewer is not open */}
            {(!viewer3DOpen || activeViewTab === 'map') && (
              <>
                {/* Map fills the upper row, or leaves room for profile analysis */}
                <div
                  className="relative"
                  style={{
                    height: primaryViewHeight,
                    transition: 'height 0.2s ease',
                  }}
                >
                  <MapView onZoomChange={setZoomLevel} />

                  {/* Floating Zoom Indicator */}
                  <div
                    className="absolute bottom-4 left-4"
                    style={{ zIndex: 1000 }}
                  >
                    <div className="bg-gmi-surface/90 backdrop-blur px-3 py-2 rounded shadow border border-gmi-border text-gmi-text text-sm font-mono">
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
                        className="gmi-compact-button gmi-focus-ring px-2 py-1.5 shadow text-xs font-medium border bg-gmi-surface/90 border-gmi-border backdrop-blur flex items-center gap-1"
                        aria-label={customWmsConfig ? 'Endre WMS-innstillinger' : 'Legg til Gemini WMS'}
                        title={
                          customWmsConfig
                            ? 'Endre WMS-innstillinger'
                            : 'Legg til Gemini WMS'
                        }
                      >
                        {customWmsConfig ? (
                          <GearSixIcon size={14} weight="regular" aria-hidden="true" />
                        ) : (
                          <PlusIcon size={14} weight="regular" aria-hidden="true" />
                        )}
                        {customWmsConfig ? '' : 'WMS'}
                      </button>
                    </div>
                  </div>

                  {/* Floating Inspect Button - Only show when table is closed AND analysis is closed AND field validation is closed */}
                  {!analysisOpen && !fieldValidationOpen && (
                    <div
                      className="absolute bottom-4 -translate-x-1/2"
                      style={{
                        zIndex: 1000,
                        left: 'calc(50% - 320px)',
                      }}
                    >
                      <button
                        onClick={() => openDataInspector(null)}
                        className="gmi-compact-button gmi-focus-ring px-4 py-2 shadow font-medium border border-gmi-border bg-gmi-surface"
                      >
                        Inspiser data
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Show 3D view when viewer is open and activeViewTab is '3d' */}
            {viewer3DOpen && activeViewTab === '3d' && (
              <div
                className="relative"
                style={{
                  height: primaryViewHeight,
                  transition: 'height 0.2s ease',
                }}
              >
                <Viewer3D />
              </div>
            )}

            {/* Profile analysis modal - overlays both 2D and 3D views */}
            <InclineAnalysisModal />
          </div>
                </MapPanePresentationProvider>
          <div id="validation-v2-field-inspector-root" className="contents" />
        </div>
            )}
          />
        </>
      )}

      {/* Data Inspector Modal */}
      <DataDisplayModal />
      <ZValidationModal />

      {/* Add Layer Modal */}
      {showAddLayerModal && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-gmi-ink/50"
          onClick={() => setShowAddLayerModal(false)}
        >
          <div
            className="mx-4 w-full max-w-xl rounded-xl border border-gmi-border bg-gmi-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gmi-navy">
                Legg til nytt lag
              </h2>
              <button
                onClick={() => setShowAddLayerModal(false)}
                aria-label="Lukk legg til lag"
                className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
              >
                <XIcon size={24} weight="regular" aria-hidden="true" />
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

      <ShareQrModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        repoUrl={PUBLIC_REPO_URL}
      />
    </div>
  );
}
