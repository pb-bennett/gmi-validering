'use client';

import useStore from '@/lib/store';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import fieldsData from '@/data/fields.json';
import { analyzeIncline } from '@/lib/analysis/incline';
import { analyzeZValues } from '@/lib/analysis/zValidation';
import { analyzeTopplok } from '@/lib/analysis/topplok';
import { detectOutliers } from '@/lib/analysis/outliers';
import LayerManager from './LayerManager';

function InclineAnalysisControl() {
  const data = useStore((state) => state.data);
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const toggleAnalysisModal = useStore(
    (state) => state.toggleAnalysisModal,
  );
  const analysisResults = useStore((state) => state.analysis.results);
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
  );

  const runAnalysis = () => {
    if (!data) return;
    const results = analyzeIncline(data, {
      minInclineMode: inclineRequirementMode,
    });
    setAnalysisResults(results);
    toggleAnalysisModal(true);
  };

  const openResults = () => {
    toggleAnalysisModal(true);
  };

  const errorCount = analysisResults.filter(
    (r) => r.status === 'error',
  ).length;
  const warningCount = analysisResults.filter(
    (r) => r.status === 'warning',
  ).length;

  return (
    <div className="space-y-2">
      <button
        onClick={
          analysisResults.length > 0 ? openResults : runAnalysis
        }
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderColor: 'var(--color-primary-dark)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-dark)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary)')
        }
      >
        {analysisResults.length > 0
          ? 'Åpne profilanalyse'
          : 'Kjør profilanalyse'}
      </button>

      {analysisResults.length > 0 && (
        <div className="text-xs text-gray-600 flex justify-between">
          <span>{analysisResults.length} analysert</span>
          <span>
            <span
              className={
                errorCount > 0 ? 'text-red-600 font-bold' : ''
              }
            >
              {errorCount} feil
            </span>
            ,{' '}
            <span
              className={
                warningCount > 0 ? 'text-yellow-600 font-bold' : ''
              }
            >
              {warningCount} advarsler
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function ZValidationControl() {
  const data = useStore((state) => state.data);
  const zValidationResults = useStore(
    (state) => state.zValidation.results,
  );
  const setZValidationResults = useStore(
    (state) => state.setZValidationResults,
  );
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );

  const runAnalysis = () => {
    if (!data) return;
    const results = analyzeZValues(data);
    setZValidationResults(results);
    toggleZValidationModal(true);
  };

  const openResults = () => {
    toggleZValidationModal(true);
  };

  const summary = zValidationResults?.summary;
  const missingObjects =
    (summary?.missingPointObjects || 0) +
    (summary?.missingLineObjects || 0);

  return (
    <div className="space-y-2">
      <button
        onClick={zValidationResults ? openResults : runAnalysis}
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderColor: 'var(--color-primary-dark)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-dark)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary)')
        }
      >
        {zValidationResults
          ? 'Åpne høydekontroll'
          : 'Kjør høydekontroll'}
      </button>

      {zValidationResults && (
        <div className="text-xs text-gray-600 flex justify-between">
          <span>
            {summary?.totalPoints || 0} punkter,{' '}
            {summary?.totalLines || 0} linjer
          </span>
          <span
            className={
              missingObjects > 0 ? 'text-red-600 font-bold' : ''
            }
          >
            {missingObjects} avvik
          </span>
        </div>
      )}
    </div>
  );
}

function FieldValidationControl() {
  const toggleFieldValidation = useStore(
    (state) => state.toggleFieldValidation,
  );

  return (
    <div className="space-y-2">
      <button
        onClick={() => toggleFieldValidation(true)}
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderColor: 'var(--color-primary-dark)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-dark)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary)')
        }
      >
        Åpne feltvalidering
      </button>
    </div>
  );
}

