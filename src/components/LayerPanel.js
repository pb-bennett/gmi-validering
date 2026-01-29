'use client';

import React, { useMemo, useState } from 'react';
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
function LayerAnalysisButtons({ layerId, layer }) {
  const setLayerAnalysisResults = useStore((state) => state.setLayerAnalysisResults);
  const toggleLayerAnalysisModal = useStore((state) => state.toggleLayerAnalysisModal);
  const setLayerZValidationResults = useStore((state) => state.setLayerZValidationResults);
  const toggleLayerZValidationModal = useStore((state) => state.toggleLayerZValidationModal);
  const toggleFieldValidation = useStore((state) => state.toggleFieldValidation);
  const toggleLayerHighlightAll = useStore((state) => state.toggleLayerHighlightAll);
  const inclineRequirementMode = useStore((state) => state.settings.inclineRequirementMode);

  const data = layer?.data;
  const isKof = data?.format === 'KOF';
  const analysisResults = layer?.analysis?.results || [];
  const zValidationResults = layer?.zValidation?.results;
  const highlightAll = layer?.highlightAll;

  const runInclineAnalysis = () => {
    if (!data) return;
    const results = analyzeIncline(data, { minInclineMode: inclineRequirementMode });
    setLayerAnalysisResults(layerId, results);
    toggleLayerAnalysisModal(layerId, true);
  };

  const runZValidation = () => {
    if (!data) return;
    const results = analyzeZValues(data);
    setLayerZValidationResults(layerId, results);
    toggleLayerZValidationModal(layerId, true);
  };

  const errorCount = analysisResults.filter((r) => r.status === 'error').length;
  const warningCount = analysisResults.filter((r) => r.status === 'warning').length;
  const zMissing = (zValidationResults?.summary?.missingPointObjects || 0) + 
                   (zValidationResults?.summary?.missingLineObjects || 0);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Layer highlight toggle */}
      <button
        onClick={() => toggleLayerHighlightAll(layerId)}
        className={`p-1.5 rounded transition-colors hover:bg-blue-100 relative group ${highlightAll ? 'bg-blue-100' : ''}`}
        title={highlightAll ? 'Skru av laghighlight' : 'Marker alt i laget'}
      >
        <svg className={`w-4 h-4 ${highlightAll ? 'text-blue-700' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2.09 6.26L20.5 9.27l-5.2 3.78 1.98 6.1L12 15.77 6.72 19.15l1.98-6.1-5.2-3.78 6.41-.01L12 3z" />
        </svg>
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-gray-800 text-white rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          Laghighlight
        </span>
      </button>

      {/* Profilanalyse */}
      <button
        onClick={analysisResults.length > 0 ? () => toggleLayerAnalysisModal(layerId, true) : runInclineAnalysis}
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
        disabled={isKof}
        title={isKof ? 'Ikke tilgjengelig for KOF' : (analysisResults.length > 0 ? 'Åpne profilanalyse' : 'Kjør profilanalyse')}
      >
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        {analysisResults.length > 0 && (errorCount > 0 || warningCount > 0) && (
          <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${errorCount > 0 ? 'bg-red-500' : 'bg-yellow-500'}`} />
        )}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-gray-800 text-white rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          Profilanalyse
        </span>
      </button>

      {/* Høydekontroll */}
      <button
        onClick={zValidationResults ? () => toggleLayerZValidationModal(layerId, true) : runZValidation}
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
        title={zValidationResults ? 'Åpne høydekontroll' : 'Kjør høydekontroll'}
      >
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        {zMissing > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-gray-800 text-white rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          Høydekontroll
        </span>
      </button>

      {/* Feltvalidering */}
      <button
        onClick={() => toggleFieldValidation(true)}
        className="p-1.5 rounded transition-colors hover:bg-blue-100 relative group"
        disabled={isKof}
        title={isKof ? 'Ikke tilgjengelig for KOF' : 'Feltvalidering'}
      >
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-gray-800 text-white rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          Feltvalidering
        </span>
      </button>
    </div>
  );
}

/**
 * Collapsible section for Tema filtering within a layer
 */
