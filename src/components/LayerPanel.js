'use client';

import { useState } from 'react';
import { useLayerFilterDisclosure } from '@/lib/useLayerFilterDisclosure';
import { LayerTemaSection, LayerFeltSection } from './LayerFilterSections';
import useStore from '@/lib/store';
import LayerTypeBadge from './LayerTypeBadge';
import { isLoadedGmiSurveyLayer, loadedGmiSources } from '@/lib/photos/loadedGmiSource.mjs';
import { analyzeIncline } from '@/lib/analysis/incline';
import { analyzeZValues } from '@/lib/analysis/zValidation';
import { analyzeTopplok } from '@/lib/analysis/topplok';
import { detectOutliers } from '@/lib/analysis/outliers';
import { getLayerHighlightStyle } from '@/lib/map/layerHighlight.mjs';
import PhotoIconButton from './photos/PhotoIconButton';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { describeGmiEditStatus } from '@/lib/gmiEditView.mjs';
import { UnsavedGmiLayers } from './gmi-edit/GmiConfirmDialog';
import {
  ArrowCounterClockwiseIcon,
  CameraPlusIcon,
  CaretDownIcon,
  CornersOutIcon,
  PencilSimpleLineIcon,
  TableIcon,
  TrashIcon,
} from '@phosphor-icons/react';

/**
 * Analysis button row with icon buttons and tooltips
 * Shows compact icon-only buttons for each analysis function
 */
