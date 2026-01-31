'use client';

import React, { useMemo, useState, useEffect } from 'react';
import useStore from '@/lib/store';
import fieldsData from '@/data/fields.json';
import { analyzeIncline } from '@/lib/analysis/incline';
import { analyzeZValues } from '@/lib/analysis/zValidation';
import { analyzeTopplok } from '@/lib/analysis/topplok';
import { detectOutliers } from '@/lib/analysis/outliers';

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
        className={`p-1.5 rounded transition-colors hover:bg-blue-100 relative group ${highlightAll ? 'bg-blue-100' : ''}`}
        title={
          highlightAll ? 'Skru av laghighlight' : 'Marker alt i laget'
        }
      >
        <svg
          className={`w-4 h-4 ${highlightAll ? 'text-blue-700' : 'text-blue-600'}`}
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
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
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
          className="w-4 h-4 text-blue-600"
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
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
        title={
          zValidationResults
            ? 'Åpne høydekontroll'
            : 'Kjør høydekontroll'
        }
      >
        <svg
          className="w-4 h-4 text-blue-600"
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
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
        disabled={isKof}
        title={isKof ? 'Ikke tilgjengelig for KOF' : 'Feltvalidering'}
      >
        <svg
          className="w-4 h-4 text-blue-600"
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
        className={`p-1.5 rounded transition-colors hover:bg-blue-100 relative group ${topplokOpen ? 'bg-blue-100' : ''}`}
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
          className="w-4 h-4 text-blue-600"
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
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="text-[10px] text-gray-600 space-y-1">
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
        <div className="mt-2 border rounded bg-gray-50">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('missing')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                activeTab === 'missing'
                  ? 'bg-white border-b-2 border-red-500 text-red-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Mangler LOK ({results.summary.missing})
            </button>
            <button
              onClick={() => setActiveTab('orphan')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                activeTab === 'orphan'
                  ? 'bg-white border-b-2 border-yellow-500 text-yellow-700'
                  : 'text-gray-500 hover:bg-gray-100'
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
                      className="w-full text-left text-[10px] p-1.5 rounded hover:bg-red-50 border border-transparent hover:border-red-200"
                    >
                      <span className="text-red-700 font-medium">
                        {r.fcode}
                      </span>
                      <span className="text-gray-600">
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
                    className="w-full text-left text-[10px] p-1.5 rounded hover:bg-yellow-50 border border-transparent hover:border-yellow-200"
                  >
                    <span className="text-yellow-700 font-medium">
                      {r.fcode}
                    </span>
                    <span className="text-gray-600">
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
      const code = p.attributes?.S_FCODE || 'UKJENT';
      if (!stats.points[code])
        stats.points[code] = { count: 0, types: {} };
      stats.points[code].count++;
      const typeVal = p.attributes?.Type || '(Mangler Type)';
      stats.points[code].types[typeVal] =
        (stats.points[code].types[typeVal] || 0) + 1;
    });

    data.lines?.forEach((l) => {
      const code = l.attributes?.S_FCODE || 'UKJENT';
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
    <div
      className="border-b last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            Tema
          </span>
          <span className="text-[10px] text-gray-500">
            {pointCount} punkt, {lineCount} linje
          </span>
          {totalHidden > 0 && (
            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
              {totalHidden} skjult
            </span>
          )}
        </div>
        <span
          className={`ml-auto transform transition-transform duration-200 text-xs ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="p-2 bg-gray-50/50 space-y-3">
          {/* Points */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">
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
                  className="text-[10px] text-blue-600 hover:underline"
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
                    return (
                      <div
                        key={code}
                        className={`flex items-center justify-between px-1 py-0.5 rounded text-[11px] cursor-pointer hover:bg-gray-100 ${isHidden ? 'opacity-50' : ''}`}
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
                            className="h-2.5 w-2.5"
                          />
                          <span className="font-mono font-bold">
                            {code}
                          </span>
                          <span className="text-gray-500 truncate max-w-20">
                            {label || 'Ukjent'}
                          </span>
                        </div>
                        <span className="text-gray-500">
                          {data.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">
                Ingen punkter
              </p>
            )}
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">
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
                  className="text-[10px] text-blue-600 hover:underline"
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
                        className={`flex items-center justify-between px-1 py-0.5 rounded text-[11px] cursor-pointer hover:bg-gray-100 ${isHidden ? 'opacity-50' : ''}`}
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
                            className="h-2.5 w-2.5"
                          />
                          <span className="font-mono font-bold">
                            {code}
                          </span>
                          <span className="text-gray-500 truncate max-w-20">
                            {label || 'Ukjent'}
                          </span>
                        </div>
                        <span className="text-gray-500">
                          {data.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">
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
    <div
      className="border-b last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2 py-1 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`text-[11px] font-semibold truncate ${someHidden ? 'opacity-60' : ''}`}
              style={{ color: 'var(--color-text)' }}
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
          <div
            className="text-[10px] whitespace-nowrap"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {sortedValues.length}{' '}
            {sortedValues.length === 1 ? 'verdi' : 'verdier'}
          </div>
        </div>
        <span
          className={`transform transition-transform duration-200 text-xs ${isExpanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>
      {isExpanded && sortedValues.length > 0 && (
        <div className="bg-gray-50/50">
          <div className="px-2 py-1 flex justify-end border-b border-gray-200">
            <button
              onClick={toggleAllValues}
              className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline"
            >
              {allHidden ? 'Vis alle' : 'Skjul alle'}
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 py-1 text-left text-[10px] font-medium text-gray-600 uppercase w-6">
                  Vis
                </th>
                <th className="px-2 py-1 text-left text-[10px] font-medium text-gray-600 uppercase">
                  Verdi
                </th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-gray-600 uppercase">
                  Antall
                </th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-gray-600 uppercase">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
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
                    className={`hover:bg-gray-100 cursor-pointer ${isHidden ? 'opacity-50' : ''}`}
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
                        className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td
                      className={`px-2 py-1 ${isMissing ? 'text-red-600 italic' : 'text-gray-700'}`}
                    >
                      {displayValue}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-700 font-medium">
                      {count}
                    </td>
                    <td className="px-2 py-1 text-right text-gray-600">
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
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        onClick={() => {
          onToggle();
          setGlobalFeltActive(true);
        }}
        className="w-full flex items-center gap-2 p-2 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            Felt
          </span>
          <span className="text-[10px] text-gray-500">
            {pointFieldCount + lineFieldCount} felt
          </span>
          {hiddenCount > 0 && (
            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
              {hiddenCount} skjult
            </span>
          )}
        </div>
        <span
          className={`ml-auto transform transition-transform duration-200 text-xs ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="p-2 bg-gray-50/50 space-y-2">
          {/* Tabs */}
          <div
            className="flex border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={() => setTab('punkter')}
              className={`flex-1 px-2 py-1 text-[10px] font-medium transition-colors ${tab === 'punkter' ? 'border-b-2 text-blue-600 border-blue-600' : 'text-gray-500'}`}
            >
              Punkter ({pointFieldCount})
            </button>
            <button
              onClick={() => setTab('ledninger')}
              className={`flex-1 px-2 py-1 text-[10px] font-medium transition-colors ${tab === 'ledninger' ? 'border-b-2 text-blue-600 border-blue-600' : 'text-gray-500'}`}
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

  useEffect(() => {
    if (feltFilterActive || layer?.feltHiddenValues?.length > 0) {
      setInnerOpen('felt');
      return;
    }
    if (
      layer?.hiddenCodes?.length > 0 ||
      layer?.hiddenTypes?.length > 0
    ) {
      setInnerOpen('tema');
    }
  }, [
    feltFilterActive,
    layer?.feltHiddenValues?.length,
    layer?.hiddenCodes?.length,
    layer?.hiddenTypes?.length,
  ]);

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
        className={`border-b-2 transition-colors ${!layer.visible ? 'opacity-60' : ''}`}
        style={{ borderColor: 'var(--color-border)' }}
      >
        {/* Layer header */}
        <div
          className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50"
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
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            title={layer.visible ? 'Skjul lag' : 'Vis lag'}
          />

          {/* Layer name and stats */}
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-medium truncate"
              style={{ color: 'var(--color-text)' }}
            >
              {layer.name}
            </div>
            <div className="text-[10px] text-gray-500">
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
              className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
              title="Zoom til lag"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 7h10v10H7z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v4M4 4h4M20 4h-4M20 4v4M4 20v-4M4 20h4M20 20h-4M20 20v-4"
                />
              </svg>
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRemoveConfirm(true);
              }}
              className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
              title="Fjern lag"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Expand indicator */}
            <span
              className={`transform transition-transform duration-200 text-xs ${isExpanded ? 'rotate-180' : ''}`}
              style={{ color: 'var(--color-text-secondary)' }}
            >
              ▼
            </span>
          </div>
        </div>

        {showRemoveConfirm && (
          <div className="fixed inset-0 z-10002 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Fjern lag
                </h3>
              </div>
              <div className="px-4 py-3 text-sm text-gray-700">
                Er du sikker på at du vil fjerne lag “{layer.name}”?
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
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
            className="border-t bg-gray-50/30"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {/* Analysis buttons row */}
            <div
              className="px-3 py-2 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="text-[10px] text-gray-500">
                Analyse
              </span>
              <LayerAnalysisButtons
                layerId={layerId}
                layer={layer}
                onTopplokClick={handleTopplokClick}
                hasTopplokResults={!!topplokResults}
                topplokOpen={topplokOpen}
              />
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