function LayerTemaSection({ layerId, layer, codeLookups }) {
  const [isOpen, setIsOpen] = useState(false);
  const setHighlightedCode = useStore((state) => state.setHighlightedCode);
  const setHighlightedType = useStore((state) => state.setHighlightedType);
  const toggleLayerHiddenCode = useStore((state) => state.toggleLayerHiddenCode);
  const toggleLayerHiddenType = useStore((state) => state.toggleLayerHiddenType);

  const data = layer?.data;
  const hiddenCodes = layer?.hiddenCodes || [];
  const hiddenTypes = layer?.hiddenTypes || [];

  // Calculate tema stats for this layer
  const temaStats = useMemo(() => {
    if (!data) return { points: {}, lines: {} };

    const stats = { points: {}, lines: {} };

    data.points?.forEach((p) => {
      const code = p.attributes?.S_FCODE || 'UKJENT';
      if (!stats.points[code]) stats.points[code] = { count: 0, types: {} };
      stats.points[code].count++;
      const typeVal = p.attributes?.Type || '(Mangler Type)';
      stats.points[code].types[typeVal] = (stats.points[code].types[typeVal] || 0) + 1;
    });

    data.lines?.forEach((l) => {
      const code = l.attributes?.S_FCODE || 'UKJENT';
      if (!stats.lines[code]) stats.lines[code] = { count: 0, types: {} };
      stats.lines[code].count++;
      const typeVal = l.attributes?.Type || '(Mangler Type)';
      stats.lines[code].types[typeVal] = (stats.lines[code].types[typeVal] || 0) + 1;
    });

    return stats;
  }, [data]);

  const pointCount = Object.keys(temaStats.points).length;
  const lineCount = Object.keys(temaStats.lines).length;
  const totalHidden = hiddenCodes.length;

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
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
          className={`transform transition-transform duration-200 text-xs ${isOpen ? 'rotate-180' : ''}`}
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
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">Punkter</h4>
              {pointCount > 0 && (
                <button
                  onClick={() => {
                    const codes = Object.keys(temaStats.points);
                    const allHidden = codes.every((c) => hiddenCodes.includes(c));
                    codes.forEach((code) => {
                      if (allHidden ? hiddenCodes.includes(code) : !hiddenCodes.includes(code)) {
                        toggleLayerHiddenCode(layerId, code);
                      }
                    });
                  }}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {Object.keys(temaStats.points).every((c) => hiddenCodes.includes(c)) ? 'Vis alle' : 'Skjul alle'}
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
                        onClick={() => toggleLayerHiddenCode(layerId, code)}
                      >
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => {}}
                            className="h-2.5 w-2.5"
                          />
                          <span className="font-mono font-bold">{code}</span>
                          <span className="text-gray-500 truncate max-w-20">{label || 'Ukjent'}</span>
                        </div>
                        <span className="text-gray-500">{data.count}</span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">Ingen punkter</p>
            )}
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase">Ledninger</h4>
              {lineCount > 0 && (
                <button
                  onClick={() => {
                    const codes = Object.keys(temaStats.lines);
                    const allHidden = codes.every((c) => hiddenCodes.includes(c));
                    codes.forEach((code) => {
                      if (allHidden ? hiddenCodes.includes(code) : !hiddenCodes.includes(code)) {
                        toggleLayerHiddenCode(layerId, code);
                      }
                    });
                  }}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  {Object.keys(temaStats.lines).every((c) => hiddenCodes.includes(c)) ? 'Vis alle' : 'Skjul alle'}
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
                        onClick={() => toggleLayerHiddenCode(layerId, code)}
                      >
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => {}}
                            className="h-2.5 w-2.5"
                          />
                          <span className="font-mono font-bold">{code}</span>
                          <span className="text-gray-500 truncate max-w-20">{label || 'Ukjent'}</span>
                        </div>
                        <span className="text-gray-500">{data.count}</span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">Ingen ledninger</p>
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

  const allHidden = sortedValues.every(([value]) => isValueHidden(value));
  const someHidden = sortedValues.some(([value]) => isValueHidden(value));

  const toggleAllValues = (e) => {
    e.stopPropagation();
    if (allHidden) {
      sortedValues.forEach(([value]) => {
        if (isValueHidden(value)) {
          toggleLayerFeltHiddenValue(layerId, fieldName, value, objectType);
        }
      });
    } else {
      sortedValues.forEach(([value]) => {
        if (!isValueHidden(value)) {
          toggleLayerFeltHiddenValue(layerId, fieldName, value, objectType);
        }
      });
    }
  };

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
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
                {sortedValues.filter(([v]) => isValueHidden(v)).length} skjult
              </span>
            )}
          </div>
          <div
            className="text-[10px] whitespace-nowrap"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {sortedValues.length} {sortedValues.length === 1 ? 'verdi' : 'verdier'}
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
                const percentage = ((count / totalCount) * 100).toFixed(1);
                const displayValue =
                  value === '(Mangler)' || value === 'null' || value === ''
                    ? '(Mangler verdi)'
                    : value;
                const isMissing = value === '(Mangler)' || value === 'null' || value === '';
                const isHidden = isValueHidden(value);

                return (
                  <tr
                    key={value}
                    className={`hover:bg-gray-100 cursor-pointer ${isHidden ? 'opacity-50' : ''}`}
                    onClick={() =>
                      toggleLayerFeltHiddenValue(layerId, fieldName, value, objectType)
                    }
                    onMouseEnter={() =>
                      setHighlightedFelt &&
                      setHighlightedFelt(fieldName, value, objectType)
                    }
                    onMouseLeave={() =>
                      setHighlightedFelt && setHighlightedFelt(null, null, null)
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
                    <td className={`px-2 py-1 ${isMissing ? 'text-red-600 italic' : 'text-gray-700'}`}>
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
function LayerFeltSection({ layerId, layer }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('punkter');
  const toggleLayerFeltHiddenValue = useStore((state) => state.toggleLayerFeltHiddenValue);
  const setHighlightedFelt = useStore((state) => state.setHighlightedFelt);

  const data = layer?.data;
  const feltHiddenValues = layer?.feltHiddenValues || [];

  // Calculate field analysis for this layer
  const fieldAnalysis = useMemo(() => {
    if (!data) return { points: { fieldOrder: [], fields: {} }, lines: { fieldOrder: [], fields: {} } };

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
            analysis.points.fields[fieldName] = { valueCounts: {}, totalCount: 0 };
          }
          const value = item.attributes[fieldName];
          const valueKey = value === null || value === undefined || value === '' ? '(Mangler)' : String(value);
          if (!analysis.points.fields[fieldName].valueCounts[valueKey]) {
            analysis.points.fields[fieldName].valueCounts[valueKey] = 0;
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
            analysis.lines.fields[fieldName] = { valueCounts: {}, totalCount: 0 };
          }
          const value = item.attributes[fieldName];
          const valueKey = value === null || value === undefined || value === '' ? '(Mangler)' : String(value);
          if (!analysis.lines.fields[fieldName].valueCounts[valueKey]) {
            analysis.lines.fields[fieldName].valueCounts[valueKey] = 0;
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
    <div className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 transition-colors text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
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
          className={`transform transition-transform duration-200 text-xs ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="p-2 bg-gray-50/50 space-y-2">
          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
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
                const fieldInfo = fieldAnalysis.points.fields[fieldName];
                return (
                  <LayerFeltValueSection
                    key={`points-${fieldName}`}
                    fieldName={fieldName}
                    valueCounts={fieldInfo.valueCounts}
                    totalCount={fieldInfo.totalCount}
                    objectType="points"
                    layerId={layerId}
                    feltHiddenValues={feltHiddenValues}
                    toggleLayerFeltHiddenValue={toggleLayerFeltHiddenValue}
                    setHighlightedFelt={setHighlightedFelt}
                  />
                );
              })}
            {tab === 'ledninger' &&
              fieldAnalysis.lines.fieldOrder.map((fieldName) => {
                const fieldInfo = fieldAnalysis.lines.fields[fieldName];
                return (
                  <LayerFeltValueSection
                    key={`lines-${fieldName}`}
                    fieldName={fieldName}
                    valueCounts={fieldInfo.valueCounts}
                    totalCount={fieldInfo.totalCount}
                    objectType="lines"
                    layerId={layerId}
                    feltHiddenValues={feltHiddenValues}
                    toggleLayerFeltHiddenValue={toggleLayerFeltHiddenValue}
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
  const expandedLayerId = useStore((state) => state.ui.expandedLayerId);
  const setExpandedLayer = useStore((state) => state.setExpandedLayer);
  const toggleLayerVisibility = useStore((state) => state.toggleLayerVisibility);
  const removeLayer = useStore((state) => state.removeLayer);

  if (!layer) return null;

  const isExpanded = expandedLayerId === layerId;
  const data = layer.data;
  const pointCount = data?.points?.length || 0;
  const lineCount = data?.lines?.length || 0;

  return (
    <div
      className={`border-b transition-colors ${!layer.visible ? 'opacity-60' : ''}`}
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
          <div className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
            {layer.name}
          </div>
          <div className="text-[10px] text-gray-500">
            {pointCount} punkt, {lineCount} ledn.
          </div>
        </div>

        {/* Expand indicator */}
        <span
          className={`transform transition-transform duration-200 text-xs ${isExpanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Fjern lag "${layer.name}"?`)) {
              removeLayer(layerId);
            }
          }}
          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
          title="Fjern lag"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t bg-gray-50/30" style={{ borderColor: 'var(--color-border)' }}>
          {/* Analysis buttons row */}
          <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-[10px] text-gray-500">Analyse</span>
            <LayerAnalysisButtons layerId={layerId} layer={layer} />
          </div>

          {/* Tema section */}
          <LayerTemaSection layerId={layerId} layer={layer} codeLookups={codeLookups} />

          {/* Felt section */}
          <LayerFeltSection layerId={layerId} layer={layer} />
        </div>
      )}
    </div>
  );
}
