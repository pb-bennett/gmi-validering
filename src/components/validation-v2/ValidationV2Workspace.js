'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, FunnelIcon, ArrowsDownUpIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { runGmiValidationV2 } from '@/lib/validation-v2';
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
import { getValidationV2DiagnosticPresentation } from '@/lib/validation-v2/diagnostics';
import { buildValidatorFieldInspectionRequest } from '@/lib/validation-v2/tableInspection';
import ValidationV2RuleList from './ValidationV2RuleList';
import ValidationV2FieldInfoModal from './ValidationV2FieldInfoModal';
import ValidationV2FieldInspector from './ValidationV2FieldInspector';

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
    <details className="mt-2 border-t border-gmi-border pt-2 text-[11px]">
      <summary className="cursor-pointer font-medium text-gmi-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive">
        Andre felt i datasettet · {diagnostics.length}
      </summary>
      <div className="mt-1 text-gmi-text-subtle">
        {unknownCount} ukjente · {diagnostics.length - unknownCount} kjente, men ikke støttede
      </div>
    </details>
  );
}

export default function ValidationV2Workspace({ sidebarWidth, canDockInspector, onDockedInspectorChange }) {
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore((state) => state.layerOrder);
  const toggleFieldValidation = useStore((state) => state.toggleFieldValidation);
  const openObjectTable = useStore((state) => state.openObjectTable);
  const closeValidatorOwnedObjectTable = useStore((state) => state.closeValidatorOwnedObjectTable);
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
  const [selectedValidatorField, setSelectedValidatorField] = useState(null);
  const [activeFieldTab, setActiveFieldTab] = useState('result');
  const [inspectorHost, setInspectorHost] = useState(null);
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
  const workspaceIdentity = JSON.stringify({
    layer: selectedLayerId,
    geometry: activeGeometry,
    revision: selectedRevision,
  });
  const dockedInspectorVisible = Boolean(
    canDockInspector && inspectorHost && selectedValidatorField &&
    selectedValidatorField.layerId === selectedLayerId &&
    selectedValidatorField.datasetRevision === selectedRevision &&
    selectedValidatorField.geometryScope === activeGeometry
  );
  const previousWorkspaceIdentityRef = useRef(workspaceIdentity);
  const geometryView = result ? viewState.geometryView : null;
  const activeRuleResults = geometryView?.ruleResults || EMPTY_RULE_RESULTS;
  const geometrySummary = geometryView?.summary || null;
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
    presentation.status.enum !== 'PASS'
  ).length;
  const filtersActive = presentationState.searchQuery !== '' ||
    presentationState.statusFilter !== ValidationV2StatusFilter.ALL;
  const presentationStateIsDefault = !filtersActive &&
    presentationState.sortMode === ValidationV2SortMode.ATTENTION;

  useEffect(() => {
    setInspectorHost(document.getElementById('validation-v2-field-inspector-root'));
  }, []);

  useEffect(() => {
    onDockedInspectorChange?.(dockedInspectorVisible);
    return () => onDockedInspectorChange?.(false);
  }, [dockedInspectorVisible, onDockedInspectorChange]);

  useEffect(() => {
    if (previousWorkspaceIdentityRef.current === workspaceIdentity) return;
    previousWorkspaceIdentityRef.current = workspaceIdentity;
    setSelectedValidatorField(null);
    setActiveFieldTab('result');
  }, [workspaceIdentity]);

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
    setSelectedValidatorField({
      field: composeFieldInformation({
        canonicalFieldId: presentation.rule.canonicalFieldId,
        geometryScope: activeGeometry,
        rule: presentation.rule,
      }),
      rule: presentation.rule,
      rules: presentation.rules,
      geometryScope: activeGeometry,
      layerId: selectedLayerId,
      datasetRevision: selectedRevision,
    });
  };

  const closeFieldInspector = () => {
    setSelectedValidatorField(null);
    requestAnimationFrame(() => fieldInfoOpenerRef.current?.focus());
  };

  const closeValidator = () => {
    closeValidatorOwnedObjectTable();
    toggleFieldValidation(false);
  };

  const openDiagnosticObjects = useCallback((diagnostic) => {
    if (!diagnostic?.hasCompleteExactObjectRefs || !selectedLayerId || !selectedRevision || !selectedValidatorField || !result) return;
    const geometryScope = diagnostic.field.geometryScope;
    const objects = geometryScope === 'point' ? selectedLayer?.data?.points : selectedLayer?.data?.lines;
    const inspectionRequest = buildValidatorFieldInspectionRequest({
      layerId: selectedLayerId,
      datasetRevision: selectedRevision,
      geometryScope,
      objects,
      rules: selectedValidatorField.rules,
      result,
      diagnostic,
      fieldLabel: diagnostic.field.displayName,
    });
    if (!inspectionRequest) return;
    openObjectTable({
      ...inspectionRequest,
      context: {
        title: diagnostic.field.displayName,
        reason: getValidationV2DiagnosticPresentation(diagnostic).summary,
        status: diagnostic.state,
        source: 'validation-v2-diagnostic',
      },
    });
  }, [openObjectTable, selectedLayerId, selectedRevision, selectedValidatorField, result, selectedLayer]);

  const selectLayer = (event) => {
    const nextLayerId = event.target.value;
    const nextLayer = layers[nextLayerId];
    setRequestedLayerId(nextLayerId);
    setViewState(controller.selectLayer(nextLayer));
    setRunTarget(null);
    setRunState('idle');
    setRunError(false);
    setSelectedValidatorField(null);
    setActiveFieldTab('result');
    dispatchPresentation({ type: 'LAYER_CHANGED' });
  };

  const runValidation = () => {
    const input = createValidationV2Input(selectedLayer);
    if (!input) return;
    setRunState('running');
    setRunError(false);
    setRunTarget({ layerId: input.layerId, datasetRevision: input.datasetRevision });
    setSelectedValidatorField(null);
    setActiveFieldTab('result');
    dispatchPresentation({ type: 'NEW_RESULT' });
    try {
      setViewState(controller.run(input));
      setRunState('success');
    } catch (error) {
      console.error('Validator could not run', error);
      setViewState(controller.clearResult());
      setRunState('error');
      setRunError(true);
    }
  };

  // Validation is derived from the selected layer and its immutable dataset
  // revision. Presentation-only changes do not participate in this effect.
  useEffect(() => {
    if (!selectedLayer || !isGmi) return;
    setViewState(controller.selectLayer(selectedLayer));
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerId, selectedRevision, isGmi]);

  const selectGeometry = (scope) => {
    setSelectedValidatorField(null);
    setActiveFieldTab('result');
    dispatchPresentation({ type: 'GEOMETRY_CHANGED' });
    setViewState(controller.selectGeometry(getValidationV2GeometrySelection(selectedLayer, scope)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gmi-surface-soft">
      <div className="flex-none border-b border-gmi-border bg-gmi-surface px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gmi-navy">Validator</h2>
          <button
            type="button"
            onClick={closeValidator}
            aria-label="Lukk Validator"
            title="Lukk Validator"
            className="gmi-compact-button gmi-focus-ring inline-flex h-8 w-8 items-center justify-center text-gmi-text-muted hover:text-gmi-navy"
          >
            <XIcon aria-hidden="true" size={18} weight="regular" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-gmi-text" htmlFor="validation-v2-layer">Lag</label>
          <select
            id="validation-v2-layer"
            value={selectedLayerId}
            onChange={selectLayer}
            disabled={availableLayerIds.length === 0}
            className="gmi-compact-field min-w-0 flex-1 px-1.5 py-1 text-xs disabled:cursor-default disabled:opacity-60"
          >
            {availableLayerIds.length === 0 && <option value="">Ingen lag tilgjengelig</option>}
            {availableLayerIds.map((layerId) => (
              <option key={layerId} value={layerId}>{layers[layerId].name || layerId}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!selectedLayer && <p className="text-xs text-gmi-text-muted">Velg et lag for å starte.</p>}
        {selectedLayer && !isGmi && (
          <p className="text-xs text-gmi-text">Validator støtter foreløpig bare GMI-data.</p>
        )}
        {selectedLayer && isGmi && (
          <>
            <div className="flex gap-1 border-b border-gmi-border" role="tablist" aria-label="Geometri">
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
                  className={`gmi-compact-button gmi-focus-ring flex-1 px-2 py-1.5 text-xs font-medium ${activeGeometry === scope ? 'gmi-selected-control' : 'text-gmi-text-subtle hover:text-gmi-navy'}`}
                >
                  {label} {count}
                </button>
              ))}
            </div>

            {!result && (
              <p className="py-3 text-[11px] text-gmi-text-subtle">
                Kontrollerer…
              </p>
            )}
            {result && geometrySummary && (
              <div id="validation-v2-geometry-panel" role="tabpanel" className="py-2 text-[11px] text-gmi-text-muted">
                <div className="mb-2">
                  {geometrySummary.objectCount} {activeGeometry === 'point' ? 'punkter' : 'ledninger'} · {geometrySummary.failCount} feil · {(geometrySummary.checkCount || 0) + geometrySummary.indeterminateCount} sjekk
                </div>
                {geometryView.schemaFindings.some((finding) => finding.reasonCode === 'SCHEMA_TEMA_SFCODE_COEXISTENCE') && (
                  <div role="status" className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                    <strong>Sjekk:</strong> Både Tema og S_FCODE finnes i skjemaet. Feltene beskriver samme identitet, og sameksistensen bør kontrolleres.
                  </div>
                )}
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
                      className={`gmi-compact-button gmi-focus-ring relative inline-flex h-8 w-8 items-center justify-center border ${filtersActive ? 'gmi-selected-control' : 'gmi-elevated-surface'}`}
                    >
                      <FunnelIcon aria-hidden="true" size={16} weight="regular" />
                      {filtersActive && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gmi-interactive" />}
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
                        className="gmi-elevated-surface gmi-compact-button gmi-focus-ring inline-flex h-8 w-8 items-center justify-center"
                      >
                        <ArrowsDownUpIcon aria-hidden="true" size={16} weight="regular" />
                      </button>
                      {openMenu === 'sort' && (
                        <div id="validation-v2-sort-menu" role="menu" className="gmi-elevated-surface absolute right-0 z-20 mt-1 min-w-52 rounded-lg p-1 shadow-lg">
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
                              className={`gmi-compact-button gmi-focus-ring block min-h-9 w-full px-2 text-left text-xs ${presentationState.sortMode === sortMode ? 'gmi-selected-control font-semibold' : 'text-gmi-text'}`}
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
                      className="gmi-elevated-surface gmi-compact-button gmi-focus-ring inline-flex h-8 w-8 items-center justify-center disabled:cursor-default disabled:opacity-40"
                    >
                      <ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="regular" />
                    </button>
                  </div>
                  {filterPanelOpen && (
                    <div id="validation-v2-filter-panel" className="gmi-elevated-surface mt-1 rounded-lg p-1.5">
                      <label className="block">
                        <span className="sr-only">Søk i kontroller</span>
                        <input
                          type="search"
                          value={presentationState.searchQuery}
                          onChange={updateSearch}
                          placeholder="Søk i kontroller"
                          aria-label="Søk i kontroller"
                          className="gmi-compact-field min-h-9 w-full px-2 text-xs placeholder:text-gmi-text-subtle"
                        />
                      </label>
                      <div className="mt-1 grid grid-cols-2 gap-1" role="group" aria-label="Statusfilter">
                        {[
                          [ValidationV2StatusFilter.ALL, `Alle ${searchPresentations.length}`],
                          [ValidationV2StatusFilter.ATTENTION, `Krever oppmerksomhet ${attentionCount}`],
                          [ValidationV2StatusFilter.FAIL, 'Feil'],
                          [ValidationV2StatusFilter.CHECK, 'Sjekk'],
                          [ValidationV2StatusFilter.PASS, 'Pass'],
                        ].map(([filter, label]) => (
                          <button
                            key={filter}
                            type="button"
                            aria-pressed={presentationState.statusFilter === filter}
                            onClick={() => chooseStatusFilter(filter)}
                            className={`gmi-compact-button gmi-focus-ring min-h-8 min-w-0 px-1.5 text-left text-[11px] ${presentationState.statusFilter === filter ? 'gmi-selected-control font-semibold' : 'text-gmi-text'}`}
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
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-800 shadow-sm">
                Validator kunne ikke kjøres for dette laget. Prøv å laste inn datasettet på nytt.
              </div>
            )}
          </>
        )}
      </div>
      {selectedValidatorField &&
        selectedValidatorField.layerId === selectedLayerId &&
        selectedValidatorField.datasetRevision === selectedRevision &&
        selectedValidatorField.geometryScope === activeGeometry && (
          canDockInspector ? (
            inspectorHost && createPortal(
              <ValidationV2FieldInspector
                field={selectedValidatorField.field}
                rule={selectedValidatorField.rule}
                rules={selectedValidatorField.rules}
                geometryScope={selectedValidatorField.geometryScope}
                layerId={selectedValidatorField.layerId}
                dataset={selectedLayer?.data}
                result={result}
                activeTab={activeFieldTab}
                onTabChange={setActiveFieldTab}
                onOpenObjects={openDiagnosticObjects}
                onClose={closeFieldInspector}
              />,
              inspectorHost,
            )
          ) : (
            <ValidationV2FieldInfoModal
              isOpen
              field={selectedValidatorField.field}
              rule={selectedValidatorField.rule}
              rules={selectedValidatorField.rules}
              geometryScope={selectedValidatorField.geometryScope}
              layerId={selectedValidatorField.layerId}
              dataset={selectedLayer?.data}
              result={result}
              activeTab={activeFieldTab}
              onTabChange={setActiveFieldTab}
              onOpenObjects={openDiagnosticObjects}
              onClose={closeFieldInspector}
            />
          )
        )}
    </div>
  );
}
