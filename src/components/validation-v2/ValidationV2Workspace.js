'use client';

import { useMemo, useState } from 'react';
import useStore from '@/lib/store';
import { runGmiValidationV2 } from '@/lib/validation-v2';
import { getDatasetRevision } from '@/lib/validation-v2/datasetRevision';
import {
  createValidationV2Input,
  getValidationV2ObjectLabel,
  getValidationV2RuleStatus,
  isCurrentValidationV2Result,
  isGmiLayer,
} from '@/lib/validation-v2/uiIntegration';

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

function getObservedText(finding) {
  const observed = finding.observed || {};
  const values = [];
  if (Object.prototype.hasOwnProperty.call(observed, 'sourceValue')) {
    values.push(`Observert: ${String(observed.sourceValue)}`);
  }
  if (Object.prototype.hasOwnProperty.call(observed, 'resolvedValue')) {
    values.push(`Observert: ${String(observed.resolvedValue)}`);
  }
  if (Array.isArray(observed.conflicts) && observed.conflicts.length > 0) {
    const conflictValues = observed.conflicts
      .map((conflict) => conflict.rawValue)
      .filter((value) => value !== undefined)
      .map((value) => String(value));
    if (conflictValues.length > 0) {
      values.push(`Observerte verdier: ${conflictValues.join(', ')}`);
    }
  }
  return values;
}

function RuleFindings({ findings }) {
  if (findings.length === 0) {
    return (
      <p className="px-3 pb-3 text-xs text-gray-500">
        Ingen objekter å vise for denne kontrollen.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-3 pb-3">
      {findings.map((finding) => {
        const observedText = getObservedText(finding);
        return (
          <div
            key={`${finding.ruleId}-${finding.objectRef.key}`}
            className="rounded border border-gray-200 bg-white p-2 text-xs"
          >
            <div className="font-medium text-gray-800">
              {getValidationV2ObjectLabel(finding.objectRef)}
            </div>
            <div className="mt-1 text-gray-600">
              {getReasonLabel(finding.reasonCode)}
            </div>
            {finding.expectedValues?.length > 0 && (
              <div className="mt-1 text-gray-500">
                Forventet: {finding.expectedValues.join(', ')}
              </div>
            )}
            {observedText.map((text) => (
              <div key={text} className="mt-1 text-gray-500">
                {text}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RuleResultList({ ruleResults, expandedRuleId, onToggle }) {
  return (
    <div className="space-y-2">
      {ruleResults.map((ruleResult) => {
        const status = getValidationV2RuleStatus(ruleResult);
        const isExpanded = expandedRuleId === ruleResult.rule.ruleId;
        return (
          <div key={ruleResult.rule.ruleId} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => onToggle(ruleResult.rule.ruleId)}
              aria-expanded={isExpanded}
              className="w-full p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-gray-900">{ruleResult.rule.title}</span>
                <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {ruleResult.passCount} bestått · {ruleResult.failCount} må rettes ·{' '}
                {ruleResult.indeterminateCount} må vurderes · {ruleResult.notEvaluatedCount} ikke kontrollert
              </div>
            </button>
            {isExpanded && <RuleFindings findings={ruleResult.findings} />}
          </div>
        );
      })}
    </div>
  );
}

function UnknownFields({ diagnostics }) {
  const unknownCount = diagnostics.filter(
    (diagnostic) => diagnostic.classification === 'UNKNOWN_SOURCE_FIELD',
  ).length;
  const unsupportedCount = diagnostics.length - unknownCount;
  if (diagnostics.length === 0) return null;

  return (
    <details className="rounded-lg border border-gray-200 bg-white text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-gray-700">
        Andre felt i datasettet ({diagnostics.length})
      </summary>
      <div className="space-y-1 border-t border-gray-100 px-3 py-2 text-gray-600">
        <div>{unknownCount} ukjente felt</div>
        <div>{unsupportedCount} kjente, men ikke støttede feltnavn</div>
      </div>
    </details>
  );
}

function Summary({ result, layerName }) {
  const cards = [
    ['Lag', layerName],
    ['Aktive regler', result.summary.totalRules],
    ['Må rettes', result.summary.failFindingCount],
    ['Må vurderes', result.summary.indeterminateFindingCount],
    ['Punkter', result.summary.evaluatedPointCount],
    ['Ledninger', result.summary.evaluatedLineCount],
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="text-[11px] text-gray-500">{label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</div>
        </div>
      ))}
    </div>
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
  const [requestedLayerId, setRequestedLayerId] = useState(initialLayerId);
  const [runState, setRunState] = useState('idle');
  const [runResult, setRunResult] = useState(null);
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
    runResult,
    selectedLayerId,
    selectedRevision,
  );
  const isCurrentRun = isCurrentValidationV2Result(
    runTarget,
    selectedLayerId,
    selectedRevision,
  );
  const result = isCurrentResult ? runResult : null;
  const isGmi = isGmiLayer(selectedLayer);

  const selectLayer = (event) => {
    setRequestedLayerId(event.target.value);
    setRunResult(null);
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
    setRunTarget({
      layerId: input.layerId,
      datasetRevision: input.datasetRevision,
    });
    try {
      const nextResult = runGmiValidationV2(input);
      setRunResult(nextResult);
      setRunState('success');
    } catch (error) {
      console.error('Validator 2.0 beta could not run', error);
      setRunResult(null);
      setRunState('error');
      setRunError(true);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="flex-none border-b bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Validator 2.0</h2>
            <p className="mt-1 text-xs font-medium text-blue-700">Beta - begrenset regeldekning</p>
          </div>
          <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">GMI</span>
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Foreløpig kontrolleres 4 regler basert på Innmålingsinstruksen.
        </p>
        <label className="mt-3 block text-xs font-medium text-gray-700" htmlFor="validation-v2-layer">
          Lag som kontrolleres
        </label>
        <select
          id="validation-v2-layer"
          value={selectedLayerId}
          onChange={selectLayer}
          className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={availableLayerIds.length === 0}
        >
          {availableLayerIds.length === 0 && <option value="">Ingen lag tilgjengelig</option>}
          {availableLayerIds.map((layerId) => (
            <option key={layerId} value={layerId}>
              {layers[layerId].name || layerId}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedLayer && (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
            Velg et lag for å starte beta-kontrollen.
          </p>
        )}
        {selectedLayer && !isGmi && (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            Validator 2.0 beta støtter foreløpig GMI-data.
          </p>
        )}
        {selectedLayer && isGmi && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={runValidation}
              disabled={runState === 'running' && isCurrentRun}
              className="w-full rounded border border-blue-700 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
            >
              {runState === 'running' && isCurrentRun ? 'Validerer ...' : 'Kjør Validator 2.0'}
            </button>

            {runError && isCurrentRun && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-medium">Validator 2.0 kunne ikke kjøres for dette laget.</div>
                <div className="mt-1 text-xs text-red-700">Prøv å laste inn datasettet på nytt, eller bruk dagens validator.</div>
              </div>
            )}

            {result && (
              <>
                <Summary result={result} layerName={selectedLayer.name || selectedLayer.id} />
                <RuleResultList
                  ruleResults={result.ruleResults}
                  expandedRuleId={expandedRuleId}
                  onToggle={(ruleId) => setExpandedRuleId((current) => (current === ruleId ? null : ruleId))}
                />
                <UnknownFields diagnostics={result.sourceFieldDiagnostics} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
