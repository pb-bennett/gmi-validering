'use client';

import React, { useMemo, useState, useEffect } from 'react';
import useStore from '@/lib/store';
import fieldsData from '@/data/fields.json';
import { analyzeIncline } from '@/lib/analysis/incline';
import { analyzeZValues } from '@/lib/analysis/zValidation';
import { analyzeTopplok } from '@/lib/analysis/topplok';
import { detectOutliers } from '@/lib/analysis/outliers';
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CornersOutIcon,
  TableIcon,
  TrashIcon,
} from '@phosphor-icons/react';

const MISSING_TEMA_VALUE = '(Ingen verdi)';

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
 * Collapsible section for Tema filtering within a layer
 */
function LayerTemaSection({
  layerId,
  layer,
  codeLookups,
  isOpen,
  onToggle,
}) {
  const setHighlightedCode = useStore(
    (state) => state.setHighlightedCode,
  );
  const setHighlightedType = useStore(
    (state) => state.setHighlightedType,
  );
  const toggleLayerHiddenCode = useStore(
    (state) => state.toggleLayerHiddenCode,
  );
  const toggleLayerHiddenType = useStore(
    (state) => state.toggleLayerHiddenType,
  );

  const data = layer?.data;
  const hiddenCodes = layer?.hiddenCodes || [];
  const hiddenTypes = layer?.hiddenTypes || [];

  // Calculate tema stats for this layer
  const temaStats = useMemo(() => {
    if (!data) return { points: {}, lines: {} };

    const stats = { points: {}, lines: {} };

    data.points?.forEach((p) => {
      const rawCode = p.attributes?.S_FCODE;
      const code =
        rawCode === null || rawCode === undefined || rawCode === ''
          ? MISSING_TEMA_VALUE
          : String(rawCode);
      if (!stats.points[code])
        stats.points[code] = { count: 0, types: {} };
      stats.points[code].count++;
      const typeVal = p.attributes?.Type || '(Mangler Type)';
      stats.points[code].types[typeVal] =
        (stats.points[code].types[typeVal] || 0) + 1;
    });

    data.lines?.forEach((l) => {
      const rawCode = l.attributes?.S_FCODE;
      const code =
        rawCode === null || rawCode === undefined || rawCode === ''
          ? MISSING_TEMA_VALUE
          : String(rawCode);
      if (!stats.lines[code])
        stats.lines[code] = { count: 0, types: {} };
      stats.lines[code].count++;
      const typeVal = l.attributes?.Type || '(Mangler Type)';
      stats.lines[code].types[typeVal] =
        (stats.lines[code].types[typeVal] || 0) + 1;
    });

    return stats;
  }, [data]);

  const pointCount = Object.keys(temaStats.points).length;
  const lineCount = Object.keys(temaStats.lines).length;
  const totalHidden = hiddenCodes.length;

  return (
    <div className="border-b border-gmi-border last:border-0">
      <button
        onClick={onToggle}
        className="gmi-focus-ring flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-gmi-surface-soft"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gmi-text">
            Tema
          </span>
          <span className="text-[10px] text-gmi-text-subtle">
            {pointCount} punkt, {lineCount} linje
          </span>
          {totalHidden > 0 && (
            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
              {totalHidden} skjult
            </span>
          )}
        </div>
        <CaretDownIcon
          size={12}
          weight="regular"
          aria-hidden="true"
          className={`ml-auto transform text-gmi-text-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="space-y-3 bg-gmi-surface-soft/60 p-2">
          {/* Points */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold uppercase text-gmi-text-muted">
                Punkter
              </h4>
              {pointCount > 0 && (
                <button
                  onClick={() => {
                    const codes = Object.keys(temaStats.points);
                    const allHidden = codes.every((c) =>
                      hiddenCodes.includes(c),
                    );
                    codes.forEach((code) => {
                      if (
                        allHidden
                          ? hiddenCodes.includes(code)
                          : !hiddenCodes.includes(code)
                      ) {
                        toggleLayerHiddenCode(layerId, code);
                      }
                    });
                  }}
                  className="gmi-focus-ring rounded text-[10px] text-gmi-interactive hover:text-gmi-navy hover:underline"
                >
                  {Object.keys(temaStats.points).every((c) =>
                    hiddenCodes.includes(c),
                  )
                    ? 'Vis alle'
                    : 'Skjul alle'}
                </button>
              )}
            </div>
            {pointCount > 0 ? (
              <div className="space-y-0.5">
                {Object.entries(temaStats.points)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([code, data]) => {
                    const label = codeLookups.punktMap.get(code);
                    const isHidden = hiddenCodes.includes(code);
                    const typeEntries = Object.entries(
                      data.types || {},
                    );
                    const hasTypes =
                      typeEntries.length > 0 &&
                      !(
                        typeEntries.length === 1 &&
                        data.types?.['(Mangler Type)']
                      );
                    return (
                      <React.Fragment key={code}>
                        <div
                          className={`flex cursor-pointer items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-gmi-surface-soft ${isHidden ? 'opacity-50' : ''}`}
                          onMouseEnter={() =>
                            setHighlightedCode(code)
                          }
                          onMouseLeave={() =>
                            setHighlightedCode(null)
                          }
                          onClick={() =>
                            toggleLayerHiddenCode(layerId, code)
                          }
                        >
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={() => {}}
                              className="h-2.5 w-2.5 accent-gmi-interactive"
                            />
                            <span className="font-mono font-bold">
                              {code}
                            </span>
                            <span className="max-w-20 truncate text-gmi-text-subtle">
                              {code === MISSING_TEMA_VALUE
                                ? 'Mangler Tema'
                                : label || 'Ukjent'}
                            </span>
                          </div>
                          <span className="text-gmi-text-subtle">
                            {data.count}
                          </span>
                        </div>
                        {hasTypes && (
                          <div className="ml-5 space-y-0.5 border-l border-gmi-border pl-2">
                            {typeEntries
                              .sort(([, a], [, b]) => b - a)
                              .map(([typeVal, typeCount]) => {
                                const isTypeHidden = hiddenTypes.some(
                                  (ht) =>
                                    ht.type === typeVal &&
                                    ht.code === code,
                                );
                                return (
                                  <div
                                    key={`${code}-${typeVal}`}
                                    className={`-mx-1 flex cursor-pointer items-center justify-between rounded px-1 text-[10px] text-gmi-text-subtle hover:bg-gmi-surface-soft ${isTypeHidden ? 'opacity-50' : ''}`}
                                    onMouseEnter={() =>
                                      setHighlightedType(
                                        typeVal,
                                        code,
                                      )
                                    }
                                    onMouseLeave={() =>
                                      setHighlightedType(null, null)
                                    }
                                    onClick={() =>
                                      toggleLayerHiddenType(
                                        layerId,
                                        typeVal,
                                        code,
                                      )
                                    }
                                  >
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        checked={!isTypeHidden}
                                        onChange={() => {}}
                                        className="h-2.5 w-2.5 accent-gmi-interactive"
                                      />
                                      <span
                                        className={
                                          typeVal === '(Mangler Type)'
                                            ? 'italic text-red-400'
                                            : ''
                                        }
                                      >
                                        {typeVal}
                                      </span>
                                    </div>
                                    <span className="font-mono text-gmi-text-subtle">
                                      {typeCount}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] italic text-gmi-text-subtle">
                Ingen punkter
              </p>
            )}
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold uppercase text-gmi-text-muted">
                Ledninger
              </h4>
              {lineCount > 0 && (
                <button
                  onClick={() => {
                    const codes = Object.keys(temaStats.lines);
                    const allHidden = codes.every((c) =>
                      hiddenCodes.includes(c),
                    );
                    codes.forEach((code) => {
                      if (
                        allHidden
                          ? hiddenCodes.includes(code)
                          : !hiddenCodes.includes(code)
                      ) {
                        toggleLayerHiddenCode(layerId, code);
                      }
                    });
                  }}
                  className="gmi-focus-ring rounded text-[10px] text-gmi-interactive hover:text-gmi-navy hover:underline"
                >
                  {Object.keys(temaStats.lines).every((c) =>
                    hiddenCodes.includes(c),
                  )
                    ? 'Vis alle'
                    : 'Skjul alle'}
                </button>
              )}
            </div>
            {lineCount > 0 ? (
              <div className="space-y-0.5">
                {Object.entries(temaStats.lines)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([code, data]) => {
                    const label = codeLookups.ledMap.get(code);
                    const isHidden = hiddenCodes.includes(code);
                    return (
                      <div
                        key={code}
                        className={`flex cursor-pointer items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-gmi-surface-soft ${isHidden ? 'opacity-50' : ''}`}
                        onMouseEnter={() => setHighlightedCode(code)}
                        onMouseLeave={() => setHighlightedCode(null)}
                        onClick={() =>
                          toggleLayerHiddenCode(layerId, code)
                        }
                      >
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => {}}
                            className="h-2.5 w-2.5 accent-gmi-interactive"
                          />
                          <span className="font-mono font-bold">
                            {code}
                          </span>
                          <span className="max-w-20 truncate text-gmi-text-subtle">
                            {code === MISSING_TEMA_VALUE
                              ? 'Mangler Tema'
                              : label || 'Ukjent'}
                          </span>
                        </div>
                        <span className="text-gmi-text-subtle">
                          {data.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] italic text-gmi-text-subtle">
                Ingen ledninger
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerFeltValueSection({
  fieldName,
  valueCounts,
  totalCount,
  objectType,
  layerId,
  feltHiddenValues,
  toggleLayerFeltHiddenValue,
  setHighlightedFelt,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sortedValues = useMemo(() => {
    return Object.entries(valueCounts).sort(([, a], [, b]) => b - a);
  }, [valueCounts]);

  const isValueHidden = (value) =>
    feltHiddenValues.some(
      (item) =>
        item.fieldName === fieldName &&
        item.value === value &&
        item.objectType === objectType,
    );

  const allHidden = sortedValues.every(([value]) =>
    isValueHidden(value),
  );
  const someHidden = sortedValues.some(([value]) =>
    isValueHidden(value),
  );

  const toggleAllValues = (e) => {
    e.stopPropagation();
    if (allHidden) {
      sortedValues.forEach(([value]) => {
        if (isValueHidden(value)) {
          toggleLayerFeltHiddenValue(
            layerId,
            fieldName,
            value,
            objectType,
          );
        }
      });
    } else {
      sortedValues.forEach(([value]) => {
        if (!isValueHidden(value)) {
          toggleLayerFeltHiddenValue(
            layerId,
            fieldName,
            value,
            objectType,
          );
        }
      });
    }
  };

  return (
    <div className="border-b border-gmi-border last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="gmi-focus-ring flex w-full items-center justify-between px-2 py-1 text-left transition-colors hover:bg-gmi-surface-soft"
      >
        <div className="flex-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`truncate text-[11px] font-semibold text-gmi-text ${someHidden ? 'opacity-60' : ''}`}
            >
              {fieldName}
            </div>
            {someHidden && (
              <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded whitespace-nowrap">
                {
                  sortedValues.filter(([v]) => isValueHidden(v))
                    .length
                }{' '}
                skjult
              </span>
            )}
          </div>
          <div className="whitespace-nowrap text-[10px] text-gmi-text-subtle">
            {sortedValues.length}{' '}
            {sortedValues.length === 1 ? 'verdi' : 'verdier'}
          </div>
        </div>
        <CaretDownIcon
          size={12}
          weight="regular"
          aria-hidden="true"
          className={`transform text-gmi-text-subtle transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {isExpanded && sortedValues.length > 0 && (
        <div className="bg-gmi-surface-soft/60">
          <div className="flex justify-end border-b border-gmi-border px-2 py-1">
            <button
              onClick={toggleAllValues}
              className="gmi-focus-ring rounded text-[10px] text-gmi-interactive hover:text-gmi-navy hover:underline"
            >
              {allHidden ? 'Vis alle' : 'Skjul alle'}
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gmi-surface-soft">
              <tr>
                <th className="w-6 px-2 py-1 text-left text-[10px] font-medium uppercase text-gmi-text-muted">
                  Vis
                </th>
                <th className="px-2 py-1 text-left text-[10px] font-medium uppercase text-gmi-text-muted">
                  Verdi
                </th>
                <th className="px-2 py-1 text-right text-[10px] font-medium uppercase text-gmi-text-muted">
                  Antall
                </th>
                <th className="px-2 py-1 text-right text-[10px] font-medium uppercase text-gmi-text-muted">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gmi-border">
              {sortedValues.map(([value, count]) => {
                const percentage = (
                  (count / totalCount) *
                  100
                ).toFixed(1);
                const displayValue =
                  value === '(Mangler)' ||
                  value === 'null' ||
                  value === ''
                    ? '(Mangler verdi)'
                    : value;
                const isMissing =
                  value === '(Mangler)' ||
                  value === 'null' ||
                  value === '';
                const isHidden = isValueHidden(value);

                return (
                  <tr
                    key={value}
                    className={`cursor-pointer hover:bg-gmi-surface-soft ${isHidden ? 'opacity-50' : ''}`}
                    onClick={() =>
                      toggleLayerFeltHiddenValue(
                        layerId,
                        fieldName,
                        value,
                        objectType,
                      )
                    }
                    onMouseEnter={() =>
                      setHighlightedFelt &&
                      setHighlightedFelt(fieldName, value, objectType)
                    }
                    onMouseLeave={() =>
                      setHighlightedFelt &&
                      setHighlightedFelt(null, null, null)
                    }
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => {}}
                        className="h-3 w-3 rounded border-gmi-border-strong accent-gmi-interactive text-gmi-interactive focus:ring-gmi-interactive"
                      />
                    </td>
                    <td
                      className={`px-2 py-1 ${isMissing ? 'text-red-600 italic' : 'text-gmi-text'}`}
                    >
                      {displayValue}
                    </td>
                    <td className="px-2 py-1 text-right font-medium text-gmi-text">
                      {count}
                    </td>
                    <td className="px-2 py-1 text-right text-gmi-text-muted">
                      {percentage}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible section for Felt filtering within a layer
 */
function LayerFeltSection({
  layerId,
  layer,
  isOpen,
  onToggle,
  setGlobalFeltActive,
}) {
  const [tab, setTab] = useState('punkter');
  const toggleLayerFeltHiddenValue = useStore(
    (state) => state.toggleLayerFeltHiddenValue,
  );
  const setHighlightedFelt = useStore(
    (state) => state.setHighlightedFelt,
  );

  const data = layer?.data;
  const feltHiddenValues = layer?.feltHiddenValues || [];

  // Calculate field analysis for this layer
  const fieldAnalysis = useMemo(() => {
    if (!data)
      return {
        points: { fieldOrder: [], fields: {} },
        lines: { fieldOrder: [], fields: {} },
      };

    const analysis = {
      points: { fieldOrder: [], fields: {} },
      lines: { fieldOrder: [], fields: {} },
    };

    // Analyze points
    const seenPointFields = new Set();
    data.points?.forEach((item) => {
      if (item.attributes) {
        Object.keys(item.attributes).forEach((fieldName) => {
          if (!seenPointFields.has(fieldName)) {
            analysis.points.fieldOrder.push(fieldName);
            seenPointFields.add(fieldName);
            analysis.points.fields[fieldName] = {
              valueCounts: {},
              totalCount: 0,
            };
          }
          const value = item.attributes[fieldName];
          const valueKey =
            value === null || value === undefined || value === ''
              ? '(Mangler)'
              : String(value);
          if (
            !analysis.points.fields[fieldName].valueCounts[valueKey]
          ) {
            analysis.points.fields[fieldName].valueCounts[valueKey] =
              0;
          }
          analysis.points.fields[fieldName].valueCounts[valueKey]++;
          analysis.points.fields[fieldName].totalCount++;
        });
      }
    });

    // Analyze lines
    const seenLineFields = new Set();
    data.lines?.forEach((item) => {
      if (item.attributes) {
        Object.keys(item.attributes).forEach((fieldName) => {
          if (!seenLineFields.has(fieldName)) {
            analysis.lines.fieldOrder.push(fieldName);
            seenLineFields.add(fieldName);
            analysis.lines.fields[fieldName] = {
              valueCounts: {},
              totalCount: 0,
            };
          }
          const value = item.attributes[fieldName];
          const valueKey =
            value === null || value === undefined || value === ''
              ? '(Mangler)'
              : String(value);
          if (
            !analysis.lines.fields[fieldName].valueCounts[valueKey]
          ) {
            analysis.lines.fields[fieldName].valueCounts[valueKey] =
              0;
          }
          analysis.lines.fields[fieldName].valueCounts[valueKey]++;
          analysis.lines.fields[fieldName].totalCount++;
        });
      }
    });

    return analysis;
  }, [data]);

  const pointFieldCount = fieldAnalysis.points.fieldOrder.length;
  const lineFieldCount = fieldAnalysis.lines.fieldOrder.length;
  const hiddenCount = feltHiddenValues.length;

  return (
    <div
      className="border-b last:border-0"
      style={{ borderColor: 'var(--gmi-border)' }}
    >
      <button
        onClick={() => {
          onToggle();
          setGlobalFeltActive(true);
        }}
        className="gmi-focus-ring flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-gmi-surface-soft"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gmi-text">
            Felt
          </span>
          <span className="text-[10px] text-gmi-text-subtle">
            {pointFieldCount + lineFieldCount} felt
          </span>
          {hiddenCount > 0 && (
            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
              {hiddenCount} skjult
            </span>
          )}
        </div>
        <CaretDownIcon
          size={12}
          weight="regular"
          aria-hidden="true"
          className={`ml-auto transform text-gmi-text-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="space-y-2 bg-gmi-surface-soft/60 p-2">
          {/* Tabs */}
          <div
            className="flex border-b border-gmi-border"
          >
            <button
              onClick={() => setTab('punkter')}
              className={`gmi-focus-ring flex-1 px-2 py-1 text-[10px] font-medium transition-colors ${tab === 'punkter' ? 'border-b-2 border-gmi-interactive text-gmi-navy' : 'text-gmi-text-subtle hover:bg-gmi-surface-soft'}`}
            >
              Punkter ({pointFieldCount})
            </button>
            <button
              onClick={() => setTab('ledninger')}
              className={`gmi-focus-ring flex-1 px-2 py-1 text-[10px] font-medium transition-colors ${tab === 'ledninger' ? 'border-b-2 border-gmi-interactive text-gmi-navy' : 'text-gmi-text-subtle hover:bg-gmi-surface-soft'}`}
            >
              Ledninger ({lineFieldCount})
            </button>
          </div>

          <div className="pb-6">
            <div>
              {tab === 'punkter' &&
                fieldAnalysis.points.fieldOrder.map((fieldName) => {
                  const fieldInfo =
                    fieldAnalysis.points.fields[fieldName];
                  return (
                    <LayerFeltValueSection
                      key={`points-${fieldName}`}
                      fieldName={fieldName}
                      valueCounts={fieldInfo.valueCounts}
                      totalCount={fieldInfo.totalCount}
                      objectType="points"
                      layerId={layerId}
                      feltHiddenValues={feltHiddenValues}
                      toggleLayerFeltHiddenValue={
                        toggleLayerFeltHiddenValue
                      }
                      setHighlightedFelt={setHighlightedFelt}
                    />
                  );
                })}
              {tab === 'ledninger' &&
                fieldAnalysis.lines.fieldOrder.map((fieldName) => {
                  const fieldInfo =
                    fieldAnalysis.lines.fields[fieldName];
                  return (
                    <LayerFeltValueSection
                      key={`lines-${fieldName}`}
                      fieldName={fieldName}
                      valueCounts={fieldInfo.valueCounts}
                      totalCount={fieldInfo.totalCount}
                      objectType="lines"
                      layerId={layerId}
                      feltHiddenValues={feltHiddenValues}
                      toggleLayerFeltHiddenValue={
                        toggleLayerFeltHiddenValue
                      }
                      setHighlightedFelt={setHighlightedFelt}
                    />
                  );
                })}
            </div>
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
export default function LayerPanel({ layerId, codeLookups }) {
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

  if (!layer) return null;

  const isExpanded = expandedLayerId === layerId;
  const data = layer.data;
  const pointCount = data?.points?.length || 0;
  const lineCount = data?.lines?.length || 0;

  const [topplokResults, setTopplokResults] = useState(null);
  const [topplokOpen, setTopplokOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Inner section state: 'tema' | 'felt' | null
  const [innerOpen, setInnerOpen] = useState(() => {
    if (feltFilterActive || layer?.feltHiddenValues?.length > 0)
      return 'felt';
    if (
      layer?.hiddenCodes?.length > 0 ||
      layer?.hiddenTypes?.length > 0
    )
      return 'tema';
    return null;
  });

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

          {/* Layer name and stats */}
          <div className="flex-1 min-w-0">
            <div
              className="truncate text-xs font-medium text-gmi-text"
            >
              {layer.name}
            </div>
            <div className="text-[10px] text-gmi-text-subtle">
              {pointCount} punkt, {lineCount} ledn.
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
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
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gmi-border px-4 py-3">
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-3 py-1.5 text-sm"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    removeLayer(layerId);
                    setShowRemoveConfirm(false);
                  }}
                  className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                >
                  Fjern
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
