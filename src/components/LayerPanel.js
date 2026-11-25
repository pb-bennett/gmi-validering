'use client';

import { useId, useState } from 'react';
import { useLayerFilterDisclosure } from '@/lib/useLayerFilterDisclosure';
import { LayerTemaSection, LayerFeltSection } from './LayerFilterSections';
import useStore from '@/lib/store';
import LayerTypeBadge from './LayerTypeBadge';
import { isLoadedGmiSurveyLayer, loadedGmiSources } from '@/lib/photos/loadedGmiSource.mjs';
import { analyzeTopplok } from '@/lib/analysis/topplok';
import AnalysisErrorBoundary, { AnalysisErrorMessage } from './AnalysisErrorBoundary';
import { getLayerHighlightStyle } from '@/lib/map/layerHighlight.mjs';
import PhotoIconButton from './photos/PhotoIconButton';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { describeGmiEditStatus } from '@/lib/gmiEditView.mjs';
import GmiConfirmDialog, { UnsavedGmiLayers } from './gmi-edit/GmiConfirmDialog';
import {
  ArrowCounterClockwiseIcon,
  CameraPlusIcon,
  CaretDownIcon,
  ChartLineIcon,
  CircleHalfIcon,
  ClipboardTextIcon,
  CornersOutIcon,
  HighlighterIcon,
  MountainsIcon,
  PencilSimpleLineIcon,
  TableIcon,
  TrashIcon,
} from '@phosphor-icons/react';

