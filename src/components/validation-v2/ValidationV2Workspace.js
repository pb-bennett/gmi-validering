'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import useStore from '@/lib/store';
import { runGmiValidationV2 } from '@/lib/validation-v2';
import { getValidationRules } from '@/lib/validation-v2/registry/rules';
import { getDatasetRevision } from '@/lib/validation-v2/datasetRevision';
import { createValidationV2ViewController } from '@/lib/validation-v2/validationViewController';
import {
  createValidationV2Input,
  getValidationV2GeometrySelection,
  isCurrentValidationV2Result,
  isGmiLayer,
} from '@/lib/validation-v2/uiIntegration';
import {
  ValidationV2SortMode,
  ValidationV2StatusFilter,
  createValidationV2PresentationState,
  getValidationV2PresentationRules,
  getValidationV2SortModeLabel,
  reduceValidationV2PresentationState,
} from '@/lib/validation-v2/resultPresentation';
import { composeFieldInformation } from '@/lib/validation-v2/registry/fieldInformation';
import ValidationV2RuleList from './ValidationV2RuleList';
import ValidationV2FieldInfoModal from './ValidationV2FieldInfoModal';

const EMPTY_RULE_RESULTS = Object.freeze([]);

function getVisibleExpansionKeys(ruleResults, geometryScope, options) {
  return getValidationV2PresentationRules(ruleResults, geometryScope, options)
    .map((presentation) => presentation.expansionKey);
}

function UnknownFields({ diagnostics }) {
  if (diagnostics.length === 0) return null;
  const unknownCount = diagnostics.filter(
    (diagnostic) => diagnostic.classification === 'UNKNOWN_SOURCE_FIELD',
  ).length;
  return (
    <details className="mt-2 border-t border-gray-200 pt-2 text-[11px]">
      <summary className="cursor-pointer font-medium text-gray-600">
        Andre felt i datasettet · {diagnostics.length}
      </summary>
      <div className="mt-1 text-gray-500">
        {unknownCount} ukjente · {diagnostics.length - unknownCount} kjente, men ikke støttede
      </div>
    </details>
  );
}