function LayerAnalysisButtons({
  layerId,
  layer,
  onTopplokClick,
  hasTopplokResults,
  topplokOpen,
}) {
  const setLayerAnalysisResults = useStore(
    (state) => state.setLayerAnalysisResults,
  );
  const toggleLayerAnalysisModal = useStore(
    (state) => state.toggleLayerAnalysisModal,
  );
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const setAnalysisLayerId = useStore(
    (state) => state.setAnalysisLayerId,
  );
  const toggleAnalysisModal = useStore(
    (state) => state.toggleAnalysisModal,
  );
  const setLayerZValidationResults = useStore(
    (state) => state.setLayerZValidationResults,
  );
  const toggleLayerZValidationModal = useStore(
    (state) => state.toggleLayerZValidationModal,
  );
  const setZValidationResults = useStore(
    (state) => state.setZValidationResults,
  );
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );
  const toggleFieldValidation = useStore(
    (state) => state.toggleFieldValidation,
  );
  const toggleLayerHighlightAll = useStore(
    (state) => state.toggleLayerHighlightAll,
  );
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
  );

  const data = layer?.data;
  const isKof = data?.format === 'KOF';
  const analysisResults = layer?.analysis?.results || [];
  const zValidationResults = layer?.zValidation?.results;
  const highlightAll = layer?.highlightAll;

  const runInclineAnalysis = () => {
    if (!data) return;
    const results = analyzeIncline(data, {
      minInclineMode: inclineRequirementMode,
    });
    setLayerAnalysisResults(layerId, results);
    setAnalysisResults(results);
    setAnalysisLayerId(layerId);
    toggleAnalysisModal(true);
    toggleLayerAnalysisModal(layerId, true);
  };

  const runZValidation = () => {
    if (!data) return;
    const results = analyzeZValues(data);
    setLayerZValidationResults(layerId, results);
    toggleLayerZValidationModal(layerId, true);
    setZValidationResults(results);
    toggleZValidationModal(true);
  };

  const errorCount = analysisResults.filter(
    (r) => r.status === 'error',
  ).length;
  const warningCount = analysisResults.filter(
    (r) => r.status === 'warning',
  ).length;
  const zMissing =
    (zValidationResults?.summary?.missingPointObjects || 0) +
    (zValidationResults?.summary?.missingLineObjects || 0);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Layer highlight toggle */}
      <button
        onClick={() => toggleLayerHighlightAll(layerId)}
        className={`gmi-focus-ring relative rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy ${highlightAll ? 'gmi-selected-control' : ''}`}
        title={
          highlightAll ? 'Skru av laghighlight' : 'Marker alt i laget'
        }
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3l2.09 6.26L20.5 9.27l-5.2 3.78 1.98 6.1L12 15.77 6.72 19.15l1.98-6.1-5.2-3.78 6.41-.01L12 3z"
          />
        </svg>
      </button>

      {/* Profilanalyse */}
      <button
        onClick={
          analysisResults.length > 0
            ? () => {
                setAnalysisResults(analysisResults);
                setAnalysisLayerId(layerId);
                toggleAnalysisModal(true);
                toggleLayerAnalysisModal(layerId, true);
              }
            : runInclineAnalysis
        }
        className="gmi-focus-ring relative rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isKof}
        title={
          isKof
            ? 'Ikke tilgjengelig for KOF'
            : analysisResults.length > 0
              ? 'Åpne profilanalyse'
              : 'Kjør profilanalyse'
        }
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
        {analysisResults.length > 0 &&
          (errorCount > 0 || warningCount > 0) && (
            <span
              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${errorCount > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}
            />
          )}
      </button>

      {/* Høydekontroll */}
      <button
        onClick={
          zValidationResults
            ? () => {
                setZValidationResults(zValidationResults);
                toggleZValidationModal(true);
                toggleLayerZValidationModal(layerId, true);
              }
            : runZValidation
        }
        className="gmi-focus-ring relative rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
        title={
          zValidationResults
            ? 'Åpne høydekontroll'
            : 'Kjør høydekontroll'
        }
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        {zMissing > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>

      {/* Feltvalidering */}
      <button
        onClick={() => toggleFieldValidation(true)}
        className="gmi-focus-ring relative rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isKof}
        title={isKof ? 'Ikke tilgjengelig for KOF' : 'Feltvalidering'}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      </button>

      {/* Topplok kontroll */}
      <button
        onClick={onTopplokClick}
        className={`gmi-focus-ring relative rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy disabled:cursor-not-allowed disabled:opacity-50 ${topplokOpen ? 'gmi-selected-control' : ''}`}
        disabled={isKof}
        title={
          isKof
            ? 'Ikke tilgjengelig for KOF'
            : hasTopplokResults
              ? 'Vis/skjul topplok'
              : 'Kjør topplok kontroll'
        }
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 12h16M6 12l6-7 6 7M6 12l6 7 6-7"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * Topplok control for a specific layer
 */
function LayerTopplokSection({
  layerId,
  layer,
  results,
  showResults,
  setShowResults,
  setResults,
}) {
  const data = layer?.data;
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const [activeTab, setActiveTab] = useState('missing');

  const isKof = data?.format === 'KOF';

  const highlightPoint = (pointIndex) => {
    const featureId = `punkter-${pointIndex}`;
    const coord = data?.points?.[pointIndex]?.coordinates?.[0];

    if (
      coord &&
      Number.isFinite(coord.x) &&
      Number.isFinite(coord.y)
    ) {
      viewObjectInMap(featureId, [coord.y, coord.x], 21);
      return;
    }

    setHighlightedFeature(featureId);
  };

  const hasIssues =
    results &&
    (results.summary.missing > 0 ||
      results.summary.orphanLokCount > 0);

  if (isKof || !results || !showResults) return null;

  return (
    <div
      className="px-3 py-2 border-b"
      style={{ borderColor: 'var(--gmi-border)' }}
    >
      <div className="text-[10px] text-gmi-text-muted space-y-1">
        <div className="flex justify-between">
          <span>{results.summary.total} kontrollert</span>
          <span
            className={
              results.summary.missing > 0
                ? 'text-red-600 font-semibold'
                : 'text-green-600'
            }
          >
            {results.summary.missing} mangler LOK
          </span>
        </div>
        {results.summary.orphanLokCount > 0 && (
          <div className="flex justify-between">
            <span>{results.summary.lokCount} LOK funnet</span>
            <span className="text-yellow-600 font-semibold">
              {results.summary.orphanLokCount} uten eier
            </span>
          </div>
        )}
      </div>

      {showResults && hasIssues && (
        <div className="mt-2 border border-gmi-border rounded bg-gmi-surface-soft">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('missing')}
              className={`gmi-focus-ring flex-1 py-1 text-[10px] font-medium transition-colors ${
                activeTab === 'missing'
                  ? 'bg-white border-b-2 border-red-500 text-red-700'
                  : 'text-gmi-text-subtle hover:bg-gmi-surface-soft'
              }`}
            >
              Mangler LOK ({results.summary.missing})
            </button>
            <button
              onClick={() => setActiveTab('orphan')}
              className={`gmi-focus-ring flex-1 py-1 text-[10px] font-medium transition-colors ${
                activeTab === 'orphan'
                  ? 'bg-white border-b-2 border-yellow-500 text-yellow-700'
                  : 'text-gmi-text-subtle hover:bg-gmi-surface-soft'
              }`}
            >
              LOK uten eier ({results.summary.orphanLokCount})
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto p-2">
            {activeTab === 'missing' && (
              <div className="space-y-1">
                {results.results
                  .filter((r) => r.status === 'error')
                  .map((r) => (
                    <button
                      key={`missing-${r.pointIndex}`}
                      onClick={() => highlightPoint(r.pointIndex)}
                      className="gmi-focus-ring w-full text-left text-[10px] p-1.5 rounded hover:bg-red-50 border border-transparent hover:border-red-200"
                    >
                      <span className="text-red-700 font-medium">
                        {r.fcode}
                      </span>
                      <span className="text-gmi-text-muted">
                        {' '}
                        — {r.message}
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {activeTab === 'orphan' && (
              <div className="space-y-1">
                {results.orphanLoks.map((r) => (
                  <button
                    key={`orphan-${r.pointIndex}`}
                    onClick={() => highlightPoint(r.pointIndex)}
                    className="gmi-focus-ring w-full text-left text-[10px] p-1.5 rounded hover:bg-yellow-50 border border-transparent hover:border-yellow-200"
                  >
                    <span className="text-yellow-700 font-medium">
                      {r.fcode}
                    </span>
                    <span className="text-gmi-text-muted">
                      {' '}
                      — {r.message}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * LayerPanel - Expandable panel for a single layer
 *
 * Shows layer name, visibility toggle, and
 * expandable sections for Tema and Felt filtering plus analysis buttons.
 */
export default function LayerPanel({ layerId, codeLookups, onAddGmiPhotos }) {
  const layer = useStore((state) => state.layers[layerId]);
  const expandedLayerId = useStore(
    (state) => state.ui.expandedLayerId,
  );
  const setExpandedLayer = useStore(
    (state) => state.setExpandedLayer,
  );
  const toggleLayerVisibility = useStore(
    (state) => state.toggleLayerVisibility,
  );
  const removeLayer = useStore((state) => state.removeLayer);
  const gmiEditStatus = useStore((state) => state.gmiEditStatus?.[layerId] ?? null);
  const openGmiEditWorkspace = useStore((state) => state.openGmiEditWorkspace);
  // Unsaved GMI corrections that removing this layer would discard; shown in the confirmation before anything is removed.
  const [removeWarning, setRemoveWarning] = useState(null);
  const openLayerDataTable = useStore(
    (state) => state.openLayerDataTable,
  );
  const resetLayerFilters = useStore(
    (state) => state.resetLayerFilters,
  );
  const feltFilterActive = useStore(
    (state) => state.ui.feltFilterActive,
  );
  const setFeltFilterActive = useStore(
    (state) => state.setFeltFilterActive,
  );
  const setLayerFitBoundsTarget = useStore(
    (state) => state.setLayerFitBoundsTarget,
  );

  const isExpanded = expandedLayerId === layerId;
  const data = layer?.data;
  const pointCount = data?.points?.length || 0;
  const lineCount = data?.lines?.length || 0;

  const [topplokResults, setTopplokResults] = useState(null);
  const [topplokOpen, setTopplokOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Inner section state: 'tema' | 'felt' | null
  const [innerOpen, setInnerOpen] = useLayerFilterDisclosure(layerId, 'section', (() => {
    if (feltFilterActive || layer?.feltHiddenValues?.length > 0)
      return 'felt';
    if (
      layer?.hiddenCodes?.length > 0 ||
      layer?.hiddenTypes?.length > 0
    )
      return 'tema';
    return null;
  })());

  if (!layer) return null;

  const toggleTema = () => {
    if (innerOpen === 'tema') {
      setInnerOpen(null);
      setFeltFilterActive(false);
    } else {
      setInnerOpen('tema');
      setFeltFilterActive(false);
    }
  };

  const toggleFelt = () => {
    if (innerOpen === 'felt') {
      setInnerOpen(null);
      setFeltFilterActive(false);
    } else {
      setInnerOpen('felt');
      setFeltFilterActive(true);
    }
  };

  const handleTopplokClick = () => {
    if (layer?.data?.format === 'KOF') return;
    if (!topplokResults) {
      const analysis = analyzeTopplok(layer?.data);
      setTopplokResults(analysis);
      setTopplokOpen(true);
      return;
    }
    setTopplokOpen((prev) => !prev);
  };

  const layerColor = getLayerHighlightStyle(layer, layerId).color;

  return (
    <div className="py-1">
      <div
      className={`border-b-2 border-gmi-border transition-colors ${!layer.visible ? 'opacity-60' : ''}`}
      >
        {/* Layer header */}
        <div
          className="flex cursor-pointer items-center gap-2 p-2 transition-colors hover:bg-gmi-surface-soft"
          onClick={() => setExpandedLayer(layerId)}
        >
          {/* Visibility toggle */}
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(e) => {
              e.stopPropagation();
              toggleLayerVisibility(layerId);
            }}
            className="h-3.5 w-3.5 rounded border-gmi-border-strong accent-gmi-interactive text-gmi-interactive focus:ring-gmi-interactive"
            title={layer.visible ? 'Skjul lag' : 'Vis lag'}
          />

          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full border border-gmi-border-strong"
            style={{ backgroundColor: layerColor }}
            title={`Markeringsfarge: ${layerColor}`}
          />

          {/* Layer name and stats */}
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <LayerTypeBadge layer={layer} />
              <span className="truncate text-xs font-medium text-gmi-text" title={layer.name}>{layer.name}</span>
            </div>
            <div className="text-[10px] text-gmi-text-subtle">
              {pointCount} punkt, {lineCount} ledn.
              {gmiEditStatus?.changeSetCount > 0 && (
                <span className="gmi-edit-layer-pill" data-downloaded={gmiEditStatus.downloaded || undefined} data-gmi-layer-pill>
                  {gmiEditStatus.changeSetCount} {gmiEditStatus.changeSetCount === 1 ? 'retting' : 'rettinger'}{gmiEditStatus.unsaved ? ' · ikke lastet ned' : gmiEditStatus.downloaded ? ' · lastet ned' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* Rettinger: individual corrections of this layer's attribute values (a revised copy; the import is never changed). */}
            {isLoadedGmiSurveyLayer(layer) && (
              <PhotoIconButton icon={PencilSimpleLineIcon} size={14} label="Rettinger: rett feltverdier"
                tooltip={loadedGmiSources.available(layerId) ? 'Rettinger: rett feltverdier' : 'Rettinger – originalfilen er ikke tilgjengelig i denne økten, så verdiene kan bare vises.'}
                data-gmi-edit-action={layerId} className="layer-card-icon-button"
                onClick={(event) => { event.stopPropagation(); openGmiEditWorkspace(layerId); }} />
            )}
            {/* Connects photos to this GMI layer's object references; never a separate new FOTO import. */}
            {isLoadedGmiSurveyLayer(layer) && (() => {
              const available = Boolean(onAddGmiPhotos) && loadedGmiSources.available(layerId);
              return <PhotoIconButton icon={CameraPlusIcon} size={14} label="Koble bilder til GMI-laget"
                tooltip={available ? 'Koble bilder til GMI-laget' : 'Koble bilder til GMI-laget – originalfilen er ikke tilgjengelig i denne økten. Last GMI-filen inn på nytt.'}
                unavailable={!available} aria-haspopup="dialog" data-gmi-photo-action={layerId} className="layer-card-icon-button"
                onClick={(event) => { event.stopPropagation(); onAddGmiPhotos?.(layerId, event); }} />;
            })()}
            {/* Zoom to layer */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLayerFitBoundsTarget(layerId);
              }}
              className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy"
              title="Zoom til lag"
              aria-label="Zoom til lag"
            >
              <CornersOutIcon size={14} weight="regular" aria-hidden="true" />
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const unsaved = gmiEditSessions.unsavedLayers([layerId]);
                setRemoveWarning(unsaved.length ? unsaved : null);
                setShowRemoveConfirm(true);
              }}
              className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle transition-colors hover:bg-red-100 hover:text-red-600"
              title="Fjern lag"
              aria-label="Fjern lag"
            >
              <TrashIcon size={14} weight="regular" aria-hidden="true" />
            </button>

            {/* Expand indicator */}
            <CaretDownIcon
              size={12}
              weight="regular"
              aria-hidden="true"
              className={`transform text-gmi-text-subtle transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {gmiEditStatus?.state === 'invalidated' && (
          <div className="gmi-edit-layer-notice" role="status" data-gmi-invalidated>
            <span>{describeGmiEditStatus(gmiEditStatus).message}</span>
            <button type="button" className="gmi-focus-ring underline" onClick={() => gmiEditSessions.dispose(layerId)}>OK</button>
          </div>
        )}

        {showRemoveConfirm && (
          <div className="fixed inset-0 z-10002 flex items-center justify-center bg-gmi-ink/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-gmi-border bg-gmi-surface shadow-xl">
              <div className="border-b border-gmi-border px-4 py-3">
                <h3 className="text-sm font-semibold text-gmi-navy">
                  Fjern lag
                </h3>
              </div>
              <div className="px-4 py-3 text-sm text-gmi-text">
                Er du sikker på at du vil fjerne lag “{layer.name}”?
                {removeWarning && (
                  <div className="mt-3 grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="alert" data-gmi-remove-warning>
                    <p className="font-semibold">Laget har rettinger som ikke er lastet ned.</p>
                    <UnsavedGmiLayers layers={removeWarning} names={{ [layerId]: layer.name }} />
                    <p>Fjerner du laget, forkastes rettingene. Velg «Avbryt» og last ned revidert GMI først for å beholde dem.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gmi-border px-4 py-3">
                <button
                  onClick={() => { setShowRemoveConfirm(false); setRemoveWarning(null); }}
                  className="gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-sm"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    // Discard only after the warning above was shown; otherwise the store refuses and we warn now.
                    const result = removeLayer(layerId, removeWarning ? { discardGmiEdits: true } : undefined);
                    if (result?.ok === false && result.code === 'gmi-edits-pending') { setRemoveWarning(result.layers); return; }
                    setRemoveWarning(null);
                    setShowRemoveConfirm(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                >
                  {removeWarning ? 'Forkast rettinger og fjern' : 'Fjern'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="border-t border-gmi-border bg-gmi-surface-soft/60"
          >
            {/* Analysis buttons row */}
            <div
              className="flex items-center justify-between border-b border-gmi-border px-3 py-2"
            >
              <span className="text-[10px] text-gmi-text-subtle">
                Analyse
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => resetLayerFilters(layerId)}
                  className="gmi-focus-ring rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface hover:text-gmi-navy"
                  title="Nullstill filtre"
                  aria-label="Nullstill filtre"
                >
                  <ArrowCounterClockwiseIcon size={16} weight="regular" aria-hidden="true" />
                </button>
                <button
                  onClick={() => openLayerDataTable(layerId)}
                  className="gmi-focus-ring rounded-lg p-1.5 text-gmi-interactive transition-colors hover:bg-gmi-surface hover:text-gmi-navy"
                  title="Åpne datatabell"
                  aria-label="Åpne datatabell"
                >
                  <TableIcon size={16} weight="regular" aria-hidden="true" />
                </button>
                <LayerAnalysisButtons
                  layerId={layerId}
                  layer={layer}
                  onTopplokClick={handleTopplokClick}
                  hasTopplokResults={!!topplokResults}
                  topplokOpen={topplokOpen}
                />
              </div>
            </div>

            <LayerTopplokSection
              layerId={layerId}
              layer={layer}
              results={topplokResults}
              showResults={topplokOpen}
              setShowResults={setTopplokOpen}
              setResults={setTopplokResults}
            />

            {/* Tema section */}
            <LayerTemaSection
              layerId={layerId}
              layer={layer}
              codeLookups={codeLookups}
              isOpen={innerOpen === 'tema'}
              onToggle={toggleTema}
            />

            {/* Felt section */}
            <LayerFeltSection
              layerId={layerId}
              layer={layer}
              isOpen={innerOpen === 'felt'}
              onToggle={toggleFelt}
              setGlobalFeltActive={setFeltFilterActive}
            />
          </div>
        )}
      </div>
    </div>
  );
}