const REMOVE_LAYER_HEADING = 'Fjern lag';

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
  const openLayerAnalysis = useStore(
    (state) => state.openLayerAnalysis,
  );
  const openLayerZValidation = useStore(
    (state) => state.openLayerZValidation,
  );
  const openLayerValidator = useStore(
    (state) => state.openLayerValidator,
  );
  const toggleLayerHighlightAll = useStore(
    (state) => state.toggleLayerHighlightAll,
  );

  const data = layer?.data;
  const isKof = data?.format === 'KOF';
  const analysisResults = layer?.analysis?.results || [];
  const zValidationResults = layer?.zValidation?.results;
  const highlightAll = Boolean(layer?.highlightAll);

  const zMissing =
    (zValidationResults?.summary?.missingPointObjects || 0) +
    (zValidationResults?.summary?.missingLineObjects || 0);
  const zAction = zValidationResults ? 'Åpne høydekontroll' : 'Kjør høydekontroll';

  return (
    <div className="layer-analysis-actions flex items-center gap-1.5 flex-wrap">
      {/* Layer highlight toggle */}
      <PhotoIconButton
        icon={HighlighterIcon}
        size={16}
        label="Marker alt i laget"
        tooltip={highlightAll ? 'Skru av laghighlight' : 'Marker alt i laget'}
        pressed={highlightAll}
        className={`layer-card-icon-button${highlightAll ? ' gmi-selected-control' : ''}`}
        onClick={() => toggleLayerHighlightAll(layerId)}
      />

      {/* Profilanalyse */}
      <PhotoIconButton
        icon={ChartLineIcon}
        size={16}
        label="Profilanalyse"
        tooltip={isKof ? 'Ikke tilgjengelig for KOF' : analysisResults.length > 0 ? 'Åpne profilanalyse' : 'Kjør profilanalyse'}
        unavailable={isKof}
        className="layer-card-icon-button"
        onClick={() => openLayerAnalysis(layerId)}
      />

      {/* Høydekontroll */}
      <PhotoIconButton
        icon={MountainsIcon}
        size={16}
        label="Høydekontroll"
        tooltip={zMissing > 0 ? `${zAction} · ${zMissing} ${zMissing === 1 ? 'objekt' : 'objekter'} mangler Z` : zAction}
        className="layer-card-icon-button"
        onClick={() => openLayerZValidation(layerId)}
      >
        {zMissing > 0 && (
          <span aria-hidden="true" className="gmi-validation-dot absolute -top-1 -right-1 size-2 rounded-full" data-validation-tone="error" />
        )}
      </PhotoIconButton>

      {/* Validator */}
      <PhotoIconButton
        icon={ClipboardTextIcon}
        size={16}
        label="Validator"
        tooltip={isKof ? 'Ikke tilgjengelig for KOF' : 'Validator'}
        unavailable={isKof}
        className="layer-card-icon-button"
        onClick={() => openLayerValidator(layerId)}
      />

      {/* Topplok kontroll */}
      <PhotoIconButton
        icon={CircleHalfIcon}
        size={16}
        label="Topplok"
        tooltip={isKof ? 'Ikke tilgjengelig for KOF' : hasTopplokResults ? (topplokOpen ? 'Skjul topplok' : 'Vis topplok') : 'Kjør topplok kontroll'}
        unavailable={isKof}
        pressed={topplokOpen}
        className={`layer-card-icon-button${topplokOpen ? ' gmi-selected-control' : ''}`}
        onClick={onTopplokClick}
      />
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
    // Point indices repeat across files; only the layer-qualified ID names this object.
    const featureId = `punkter-${layerId}-${pointIndex}`;
    const coord = data?.points?.[pointIndex]?.coordinates?.[0];

    if (
      coord &&
      Number.isFinite(coord.x) &&
      Number.isFinite(coord.y)
    ) {
      viewObjectInMap(featureId, [coord.y, coord.x], 21, {
        layerId,
        objectType: 'point',
        pointIndex,
      });
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
 * The layer's outliers: hiding them in the map is display only and is always undone here, on the owning layer.
 */
function LayerOutlierRow({ layerId, layer }) {
  const setLayerOutliersHidden = useStore(
    (state) => state.setLayerOutliersHidden,
  );
  const count = layer.outliers?.results?.outliers?.length || 0;
  if (count === 0) return null;
  const hidden = Boolean(layer.outliers.hideOutliers);
  const noun = count === 1 ? 'avviker' : 'avvikere';
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gmi-border px-3 py-2" data-layer-outliers={hidden ? 'hidden' : 'shown'}>
      <span className="text-[10px] text-gmi-text-muted" role="status">
        {count} {noun} {hidden ? 'skjult i kartet' : 'vist i kartet'}
      </span>
      <button
        type="button"
        onClick={() => setLayerOutliersHidden(layerId, !hidden)}
        className="gmi-compact-button gmi-focus-ring shrink-0 border border-gmi-border-strong bg-gmi-surface px-2 py-0.5 text-[10px] font-medium"
      >
        {hidden ? 'Vis avvikere' : 'Ignorer avvikere'}
      </button>
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
  const contentId = useId();
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
  const ignoredOutliers = layer.outliers?.hideOutliers
    ? layer.outliers.results?.outliers?.length || 0
    : 0;

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
            onChange={() => toggleLayerVisibility(layerId)}
            // The header toggles the card; showing or hiding the layer must not.
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded border-gmi-border-strong accent-gmi-interactive text-gmi-interactive focus:ring-gmi-interactive"
            title={layer.visible ? 'Skjul lag' : 'Vis lag'}
          />

          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full border border-gmi-border-strong"
            style={{ backgroundColor: layerColor }}
            title={`Markeringsfarge: ${layerColor}`}
          />

          {/* Layer name and stats: the keyboard way to the disclosure. Its click reaches the header, which toggles the card. */}
          <button type="button" aria-expanded={isExpanded} aria-controls={isExpanded ? contentId : undefined}
            className="gmi-focus-ring min-w-0 flex-1 rounded text-left">
            <span className="flex min-w-0 items-center gap-1.5">
              <LayerTypeBadge layer={layer} />
              <span className="truncate text-xs font-medium text-gmi-text" title={layer.name}>{layer.name}</span>
            </span>
            <span className="block text-[10px] text-gmi-text-subtle">
              {pointCount} punkt, {lineCount} ledn.
              {!isExpanded && ignoredOutliers > 0 && ` · ${ignoredOutliers} ${ignoredOutliers === 1 ? 'avviker' : 'avvikere'} skjult i kartet`}
              {gmiEditStatus?.changeSetCount > 0 && (
                <span className="gmi-edit-layer-pill" data-downloaded={gmiEditStatus.downloaded || undefined} data-gmi-layer-pill>
                  {gmiEditStatus.changeSetCount} {gmiEditStatus.changeSetCount === 1 ? 'retting' : 'rettinger'}{gmiEditStatus.unsaved ? ' · ikke lastet ned' : gmiEditStatus.downloaded ? ' · lastet ned' : ''}
                </span>
              )}
            </span>
          </button>

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
            <PhotoIconButton icon={CornersOutIcon} size={14} label="Zoom til lag" className="layer-card-icon-button"
              onClick={(event) => { event.stopPropagation(); setLayerFitBoundsTarget(layerId); }} />

            {/* Remove: muted at rest like its neighbours; the destructive red treatment shows on hover (DA2a). */}
            <PhotoIconButton icon={TrashIcon} size={14} label="Fjern lag" aria-haspopup="dialog"
              className="layer-card-icon-button layer-card-icon-button-destructive"
              onClick={(event) => {
                event.stopPropagation();
                const unsaved = gmiEditSessions.unsavedLayers([layerId]);
                setRemoveWarning(unsaved.length ? unsaved : null);
                setShowRemoveConfirm(true);
              }} />

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
          <GmiConfirmDialog title={REMOVE_LAYER_HEADING} testId="remove-layer"
            confirmLabel={removeWarning ? 'Forkast rettinger og fjern' : 'Fjern'}
            onCancel={() => { setShowRemoveConfirm(false); setRemoveWarning(null); }}
            onConfirm={() => {
              // Discard only after the warning below was shown; otherwise the store refuses and we warn now.
              const result = removeLayer(layerId, removeWarning ? { discardGmiEdits: true } : undefined);
              if (result?.ok === false && result.code === 'gmi-edits-pending') { setRemoveWarning(result.layers); return; }
              setRemoveWarning(null);
              setShowRemoveConfirm(false);
              // The opener went with the layer: continue from the layer manager instead of the top of the page.
              requestAnimationFrame(() => {
                if (document.activeElement === document.body) document.querySelector('[data-add-file], [data-file-picker]')?.focus();
              });
            }}>
                <p className="break-words">Er du sikker på at du vil fjerne lag “{layer.name}”?</p>
                {removeWarning && (
                  <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="alert" data-gmi-remove-warning>
                    <p className="font-semibold">Laget har rettinger som ikke er lastet ned.</p>
                    <UnsavedGmiLayers layers={removeWarning} names={{ [layerId]: layer.name }} />
                    <p>Fjerner du laget, forkastes rettingene. Velg «Avbryt» og last ned revidert GMI først for å beholde dem.</p>
                  </div>
                )}
          </GmiConfirmDialog>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <div
            id={contentId}
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
                <PhotoIconButton icon={ArrowCounterClockwiseIcon} size={16} label="Nullstill filtre" className="layer-card-icon-button"
                  onClick={() => resetLayerFilters(layerId)} />
                <PhotoIconButton icon={TableIcon} size={16} label="Åpne datatabell" className="layer-card-icon-button"
                  onClick={() => openLayerDataTable(layerId)} />
                <LayerAnalysisButtons
                  layerId={layerId}
                  layer={layer}
                  onTopplokClick={handleTopplokClick}
                  hasTopplokResults={!!topplokResults}
                  topplokOpen={topplokOpen}
                />
              </div>
            </div>

            <LayerOutlierRow layerId={layerId} layer={layer} />

            <AnalysisErrorBoundary
              resetKey={`${layerId}:${topplokOpen}`}
              onRetry={() => setTopplokResults(analyzeTopplok(layer.data))}
              renderFallback={(retry) => topplokOpen && (
                <AnalysisErrorMessage compact kind="topplok" title="Topplok-resultatet kunne ikke vises."
                  closeLabel="Lukk topplok" onRetry={retry} onClose={() => setTopplokOpen(false)} />
              )}
            >
              <LayerTopplokSection
                layerId={layerId}
                layer={layer}
                results={topplokResults}
                showResults={topplokOpen}
                setShowResults={setTopplokOpen}
                setResults={setTopplokResults}
              />
            </AnalysisErrorBoundary>

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