function TopplokControl() {
  const data = useStore((state) => state.data);
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState('missing'); // 'missing' | 'orphan'

  const runAnalysis = () => {
    if (!data) return;
    const analysis = analyzeTopplok(data);
    setResults(analysis);
    setShowResults(true);
  };

  const highlightPoint = (pointIndex) => {
    const featureId = `punkter-${pointIndex}`;
    const coord = data?.points?.[pointIndex]?.coordinates?.[0];

    if (
      coord &&
      Number.isFinite(coord.x) &&
      Number.isFinite(coord.y)
    ) {
      // MapCenterHandler expects [y, x]
      viewObjectInMap(featureId, [coord.y, coord.x], 21);
      return;
    }

    setHighlightedFeature(featureId);
  };

  const hasIssues =
    results &&
    (results.summary.missing > 0 ||
      results.summary.orphanLokCount > 0);

  return (
    <div className="space-y-2">
      <button
        onClick={
          results ? () => setShowResults(!showResults) : runAnalysis
        }
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderColor: 'var(--color-primary-dark)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-dark)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary)')
        }
      >
        {results
          ? showResults
            ? 'Skjul resultater'
            : 'Vis resultater'
          : 'Kjør topplok kontroll'}
      </button>

      {results && (
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>{results.summary.total} kontrollert</span>
            <span>
              <span
                className={
                  results.summary.missing > 0
                    ? 'text-red-600 font-bold'
                    : 'text-green-600'
                }
              >
                {results.summary.missing} mangler LOK
              </span>
            </span>
          </div>
          {results.summary.orphanLokCount > 0 && (
            <div className="flex justify-between">
              <span>{results.summary.lokCount} LOK funnet</span>
              <span className="text-yellow-600 font-bold">
                {results.summary.orphanLokCount} uten KUM/SLU
              </span>
            </div>
          )}
        </div>
      )}

      {showResults && results && hasIssues && (
        <div className="mt-2 border rounded bg-gray-50">
          {/* Tab buttons */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('missing')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'missing'
                  ? 'bg-white border-b-2 border-red-500 text-red-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Mangler LOK ({results.summary.missing})
            </button>
            <button
              onClick={() => setActiveTab('orphan')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'orphan'
                  ? 'bg-white border-b-2 border-yellow-500 text-yellow-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              LOK uten eier ({results.summary.orphanLokCount})
            </button>
          </div>

          {/* Tab content */}
          <div className="max-h-48 overflow-y-auto p-2">
            {activeTab === 'missing' &&
              results.summary.missing > 0 && (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    Klikk for å markere i kart
                  </p>
                  {results.results
                    .filter((r) => r.status === 'error')
                    .map((r, i) => (
                      <div
                        key={i}
                        className="text-xs py-1.5 px-2 hover:bg-red-50 rounded cursor-pointer flex justify-between items-center border-b last:border-0"
                        onClick={() => highlightPoint(r.pointIndex)}
                      >
                        <span className="font-medium text-red-700">
                          {r.fcode}
                        </span>
                        <span className="text-gray-500 text-right">
                          {r.coordinates
                            ? `${r.coordinates.x.toFixed(
                                0,
                              )}, ${r.coordinates.y.toFixed(0)}`
                            : 'Ukjent pos'}
                        </span>
                      </div>
                    ))}
                </>
              )}

            {activeTab === 'missing' &&
              results.summary.missing === 0 && (
                <p className="text-xs text-green-600 p-2">
                  ✓ Alle punkter har tilhørende LOK
                </p>
              )}

            {activeTab === 'orphan' &&
              results.orphanLoks.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    LOK som ikke ligger over noen KUM/SLU/SLS/SAN
                  </p>
                  {results.orphanLoks.map((r, i) => (
                    <div
                      key={i}
                      className="text-xs py-1.5 px-2 hover:bg-yellow-50 rounded cursor-pointer flex justify-between items-center border-b last:border-0"
                      onClick={() => highlightPoint(r.pointIndex)}
                    >
                      <span className="font-medium text-yellow-700">
                        LOK
                      </span>
                      <span className="text-gray-500 text-right">
                        {r.coordinates
                          ? `${r.coordinates.x.toFixed(
                              0,
                            )}, ${r.coordinates.y.toFixed(0)}`
                          : 'Ukjent pos'}
                      </span>
                    </div>
                  ))}
                </>
              )}

            {activeTab === 'orphan' &&
              results.orphanLoks.length === 0 && (
                <p className="text-xs text-green-600 p-2">
                  ✓ Alle LOK har tilhørende KUM/SLU
                </p>
              )}
          </div>
        </div>
      )}

      {showResults && results && !hasIssues && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          ✓ Alle {results.summary.total} punkter har tilhørende LOK
        </div>
      )}
    </div>
  );
}

