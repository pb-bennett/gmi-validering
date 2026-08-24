'use client';

import { useMemo, useState } from 'react';
import useStore from '@/lib/store';
import { runGmiValidationV2 } from '@/lib/validation-v2';
import { getValidationRules } from '@/lib/validation-v2/registry/rules';
import { getDatasetRevision } from '@/lib/validation-v2/datasetRevision';
import { createValidationV2ViewController } from '@/lib/validation-v2/validationViewController';
import {
  createValidationV2Input,
  getValidationV2GeometryRuleStatus,
  getValidationV2ObjectLabel,
  getValidationV2GeometrySelection,
  groupValidationV2Findings,
  isCurrentValidationV2Result,
  isGmiLayer,
} from '@/lib/validation-v2/uiIntegration';

const MAX_VISIBLE_GROUP_OBJECTS = 15;

const REASON_LABELS = Object.freeze({
  REQUIRED_FIELD_ABSENT: 'Feltet mangler i datasettet',
  REQUIRED_VALUE_MISSING: 'Verdi mangler på objektet',
  VALUE_NOT_ALLOWED: 'Verdien er ikke tillatt',
  BINDING_AMBIGUOUS: 'Feltkoblingen er tvetydig',
  UNRESOLVED_SOURCE: 'Feltkilden kan ikke tolkes sikkert',
  SCHEMA_UNAVAILABLE: 'Feltstrukturen kunne ikke fastslås',
  TEMA_CONFLICT: 'Tema-kilder inneholder motstridende verdier',
});

function getReasonLabel(reasonCode) {
  return REASON_LABELS[reasonCode] || 'Ukjent kontrollårsak';
}

function formatPrimitive(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

function getGroupTitle(group) {
  if (group.reasonCode === 'VALUE_NOT_ALLOWED' && group.observedValue !== null) {
    return `Ugyldig verdi: ${formatPrimitive(group.observedValue)}`;
  }
  return getReasonLabel(group.reasonCode);
}

function getGroupObservedText(group) {
  if (group.reasonCode !== 'TEMA_CONFLICT') return null;
  const values = (group.findings[0]?.observed?.conflicts || [])
    .map((conflict) => conflict.rawValue)
    .filter((value) => value !== undefined)
    .map(formatPrimitive);
  return values.length > 0 ? `Observerte verdier: ${values.join(', ')}` : null;
}

function FindingGroups({ findings, geometryScope }) {
  const groups = useMemo(
    () => groupValidationV2Findings(findings, geometryScope),
    [findings, geometryScope],
  );
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  if (groups.length === 0) {
    return (
      <p className="px-2 pb-2 text-[11px] text-gray-500">
        Ingen objekter å vise.
      </p>
    );
  }

  const objectLabel = geometryScope === 'point' ? 'Berørte punkter' : 'Berørte ledninger';
  return (
    <div className="space-y-2 px-2 pb-2">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.key);
        const visibleFindings = isExpanded
          ? group.findings
          : group.findings.slice(0, MAX_VISIBLE_GROUP_OBJECTS);
        const expectedValues = group.findings[0]?.expectedValues;
        const observedText = getGroupObservedText(group);
        return (
          <div key={group.key} className="border-t border-gray-100 pt-2 text-[11px]">
            <div className="font-medium text-gray-800">
              {getGroupTitle(group)} <span className="text-gray-500">({group.findings.length} objekter)</span>
            </div>
            <div className="mt-1 text-gray-500">
              {objectLabel}: {visibleFindings.map((finding) => (
                <span key={finding.objectRef.key} className="mr-1 inline-block">
                  {finding.objectRef.sourceIndex + 1}
                </span>
              ))}
              {visibleFindings.length < group.findings.length && <span>...</span>}
            </div>
            {expectedValues?.length > 0 && (
              <div className="mt-1 text-gray-500">Forventet: {expectedValues.join(', ')}</div>
            )}
            {observedText && <div className="mt-1 text-gray-500">{observedText}</div>}
            {group.findings.length > MAX_VISIBLE_GROUP_OBJECTS && (
              <button
                type="button"
                onClick={() => setExpandedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })}
                className="mt-1 font-medium text-blue-700 hover:underline"
              >
                {isExpanded ? 'Vis færre' : `Vis alle ${group.findings.length}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RuleResultList({ ruleResults, geometryScope, expandedRuleId, onToggle }) {
  return (
    <div className="space-y-1">
      {ruleResults.map((ruleResult) => {
        const counts = ruleResult.geometryBreakdown[geometryScope];
        const status = getValidationV2GeometryRuleStatus(ruleResult, geometryScope);
        const isExpanded = expandedRuleId === ruleResult.rule.ruleId;
        return (
          <div key={ruleResult.rule.ruleId} className="overflow-hidden border-b border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => onToggle(ruleResult.rule.ruleId)}
              aria-expanded={isExpanded}
              className="w-full px-2 py-2 text-left hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-gray-900">{ruleResult.rule.title}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                {counts.passCount} bestått · {counts.failCount} må rettes · {counts.indeterminateCount} må vurderes · {counts.notEvaluatedCount} ikke kontrollert
              </div>
            </button>
            {isExpanded && (
              <FindingGroups
                findings={ruleResult.findings}
                geometryScope={geometryScope}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [expandedRuleId, setExpandedRuleId] = useState(null);

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
  const activeRuleResults = geometryView?.ruleResults || [];
  const geometrySummary = geometryView?.summary || null;
  const visibleRuleCount = result?.summary?.totalRules ?? getValidationRules().length;

  const selectLayer = (event) => {
    const nextLayerId = event.target.value;
    const nextLayer = layers[nextLayerId];
    setRequestedLayerId(nextLayerId);
    setViewState(controller.selectLayer(nextLayer));
    setRunTarget(null);
    setRunState('idle');
    setRunError(false);
    setExpandedRuleId(null);
  };

  const runValidation = () => {
    const input = createValidationV2Input(selectedLayer);
    if (!input) return;
    setRunState('running');
    setRunError(false);
    setRunTarget({ layerId: input.layerId, datasetRevision: input.datasetRevision });
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
                  onClick={() => setViewState(controller.selectGeometry(getValidationV2GeometrySelection(selectedLayer, scope)))}
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
                {geometrySummary.objectCount} {activeGeometry === 'point' ? 'punkter' : 'ledninger'} · {geometrySummary.failCount} må rettes · {geometrySummary.indeterminateCount} må vurderes
                <RuleResultList
                  ruleResults={activeRuleResults}
                  geometryScope={activeGeometry}
                  expandedRuleId={expandedRuleId}
                  onToggle={(ruleId) => setExpandedRuleId((current) => (current === ruleId ? null : ruleId))}
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
    </div>
  );
}