export default function ValidationV2Workspace() {
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore((state) => state.layerOrder);
  const expandedLayerId = useStore((state) => state.ui.expandedLayerId);
  const availableLayerIds = useMemo(
    () => layerOrder.filter((layerId) => layers[layerId]?.data),
    [layerOrder, layers],
  );
  const initialLayerId = availableLayerIds.includes(expandedLayerId)
    ? expandedLayerId
    : availableLayerIds[0] || '';
  const [controller] = useState(() =>
    createValidationV2ViewController(runGmiValidationV2)
  );
  const [requestedLayerId, setRequestedLayerId] = useState(initialLayerId);
  const [viewState, setViewState] = useState(() => controller.selectLayer(layers[initialLayerId]));
  const [runState, setRunState] = useState('idle');
  const [runTarget, setRunTarget] = useState(null);
  const [runError, setRunError] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [fieldInfoContext, setFieldInfoContext] = useState(null);
  const fieldInfoOpenerRef = useRef(null);
  const [presentationState, dispatchPresentation] = useReducer(
    reduceValidationV2PresentationState,
    undefined,
    createValidationV2PresentationState,
  );

  const selectedLayerId = availableLayerIds.includes(requestedLayerId)
    ? requestedLayerId
    : availableLayerIds[0] || '';
  const selectedLayer = layers[selectedLayerId];
  const selectedRevision = selectedLayer?.data
    ? getDatasetRevision(selectedLayer.data)
    : null;
  const isCurrentResult = isCurrentValidationV2Result(
    viewState.result,
    selectedLayerId,
    selectedRevision,
  );
  const isCurrentRun = isCurrentValidationV2Result(
    runTarget,
    selectedLayerId,
    selectedRevision,
  );
  const result = isCurrentResult ? viewState.result : null;
  const isGmi = isGmiLayer(selectedLayer);
  const pointCount = selectedLayer?.data?.points?.length || 0;
  const lineCount = selectedLayer?.data?.lines?.length || 0;
  const activeGeometry = viewState.geometryTab;
  const geometryView = result ? viewState.geometryView : null;
  const activeRuleResults = geometryView?.ruleResults || EMPTY_RULE_RESULTS;
  const geometrySummary = geometryView?.summary || null;
  const visibleRuleCount = result?.summary?.totalRules ?? getValidationRules().length;
  const searchPresentations = useMemo(
    () => getValidationV2PresentationRules(activeRuleResults, activeGeometry, {
      searchQuery: presentationState.searchQuery,
      statusFilter: ValidationV2StatusFilter.ALL,
      sortMode: presentationState.sortMode,
    }),
    [activeRuleResults, activeGeometry, presentationState.searchQuery, presentationState.sortMode],
  );
  const visiblePresentations = useMemo(
    () => getValidationV2PresentationRules(activeRuleResults, activeGeometry, presentationState),
    [activeRuleResults, activeGeometry, presentationState],
  );
  const attentionCount = searchPresentations.filter((presentation) =>
    presentation.status.enum !== 'MET'
  ).length;
  const filtersActive = presentationState.searchQuery !== '' ||
    presentationState.statusFilter !== ValidationV2StatusFilter.ALL;
  const presentationStateIsDefault = !filtersActive &&
    presentationState.sortMode === ValidationV2SortMode.ATTENTION;

  useEffect(() => {
    if (!filterPanelOpen && !openMenu) return undefined;
    const closeMenus = (event) => {
      if (!event.target.closest('[data-validation-v2-controls]')) {
        setFilterPanelOpen(false);
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setFilterPanelOpen(false);
        setOpenMenu(null);
      }
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterPanelOpen, openMenu]);

  const updateSearch = (event) => {
    const searchQuery = event.target.value;
    dispatchPresentation({
      type: 'SET_SEARCH',
      searchQuery,
      visibleExpansionKeys: getVisibleExpansionKeys(activeRuleResults, activeGeometry, {
        searchQuery,
        statusFilter: presentationState.statusFilter,
        sortMode: presentationState.sortMode,
      }),
    });
  };

  const updateStatusFilter = (event) => {
    const statusFilter = event.target.value;
    dispatchPresentation({
      type: 'SET_STATUS_FILTER',
      statusFilter,
      visibleExpansionKeys: getVisibleExpansionKeys(activeRuleResults, activeGeometry, {
        searchQuery: presentationState.searchQuery,
        statusFilter,
        sortMode: presentationState.sortMode,
      }),
    });
  };

  const chooseStatusFilter = (statusFilter) => {
    updateStatusFilter({ target: { value: statusFilter } });
  };

  const chooseSortMode = (sortMode) => {
    dispatchPresentation({ type: 'SET_SORT', sortMode });
    setOpenMenu(null);
  };

  const resetPresentation = () => {
    dispatchPresentation({ type: 'RESET_PRESENTATION' });
    setFilterPanelOpen(false);
    setOpenMenu(null);
  };

  const openFieldInfo = (presentation, opener) => {
    fieldInfoOpenerRef.current = opener;
    setFieldInfoContext({
      field: composeFieldInformation({
        canonicalFieldId: presentation.rule.canonicalFieldId,
        geometryScope: activeGeometry,
        rule: presentation.rule,
      }),
      rule: presentation.rule,
      geometryScope: activeGeometry,
    });
  };

  const closeFieldInfo = () => {
    setFieldInfoContext(null);
    requestAnimationFrame(() => fieldInfoOpenerRef.current?.focus());
  };

  const selectLayer = (event) => {
    const nextLayerId = event.target.value;
    const nextLayer = layers[nextLayerId];
    setRequestedLayerId(nextLayerId);
    setViewState(controller.selectLayer(nextLayer));
    setRunTarget(null);
    setRunState('idle');
    setRunError(false);
    setFieldInfoContext(null);
    dispatchPresentation({ type: 'LAYER_CHANGED' });
  };

  const runValidation = () => {
    const input = createValidationV2Input(selectedLayer);
    if (!input) return;
    setRunState('running');
    setRunError(false);
    setRunTarget({ layerId: input.layerId, datasetRevision: input.datasetRevision });
    setFieldInfoContext(null);
    dispatchPresentation({ type: 'NEW_RESULT' });
    try {
      setViewState(controller.run(input));
      setRunState('success');
    } catch (error) {
      console.error('Validator 2.0 beta could not run', error);
      setViewState(controller.clearResult());
      setRunState('error');
      setRunError(true);
    }
  };

  const selectGeometry = (scope) => {
    setFieldInfoContext(null);
    dispatchPresentation({ type: 'GEOMETRY_CHANGED' });
    setViewState(controller.selectGeometry(getValidationV2GeometrySelection(selectedLayer, scope)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="flex-none border-b bg-white px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">Validator 2.0</h2>
          <span className="text-[10px] font-medium text-blue-700">Beta · GMI · {visibleRuleCount} regler</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-gray-700" htmlFor="validation-v2-layer">Lag</label>
          <select
            id="validation-v2-layer"
            value={selectedLayerId}
            onChange={selectLayer}
            disabled={availableLayerIds.length === 0}
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableLayerIds.length === 0 && <option value="">Ingen lag tilgjengelig</option>}
            {availableLayerIds.map((layerId) => (
              <option key={layerId} value={layerId}>{layers[layerId].name || layerId}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={runValidation}
            disabled={!isGmi || (runState === 'running' && isCurrentRun)}
            className="shrink-0 rounded border border-blue-700 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runState === 'running' && isCurrentRun ? 'Validerer ...' : 'Kjør'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!selectedLayer && <p className="text-xs text-gray-600">Velg et lag for å starte.</p>}
        {selectedLayer && !isGmi && (
          <p className="text-xs text-gray-700">Validator 2.0 beta støtter foreløpig GMI-data.</p>
        )}
        {selectedLayer && isGmi && (
          <>
            <div className="flex border-b border-gray-200" role="tablist" aria-label="Geometri">
              {[
                ['point', 'Punkter', pointCount],
                ['line', 'Ledninger', lineCount],
              ].map(([scope, label, count]) => (
                <button
                  key={scope}
                  type="button"
                  role="tab"
                  aria-selected={activeGeometry === scope}
                  aria-controls="validation-v2-geometry-panel"
                  onClick={() => selectGeometry(scope)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium ${activeGeometry === scope ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {label} {count}
                </button>
              ))}
            </div>

            {!result && (
              <p className="py-3 text-[11px] text-gray-500">
                Velg geometri og kjør kontrollen for å se resultatene.
              </p>
            )}
            {result && geometrySummary && (
              <div id="validation-v2-geometry-panel" role="tabpanel" className="py-2 text-[11px] text-gray-600">
                <div className="mb-2">
                  {geometrySummary.objectCount} {activeGeometry === 'point' ? 'punkter' : 'ledninger'} · {geometrySummary.failCount} må rettes · {geometrySummary.indeterminateCount} må vurderes
                </div>
                <div className="relative mb-2" data-validation-v2-controls>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-expanded={filterPanelOpen}
                      aria-controls="validation-v2-filter-panel"
                      aria-label={filterPanelOpen ? 'Lukk filtre' : 'Åpne filtre'}
                      title={filterPanelOpen ? 'Lukk filtre' : 'Åpne filtre'}
                      onClick={() => {
                        setFilterPanelOpen((open) => !open);
                        setOpenMenu(null);
                      }}
                      className={`relative inline-flex h-8 w-8 items-center justify-center rounded border text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${filtersActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                    >
                      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M3 4h14v2H3V4Zm3 5h8v2H6V9Zm3 5h2v2H9v-2Z" />
                      </svg>
                      {filtersActive && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-600" />}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        aria-expanded={openMenu === 'sort'}
                        aria-controls="validation-v2-sort-menu"
                        aria-label={`Sorter: ${getValidationV2SortModeLabel(presentationState.sortMode)}`}
                        title={`Sorter: ${getValidationV2SortModeLabel(presentationState.sortMode)}`}
                        onClick={() => {
                          setOpenMenu((menu) => menu === 'sort' ? null : 'sort');
                          setFilterPanelOpen(false);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M5 3h2v14H5V3Zm4 0h2v14H9V3Zm4 0h2v14h-2V3ZM3 5h6v2H3V5Zm4 4h6v2H7V9Zm3 4h7v2h-7v-2Z" />
                        </svg>
                      </button>
                      {openMenu === 'sort' && (
                        <div id="validation-v2-sort-menu" role="menu" className="absolute right-0 z-20 mt-1 min-w-52 rounded border border-gray-200 bg-white p-1 shadow-lg">
                          {[
                            [ValidationV2SortMode.ATTENTION, 'Status – krever oppmerksomhet'],
                            [ValidationV2SortMode.NAME_ASC, 'Navn A–Å'],
                            [ValidationV2SortMode.NAME_DESC, 'Navn Å–A'],
                            [ValidationV2SortMode.REGISTRY, 'Instruksrekkefølge'],
                          ].map(([sortMode, label]) => (
                            <button
                              key={sortMode}
                              type="button"
                              role="menuitemradio"
                              aria-checked={presentationState.sortMode === sortMode}
                              onClick={() => chooseSortMode(sortMode)}
                              className="block min-h-9 w-full rounded px-2 text-left text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Nullstill filter og sortering"
                      title="Nullstill filter og sortering"
                      disabled={presentationStateIsDefault}
                      onClick={resetPresentation}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default disabled:opacity-40"
                    >
                      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4 4h4v2H6.4a5 5 0 1 1-.65 6H3.6A7 7 0 1 0 4 4Zm0 0V2l-3 3 3 3V6h2V4H4Z" />
                      </svg>
                    </button>
                  </div>
                  {filterPanelOpen && (
                    <div id="validation-v2-filter-panel" className="mt-1 rounded border border-gray-200 bg-white p-1.5 shadow-sm">
                      <label className="block">
                        <span className="sr-only">Søk i kontroller</span>
                        <input
                          type="search"
                          value={presentationState.searchQuery}
                          onChange={updateSearch}
                          placeholder="Søk i kontroller"
                          aria-label="Søk i kontroller"
                          className="min-h-9 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </label>
                      <div className="mt-1 grid grid-cols-2 gap-1" role="group" aria-label="Statusfilter">
                        {[
                          [ValidationV2StatusFilter.ALL, `Alle ${searchPresentations.length}`],
                          [ValidationV2StatusFilter.ATTENTION, `Krever oppmerksomhet ${attentionCount}`],
                          [ValidationV2StatusFilter.NOT_MET, 'Ikke oppfylt'],
                          [ValidationV2StatusFilter.PARTIALLY_MET, 'Delvis oppfylt'],
                          [ValidationV2StatusFilter.MET, 'Oppfylt'],
                        ].map(([filter, label]) => (
                          <button
                            key={filter}
                            type="button"
                            aria-pressed={presentationState.statusFilter === filter}
                            onClick={() => chooseStatusFilter(filter)}
                            className={`min-h-8 rounded px-1.5 text-left text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${presentationState.statusFilter === filter ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <ValidationV2RuleList
                  presentations={visiblePresentations}
                  expandedRuleKey={presentationState.expandedRuleKey}
                  onToggle={(expansionKey) => dispatchPresentation({ type: 'TOGGLE_RULE', expansionKey })}
                  onInfo={openFieldInfo}
                />
                <UnknownFields diagnostics={result.sourceFieldDiagnostics} />
              </div>
            )}
            {runError && isCurrentRun && (
              <div className="mt-2 border-t border-red-200 pt-2 text-xs text-red-800">
                Validator 2.0 kunne ikke kjøres for dette laget. Prøv å laste inn datasettet på nytt, eller bruk Validator 1.0.
              </div>
            )}
          </>
        )}
      </div>
      {fieldInfoContext && (
        <ValidationV2FieldInfoModal
          key={`${fieldInfoContext.geometryScope}:${fieldInfoContext.rule.ruleId}`}
          isOpen
          field={fieldInfoContext.field}
          rule={fieldInfoContext.rule}
          geometryScope={fieldInfoContext.geometryScope}
          layerId={selectedLayerId}
          dataset={selectedLayer?.data}
          result={result}
          onClose={closeFieldInfo}
        />
      )}
    </div>
  );
}