function OutlierControl() {
  const data = useStore((state) => state.data);
  const outlierResults = useStore((state) => state.outliers.results);
  const hideOutliers = useStore(
    (state) => state.outliers.hideOutliers,
  );
  const setOutlierResults = useStore(
    (state) => state.setOutlierResults,
  );
  const toggleHideOutliers = useStore(
    (state) => state.toggleHideOutliers,
  );
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );
  const [showResults, setShowResults] = useState(false);

  const runAnalysis = () => {
    if (!data) return;
    const results = detectOutliers(data);
    setOutlierResults(results);
    setShowResults(true);
  };

  const highlightOutlier = (featureId) => {
    setHighlightedFeature(featureId);
  };

  const hasOutliers =
    outlierResults && outlierResults.outliers.length > 0;

  return (
    <div className="space-y-2">
      <button
        onClick={
          outlierResults
            ? () => setShowResults(!showResults)
            : runAnalysis
        }
        className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          borderColor: 'var(--color-primary-dark)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-dark)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary)')
        }
      >
        {outlierResults
          ? showResults
            ? 'Skjul resultater'
            : 'Vis resultater'
          : 'Finn avvik'}
      </button>

      {outlierResults && (
        <div className="text-xs text-gray-600 flex justify-between">
          <span>{outlierResults.summary.totalObjects} objekter</span>
          <span
            className={
              hasOutliers
                ? 'text-orange-600 font-bold'
                : 'text-green-600'
            }
          >
            {outlierResults.summary.outlierCount} avvik funnet
          </span>
        </div>
      )}

      {showResults && outlierResults && hasOutliers && (
        <div className="mt-2 border rounded bg-gray-50">
          {/* Hide toggle */}
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-xs text-gray-600">
              Skjul avvik i kart
            </span>
            <button
              onClick={() => toggleHideOutliers()}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                hideOutliers
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {hideOutliers ? 'På' : 'Av'}
            </button>
          </div>

          {/* Outlier list */}
          <div className="max-h-48 overflow-y-auto p-2">
            <p className="text-xs text-gray-500 mb-2">
              Objekter langt fra hoveddata. Klikk for å markere.
            </p>
            {outlierResults.outliers.map((outlier, i) => (
              <div
                key={i}
                className="text-xs py-1.5 px-2 hover:bg-orange-50 rounded cursor-pointer flex justify-between items-center border-b last:border-0"
                onClick={() => highlightOutlier(outlier.featureId)}
              >
                <span className="font-medium text-orange-700">
                  {outlier.fcode || outlier.type}
                </span>
                <span className="text-gray-500 text-right">
                  {outlier.distance.toFixed(0)}m fra senter
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showResults && outlierResults && !hasOutliers && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          ✓ Ingen avvik funnet - alle objekter er i nærheten av
          hverandre
        </div>
      )}
    </div>
  );
}

function SidebarSection({ title, children, isOpen, onToggle }) {
  return (
    <div
      className="border-b last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 transition-colors text-left"
        style={{
          backgroundColor: 'var(--color-sidebar-bg)',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-sidebar-hover)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-sidebar-bg)')
        }
      >
        <span
          className="font-semibold text-sm"
          style={{ color: 'var(--color-text)' }}
        >
          {title}
        </span>
        <span
          className={`transform transition-transform duration-200 text-xs ${
            isOpen ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div
          className="p-3"
          style={{ backgroundColor: 'var(--color-card)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FieldSubSection({
  fieldName,
  fieldLabel,
  valueCounts,
  totalCount,
  objectType, // 'points' or 'lines'
  feltHiddenValues,
  toggleFeltHiddenValue,
  feltSearchText,
  setHighlightedFelt, // for hover highlighting on map/3D
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort values by count descending
  const sortedValues = useMemo(() => {
    return Object.entries(valueCounts).sort(([, a], [, b]) => b - a);
  }, [valueCounts]);

  // Filter values by search text
  const filteredValues = useMemo(() => {
    if (!feltSearchText) return sortedValues;
    const searchLower = feltSearchText.toLowerCase();
    return sortedValues.filter(([value]) =>
      value.toLowerCase().includes(searchLower),
    );
  }, [sortedValues, feltSearchText]);

  const hasData = sortedValues.length > 0;

  // Check if a value is hidden
  const isValueHidden = (value) => {
    return feltHiddenValues.some(
      (item) =>
        item.fieldName === fieldName &&
        item.value === value &&
        item.objectType === objectType,
    );
  };

  // Check if all values in this field are hidden
  const allHidden = sortedValues.every(([value]) =>
    isValueHidden(value),
  );
  const someHidden = sortedValues.some(([value]) =>
    isValueHidden(value),
  );

  // Toggle all values in this field
  const toggleAllValues = (e) => {
    e.stopPropagation();
    if (allHidden) {
      // Show all - remove all hidden values for this field
      sortedValues.forEach(([value]) => {
        if (isValueHidden(value)) {
          toggleFeltHiddenValue(fieldName, value, objectType);
        }
      });
    } else {
      // Hide all - add all values to hidden
      sortedValues.forEach(([value]) => {
        if (!isValueHidden(value)) {
          toggleFeltHiddenValue(fieldName, value, objectType);
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
        className="w-full flex items-center justify-between p-2 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`text-xs font-semibold ${
                someHidden ? 'opacity-60' : ''
              }`}
              style={{ color: 'var(--color-text)' }}
            >
              {fieldLabel || fieldName}
            </div>
            {someHidden && (
              <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
                {
                  sortedValues.filter(([v]) => isValueHidden(v))
                    .length
                }{' '}
                skjult
              </span>
            )}
          </div>
          <div
            className="text-[10px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {sortedValues.length}{' '}
            {sortedValues.length === 1 ? 'verdi' : 'verdier'}
          </div>
        </div>
        <span
          className={`transform transition-transform duration-200 text-xs ${
            isExpanded ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>
      {isExpanded && hasData && (
        <div className="bg-gray-50/50">
          {/* Toggle all button */}
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
              {filteredValues.map(([value, count]) => {
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
                    className={`hover:bg-gray-100 cursor-pointer ${
                      isHidden ? 'opacity-50' : ''
                    }`}
                    onClick={() =>
                      toggleFeltHiddenValue(
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
                      className={`px-2 py-1 ${
                        isMissing
                          ? 'text-red-600 italic'
                          : 'text-gray-700'
                      }`}
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

export default function Sidebar({ onReset, onAddFile }) {
  const file = useStore((state) => state.file);
  const data = useStore((state) => state.data);
  const layerOrder = useStore((state) => state.layerOrder);
  const multiLayerModeEnabled = useStore(
    (state) => state.ui.multiLayerModeEnabled,
  );
  const isMultiLayerMode =
    multiLayerModeEnabled || layerOrder.length > 0;

  const setHighlightedCode = useStore(
    (state) => state.setHighlightedCode,
  );
  const setHighlightedType = useStore(
    (state) => state.setHighlightedType,
  );
  const toggleHiddenCode = useStore(
    (state) => state.toggleHiddenCode,
  );
  const toggleHiddenType = useStore(
    (state) => state.toggleHiddenType,
  );
  const toggleDataTable = useStore((state) => state.toggleDataTable);
  const hiddenCodes = useStore((state) => state.ui.hiddenCodes);
  const hiddenTypes = useStore((state) => state.ui.hiddenTypes);

  // Felt filter state and actions
  const feltFilterActive = useStore(
    (state) => state.ui.feltFilterActive,
  );
  const feltHiddenValues = useStore(
    (state) => state.ui.feltHiddenValues,
  );
  const feltSearchText = useStore((state) => state.ui.feltSearchText);
  const setFeltFilterActive = useStore(
    (state) => state.setFeltFilterActive,
  );
  const toggleFeltHiddenValue = useStore(
    (state) => state.toggleFeltHiddenValue,
  );
  const setFeltSearchText = useStore(
    (state) => state.setFeltSearchText,
  );
  const clearFeltFilter = useStore((state) => state.clearFeltFilter);
  const setHighlightedFelt = useStore(
    (state) => state.setHighlightedFelt,
  );

  // State for sidebar width and resizing
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const openSection = useStore(
    (state) => state.ui.sidebarOpenSection,
  );
  const setSidebarOpenSection = useStore(
    (state) => state.setSidebarOpenSection,
  );

  const isKof = data?.format === 'KOF';

  // State for Felt section tabs
  const [feltTab, setFeltTab] = useState('punkter'); // 'punkter' or 'ledninger'

  const toggleSection = (section) => {
    const newSection = openSection === section ? null : section;
    setSidebarOpenSection(newSection);
    // Activate felt filter when Felt section is opened
    if (section === 'felt') {
      setFeltFilterActive(newSection === 'felt');
    } else if (openSection === 'felt') {
      // If closing Felt by opening another section, deactivate felt filter
      setFeltFilterActive(false);
    }
  };

  // Prepare code lookups
  const codeLookups = useMemo(() => {
    const punktField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_punkt',
    );
    const ledField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_led',
    );

    const punktMap = new Map(
      punktField?.acceptableValues?.map((v) => [v.value, v.label]) ||
        [],
    );
    const ledMap = new Map(
      ledField?.acceptableValues?.map((v) => [v.value, v.label]) ||
        [],
    );

    return { punktMap, ledMap };
  }, []);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      // Prevent text selection during resize
      document.body.style.userSelect = 'none';
      document.body.style.WebkitUserSelect = 'none';
      document.body.style.cursor = 'col-resize';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.WebkitUserSelect = '';
      document.body.style.cursor = '';

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const stats = useMemo(() => {
    if (!data) return null;

    const pointCount = data.points.length;
    const lineCount = data.lines.length;

    let totalLength = 0;
    data.lines.forEach((line) => {
      if (line.coordinates && line.coordinates.length > 1) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
          const p1 = line.coordinates[i];
          const p2 = line.coordinates[i + 1];
          const dist = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2),
          );
          totalLength += dist;
        }
      }
    });

    // Calculate Tema stats (S_FCODE counts)
    const temaStats = {
      points: {},
      lines: {},
    };

    data.points.forEach((p) => {
      const code = p.attributes?.S_FCODE || 'UKJENT';
      if (!temaStats.points[code]) {
        temaStats.points[code] = { count: 0, types: {} };
      }
      temaStats.points[code].count++;

      // Track Type distribution
      const typeVal = p.attributes?.Type || '(Mangler Type)';
      temaStats.points[code].types[typeVal] =
        (temaStats.points[code].types[typeVal] || 0) + 1;
    });

    data.lines.forEach((l) => {
      const code = l.attributes?.S_FCODE || 'UKJENT';
      if (!temaStats.lines[code]) {
        temaStats.lines[code] = { count: 0, types: {} };
      }
      temaStats.lines[code].count++;

      // Track Type distribution
      const typeVal = l.attributes?.Type || '(Mangler Type)';
      temaStats.lines[code].types[typeVal] =
        (temaStats.lines[code].types[typeVal] || 0) + 1;
    });

    // Analyze fields separately for points and lines
    const fieldAnalysis = {
      points: {
        fieldOrder: [],
        fields: {},
      },
      lines: {
        fieldOrder: [],
        fields: {},
      },
    };

    // Analyze POINTS fields
    const seenPointFields = new Set();

    // S_FCODE always first for points
    if (
      data.points.some(
        (item) => item.attributes?.S_FCODE !== undefined,
      )
    ) {
      fieldAnalysis.points.fieldOrder.push('S_FCODE');
      seenPointFields.add('S_FCODE');
    }

    // Collect field order from points
    data.points.forEach((item) => {
      if (item.attributes) {
        Object.keys(item.attributes).forEach((fieldName) => {
          if (!seenPointFields.has(fieldName)) {
            fieldAnalysis.points.fieldOrder.push(fieldName);
            seenPointFields.add(fieldName);
          }
        });
      }
    });

    // Initialize counters for point fields
    fieldAnalysis.points.fieldOrder.forEach((fieldName) => {
      fieldAnalysis.points.fields[fieldName] = {
        valueCounts: {},
        totalCount: 0,
      };
    });

    // Count values for point fields
    data.points.forEach((item) => {
      if (item.attributes) {
        fieldAnalysis.points.fieldOrder.forEach((fieldName) => {
          const value = item.attributes[fieldName];
          const valueKey =
            value === null || value === undefined || value === ''
              ? '(Mangler)'
              : String(value);

          if (
            !fieldAnalysis.points.fields[fieldName].valueCounts[
              valueKey
            ]
          ) {
            fieldAnalysis.points.fields[fieldName].valueCounts[
              valueKey
            ] = 0;
          }
          fieldAnalysis.points.fields[fieldName].valueCounts[
            valueKey
          ]++;
          fieldAnalysis.points.fields[fieldName].totalCount++;
        });
      }
    });

    // Analyze LINES fields
    const seenLineFields = new Set();

    // S_FCODE always first for lines
    if (
      data.lines.some(
        (item) => item.attributes?.S_FCODE !== undefined,
      )
    ) {
      fieldAnalysis.lines.fieldOrder.push('S_FCODE');
      seenLineFields.add('S_FCODE');
    }

    // Collect field order from lines
    data.lines.forEach((item) => {
      if (item.attributes) {
        Object.keys(item.attributes).forEach((fieldName) => {
          if (!seenLineFields.has(fieldName)) {
            fieldAnalysis.lines.fieldOrder.push(fieldName);
            seenLineFields.add(fieldName);
          }
        });
      }
    });

    // Initialize counters for line fields
    fieldAnalysis.lines.fieldOrder.forEach((fieldName) => {
      fieldAnalysis.lines.fields[fieldName] = {
        valueCounts: {},
        totalCount: 0,
      };
    });

    // Count values for line fields
    data.lines.forEach((item) => {
      if (item.attributes) {
        fieldAnalysis.lines.fieldOrder.forEach((fieldName) => {
          const value = item.attributes[fieldName];
          const valueKey =
            value === null || value === undefined || value === ''
              ? '(Mangler)'
              : String(value);

          if (
            !fieldAnalysis.lines.fields[fieldName].valueCounts[
              valueKey
            ]
          ) {
            fieldAnalysis.lines.fields[fieldName].valueCounts[
              valueKey
            ] = 0;
          }
          fieldAnalysis.lines.fields[fieldName].valueCounts[
            valueKey
          ]++;
          fieldAnalysis.lines.fields[fieldName].totalCount++;
        });
      }
    });

    return {
      pointCount,
      lineCount,
      totalLength: Math.round(totalLength),
      temaStats,
      fieldAnalysis,
    };
  }, [data]);

  // Show sidebar if we have data (legacy mode) OR if we have layers (multi-layer mode)
  if (!data && !isMultiLayerMode) return null;

  return (
    <div
      ref={sidebarRef}
      style={{
        width: `${width}px`,
        backgroundColor: 'var(--color-card)',
        borderRightColor: 'var(--color-border)',
      }}
      className="h-full border-r flex flex-col shadow-xl z-[10000] relative flex-shrink-0"
    >
      {/* Resize Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors z-30"
        style={{
          backgroundColor: 'transparent',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor =
            'var(--color-primary-light)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = 'transparent')
        }
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header */}
      <div
        className="px-3 py-3 border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-sidebar-bg)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Logo Icon */}
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg shadow-sm"
            style={{
              backgroundColor: 'var(--color-primary)',
              background:
                'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
              <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
            </svg>
          </div>
          {/* Title */}
          <div className="flex flex-col">
            <h1
              className="text-base font-bold leading-tight tracking-tight"
              style={{ color: 'var(--color-primary)' }}
            >
              GMI Validator
            </h1>
            <span
              className="text-[10px] font-medium leading-tight tracking-wide uppercase"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Innmålingskontroll
            </span>
          </div>
        </div>
      </div>

      {/* Content - Scrollable */}
      {isMultiLayerMode ? (
        /* Multi-layer mode: show LayerManager */
        <LayerManager onAddFile={onAddFile} />
      ) : (
        /* Legacy single-file mode */
        <div className="flex-1 overflow-y-auto">
          {/* Oversikt */}
          <SidebarSection
            title="Oversikt"
            isOpen={openSection === 'oversikt'}
            onToggle={() => toggleSection('oversikt')}
          >
            <div className="space-y-3">
              {/* File Info */}
              <div className="bg-white p-2.5 rounded-lg shadow-sm border border-gray-100">
                <div className="mb-2">
                  <span className="text-xs text-gray-500 block mb-1">
                    Filnavn
                  </span>
                  <span className="font-medium text-gray-900 break-all block text-sm">
                    {file?.name}
                  </span>
                </div>
                <div className="mb-2">
                  <span className="text-xs text-gray-500 block mb-1">
                    Filtype
                  </span>
                  <span className="font-medium text-gray-900 text-sm">
                    {data?.format || file?.format || 'Ukjent'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">
                    Størrelse
                  </span>
                  <span className="font-medium text-gray-900 text-sm">
                    {(file?.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 gap-2">
                <div className="bg-white p-2.5 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                  <span className="text-gray-600 text-xs">
                    Punkter
                  </span>
                  <span className="font-bold text-primary text-sm">
                    {stats.pointCount}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                  <span className="text-gray-600 text-xs">
                    Ledninger
                  </span>
                  <span className="font-bold text-primary text-sm">
                    {stats.lineCount}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg shadow-sm border border-gray-100">
                  <span className="text-gray-600 text-xs block mb-1">
                    Total lengde
                  </span>
                  <span className="font-bold text-primary text-sm">
                    {stats.totalLength.toLocaleString('nb-NO')}{' '}
                    <span className="text-xs font-normal text-gray-500">
                      meter
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </SidebarSection>

          {/* Tema */}
          <SidebarSection
            title="Tema"
            isOpen={openSection === 'tema'}
            onToggle={() => toggleSection('tema')}
          >
            <div className="space-y-3">
              {/* Points Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Punkter
                  </h3>
                  {Object.keys(stats.temaStats.points).length > 0 && (
                    <button
                      onClick={() => {
                        const pointCodes = Object.keys(
                          stats.temaStats.points,
                        );
                        const allHidden = pointCodes.every((code) =>
                          hiddenCodes.includes(code),
                        );
                        if (allHidden) {
                          // Show all: remove all point codes from hiddenCodes
                          pointCodes.forEach((code) => {
                            if (hiddenCodes.includes(code)) {
                              toggleHiddenCode(code);
                            }
                          });
                        } else {
                          // Hide all: add all point codes to hiddenCodes
                          pointCodes.forEach((code) => {
                            if (!hiddenCodes.includes(code)) {
                              toggleHiddenCode(code);
                            }
                          });
                        }
                      }}
                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                      {Object.keys(stats.temaStats.points).every(
                        (code) => hiddenCodes.includes(code),
                      )
                        ? 'Vis alle'
                        : 'Skjul alle'}
                    </button>
                  )}
                </div>
                {Object.keys(stats.temaStats.points).length > 0 ? (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2.5 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">
                            Kode / Beskrivelse
                          </th>
                          <th className="px-2.5 py-1.5 text-right text-xs font-medium text-gray-500 uppercase">
                            Antall
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.entries(stats.temaStats.points)
                          .sort(([, a], [, b]) => b.count - a.count)
                          .map(([code, data]) => {
                            const label =
                              codeLookups.punktMap.get(code);
                            const isUnknown = !label;
                            const isHidden =
                              hiddenCodes.includes(code);
                            const hasTypes =
                              Object.keys(data.types).length > 0 &&
                              !(
                                Object.keys(data.types).length ===
                                  1 && data.types['(Mangler Type)']
                              );

                            return (
                              <React.Fragment key={code}>
                                <tr
                                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                                    isHidden ? 'opacity-50' : ''
                                  }`}
                                  onMouseEnter={() =>
                                    setHighlightedCode(code)
                                  }
                                  onMouseLeave={() =>
                                    setHighlightedCode(null)
                                  }
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          toggleHiddenCode(code);
                                        }}
                                        className="mt-1 h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <div>
                                        <div
                                          className={`font-mono text-xs font-bold ${
                                            isUnknown
                                              ? 'text-red-600'
                                              : 'text-gray-900'
                                          }`}
                                        >
                                          {code}
                                        </div>
                                        <div
                                          className={`text-xs ${
                                            isUnknown
                                              ? 'text-red-500 italic'
                                              : 'text-gray-500'
                                          }`}
                                        >
                                          {label || 'Ukjent kode'}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">
                                    {data.count}
                                  </td>
                                </tr>
                                {hasTypes && (
                                  <tr className="bg-gray-50/50">
                                    <td
                                      colSpan="2"
                                      className="px-3 py-1 pb-2"
                                    >
                                      <div className="ml-8 text-xs border-l-2 border-gray-200 pl-2 space-y-1">
                                        {Object.entries(data.types)
                                          .sort(
                                            ([, a], [, b]) => b - a,
                                          )
                                          .map(
                                            ([
                                              typeVal,
                                              typeCount,
                                            ]) => {
                                              const isTypeHidden =
                                                hiddenTypes.some(
                                                  (ht) =>
                                                    ht.type ===
                                                      typeVal &&
                                                    ht.code === code,
                                                );
                                              return (
                                                <div
                                                  key={typeVal}
                                                  className={`flex justify-between items-center text-gray-500 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors ${
                                                    isTypeHidden
                                                      ? 'opacity-50'
                                                      : ''
                                                  }`}
                                                  onMouseEnter={() =>
                                                    setHighlightedType(
                                                      typeVal,
                                                      code,
                                                    )
                                                  }
                                                  onMouseLeave={() =>
                                                    setHighlightedType(
                                                      null,
                                                      null,
                                                    )
                                                  }
                                                >
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="checkbox"
                                                      checked={
                                                        !isTypeHidden
                                                      }
                                                      onChange={(
                                                        e,
                                                      ) => {
                                                        e.stopPropagation();
                                                        toggleHiddenType(
                                                          typeVal,
                                                          code,
                                                        );
                                                      }}
                                                      className="h-2.5 w-2.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span
                                                      className={
                                                        typeVal ===
                                                        '(Mangler Type)'
                                                          ? 'italic text-red-400'
                                                          : ''
                                                      }
                                                    >
                                                      {typeVal}
                                                    </span>
                                                  </div>
                                                  <span className="font-mono text-gray-400">
                                                    {typeCount}
                                                  </span>
                                                </div>
                                              );
                                            },
                                          )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    Ingen punkter funnet.
                  </p>
                )}
              </div>

              {/* Lines Table - LEDNINGER SECTION */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Ledninger
                  </h3>
                  {Object.keys(stats.temaStats.lines).length > 0 && (
                    <button
                      onClick={() => {
                        const lineCodes = Object.keys(
                          stats.temaStats.lines,
                        );
                        const allHidden = lineCodes.every((code) =>
                          hiddenCodes.includes(code),
                        );
                        if (allHidden) {
                          // Show all: remove all line codes from hiddenCodes
                          lineCodes.forEach((code) => {
                            if (hiddenCodes.includes(code)) {
                              toggleHiddenCode(code);
                            }
                          });
                        } else {
                          // Hide all: add all line codes to hiddenCodes
                          lineCodes.forEach((code) => {
                            if (!hiddenCodes.includes(code)) {
                              toggleHiddenCode(code);
                            }
                          });
                        }
                      }}
                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                      {Object.keys(stats.temaStats.lines).every(
                        (code) => hiddenCodes.includes(code),
                      )
                        ? 'Vis alle'
                        : 'Skjul alle'}
                    </button>
                  )}
                </div>
                {Object.keys(stats.temaStats.lines).length > 0 ? (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Kode / Beskrivelse
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Antall
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.entries(stats.temaStats.lines)
                          .sort(([, a], [, b]) => b.count - a.count)
                          .map(([code, data]) => {
                            const label =
                              codeLookups.ledMap.get(code);
                            const isUnknown = !label;
                            const isHidden =
                              hiddenCodes.includes(code);
                            const hasTypes =
                              Object.keys(data.types).length > 0 &&
                              !(
                                Object.keys(data.types).length ===
                                  1 && data.types['(Mangler Type)']
                              );

                            return (
                              <React.Fragment key={code}>
                                <tr
                                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                                    isHidden ? 'opacity-50' : ''
                                  }`}
                                  onMouseEnter={() =>
                                    setHighlightedCode(code)
                                  }
                                  onMouseLeave={() =>
                                    setHighlightedCode(null)
                                  }
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          toggleHiddenCode(code);
                                        }}
                                        className="mt-1 h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <div>
                                        <div
                                          className={`font-mono text-xs font-bold ${
                                            isUnknown
                                              ? 'text-red-600'
                                              : 'text-gray-900'
                                          }`}
                                        >
                                          {code}
                                        </div>
                                        <div
                                          className={`text-xs ${
                                            isUnknown
                                              ? 'text-red-500 italic'
                                              : 'text-gray-500'
                                          }`}
                                        >
                                          {label || 'Ukjent kode'}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">
                                    {data.count}
                                  </td>
                                </tr>
                                {hasTypes && (
                                  <tr className="bg-gray-50/50">
                                    <td
                                      colSpan="2"
                                      className="px-3 py-1 pb-2"
                                    >
                                      <div className="ml-8 text-xs border-l-2 border-gray-200 pl-2 space-y-1">
                                        {Object.entries(data.types)
                                          .sort(
                                            ([, a], [, b]) => b - a,
                                          )
                                          .map(
                                            ([
                                              typeVal,
                                              typeCount,
                                            ]) => {
                                              const isTypeHidden =
                                                hiddenTypes.some(
                                                  (ht) =>
                                                    ht.type ===
                                                      typeVal &&
                                                    ht.code === code,
                                                );
                                              return (
                                                <div
                                                  key={typeVal}
                                                  className={`flex justify-between items-center text-gray-500 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors ${
                                                    isTypeHidden
                                                      ? 'opacity-50'
                                                      : ''
                                                  }`}
                                                  onMouseEnter={() =>
                                                    setHighlightedType(
                                                      typeVal,
                                                      code,
                                                    )
                                                  }
                                                  onMouseLeave={() =>
                                                    setHighlightedType(
                                                      null,
                                                      null,
                                                    )
                                                  }
                                                >
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="checkbox"
                                                      checked={
                                                        !isTypeHidden
                                                      }
                                                      onChange={(
                                                        e,
                                                      ) => {
                                                        e.stopPropagation();
                                                        toggleHiddenType(
                                                          typeVal,
                                                          code,
                                                        );
                                                      }}
                                                      className="h-2.5 w-2.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span
                                                      className={
                                                        typeVal ===
                                                        '(Mangler Type)'
                                                          ? 'italic text-red-400'
                                                          : ''
                                                      }
                                                    >
                                                      {typeVal}
                                                    </span>
                                                  </div>
                                                  <span className="font-mono text-gray-400">
                                                    {typeCount}
                                                  </span>
                                                </div>
                                              );
                                            },
                                          )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    Ingen ledninger funnet.
                  </p>
                )}
              </div>
            </div>
          </SidebarSection>

          {/* Felt */}
          <SidebarSection
            title="Felt"
            isOpen={openSection === 'felt'}
            onToggle={() => toggleSection('felt')}
          >
            {stats?.fieldAnalysis ? (
              <div className="space-y-2">
                {/* Open Data Table Button */}
                <button
                  onClick={toggleDataTable}
                  className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                    borderColor: 'var(--color-primary-dark)',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      'var(--color-primary-dark)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      'var(--color-primary)')
                  }
                >
                  Åpne full datatabell
                </button>

                {/* Tabs */}
                <div
                  className="flex border-b"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <button
                    onClick={() => setFeltTab('punkter')}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                      feltTab === 'punkter' ? 'border-b-2' : ''
                    }`}
                    style={{
                      color:
                        feltTab === 'punkter'
                          ? 'var(--color-primary)'
                          : 'var(--color-text-secondary)',
                      borderColor:
                        feltTab === 'punkter'
                          ? 'var(--color-primary)'
                          : 'transparent',
                    }}
                  >
                    Punkter (
                    {stats.fieldAnalysis.points.fieldOrder.length}{' '}
                    felt)
                  </button>
                  <button
                    onClick={() => setFeltTab('ledninger')}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                      feltTab === 'ledninger' ? 'border-b-2' : ''
                    }`}
                    style={{
                      color:
                        feltTab === 'ledninger'
                          ? 'var(--color-primary)'
                          : 'var(--color-text-secondary)',
                      borderColor:
                        feltTab === 'ledninger'
                          ? 'var(--color-primary)'
                          : 'transparent',
                    }}
                  >
                    Ledninger (
                    {stats.fieldAnalysis.lines.fieldOrder.length}{' '}
                    felt)
                  </button>
                </div>

                {/* Search and clear filters */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Søk i feltverdier..."
                    value={feltSearchText || ''}
                    onChange={(e) =>
                      setFeltSearchText(e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs rounded border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                  {feltHiddenValues &&
                    feltHiddenValues.length > 0 && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] text-yellow-600">
                          {feltHiddenValues.length} verdi
                          {feltHiddenValues.length !== 1
                            ? 'er'
                            : ''}{' '}
                          skjult
                        </span>
                        <button
                          onClick={clearFeltFilter}
                          className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Tilbakestill filter
                        </button>
                      </div>
                    )}
                </div>

                {/* Tab Content */}
                <div className="space-y-0">
                  {feltTab === 'punkter' &&
                  stats.fieldAnalysis.points.fieldOrder.length > 0 ? (
                    stats.fieldAnalysis.points.fieldOrder.map(
                      (fieldName) => {
                        const fieldInfo =
                          stats.fieldAnalysis.points.fields[
                            fieldName
                          ];

                        // Try to find label from fields.json
                        const fieldDefinition = fieldsData.find(
                          (f) => f.fieldKey === fieldName,
                        );
                        const fieldLabel =
                          fieldDefinition?.label || fieldName;

                        return (
                          <FieldSubSection
                            key={fieldName}
                            fieldName={fieldName}
                            fieldLabel={fieldLabel}
                            valueCounts={fieldInfo.valueCounts}
                            totalCount={fieldInfo.totalCount}
                            objectType="points"
                            feltHiddenValues={feltHiddenValues}
                            toggleFeltHiddenValue={
                              toggleFeltHiddenValue
                            }
                            feltSearchText={feltSearchText}
                            setHighlightedFelt={setHighlightedFelt}
                          />
                        );
                      },
                    )
                  ) : feltTab === 'punkter' ? (
                    <p className="text-xs text-gray-500 italic pt-2">
                      Ingen punktfelt tilgjengelig.
                    </p>
                  ) : null}

                  {feltTab === 'ledninger' &&
                  stats.fieldAnalysis.lines.fieldOrder.length > 0 ? (
                    stats.fieldAnalysis.lines.fieldOrder.map(
                      (fieldName) => {
                        const fieldInfo =
                          stats.fieldAnalysis.lines.fields[fieldName];

                        // Try to find label from fields.json
                        const fieldDefinition = fieldsData.find(
                          (f) => f.fieldKey === fieldName,
                        );
                        const fieldLabel =
                          fieldDefinition?.label || fieldName;

                        return (
                          <FieldSubSection
                            key={fieldName}
                            fieldName={fieldName}
                            fieldLabel={fieldLabel}
                            valueCounts={fieldInfo.valueCounts}
                            totalCount={fieldInfo.totalCount}
                            objectType="lines"
                            feltHiddenValues={feltHiddenValues}
                            toggleFeltHiddenValue={
                              toggleFeltHiddenValue
                            }
                            feltSearchText={feltSearchText}
                            setHighlightedFelt={setHighlightedFelt}
                          />
                        );
                      },
                    )
                  ) : feltTab === 'ledninger' ? (
                    <p className="text-xs text-gray-500 italic pt-2">
                      Ingen ledningfelt tilgjengelig.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Ingen feltdata tilgjengelig.
              </p>
            )}
          </SidebarSection>

          {/* Analyse */}
          <SidebarSection
            title="Analyse"
            isOpen={openSection === 'analyse'}
            onToggle={() => toggleSection('analyse')}
          >
            <div className="space-y-4">
              {isKof && (
                <div className="p-2.5 rounded-lg border bg-white text-sm text-gray-600">
                  Analysefunksjoner er begrenset for KOF-filer (lite
                  attributtdata).
                </div>
              )}
              {/* Subsection: Attributter */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Attributter
                </h4>
                <p className="text-sm text-gray-500 italic">
                  Ingen valideringsfeil funnet.
                </p>
              </div>

              {/* Subsection: Feltvalidering */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Feltvalidering
                </h4>
                {isKof ? (
                  <p className="text-sm text-gray-500 italic">
                    Ikke tilgjengelig for KOF.
                  </p>
                ) : (
                  <FieldValidationControl />
                )}
              </div>

              {/* Subsection: Høydekontroll */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Høydekontroll (Z)
                </h4>
                <ZValidationControl />
              </div>

              {/* Subsection: Fall */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Profilanalyse
                </h4>
                {isKof ? (
                  <p className="text-sm text-gray-500 italic">
                    Ikke tilgjengelig for KOF.
                  </p>
                ) : (
                  <InclineAnalysisControl />
                )}
              </div>

              {/* Subsection: Topplok */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Topplok kontroll
                </h4>
                {isKof ? (
                  <p className="text-sm text-gray-500 italic">
                    Ikke tilgjengelig for KOF.
                  </p>
                ) : (
                  <TopplokControl />
                )}
              </div>

              {/* Subsection: Avvik */}
              <div>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Avviksdeteksjon
                </h4>
                {isKof ? (
                  <p className="text-sm text-gray-500 italic">
                    Ikke tilgjengelig for KOF.
                  </p>
                ) : (
                  <OutlierControl />
                )}
              </div>
            </div>
          </SidebarSection>
        </div>
      )}
    </div>
  );
}
