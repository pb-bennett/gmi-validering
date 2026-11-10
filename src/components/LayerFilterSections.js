'use client';

import React, { useMemo, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import fieldsData from '@/data/fields.json';
import { formatStatusChoice } from '@/lib/statusDomain.mjs';

const MISSING_TEMA_VALUE = '(Ingen verdi)';
const DEFAULT_CODE_LOOKUPS = {
  punktMap: new Map(fieldsData.find((f) => f.fieldKey === 'Tema_punkt')?.acceptableValues?.map((v) => [v.value, v.label]) || []),
  ledMap: new Map(fieldsData.find((f) => f.fieldKey === 'Tema_led')?.acceptableValues?.map((v) => [v.value, v.label]) || []),
};

// Both hosts own disclosure state only. All membership filters remain on the layer.
export function LayerTemaSection({
  layerId,
  layer,
  codeLookups = DEFAULT_CODE_LOOKUPS,
  dataset,
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

  const data = dataset ?? layer?.data;
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
    <div data-layer-tema={layerId} className="border-b border-gmi-border last:border-0">
      <button
        aria-expanded={isOpen}
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
    <div data-layer-field={fieldName} className="border-b border-gmi-border last:border-0">
      <button
        aria-expanded={isExpanded}
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
                    : fieldName === 'Status' ? formatStatusChoice(value) : value;
                const isMissing =
                  value === '(Mangler)' ||
                  value === 'null' ||
                  value === '';
                const isHidden = isValueHidden(value);

                return (
                  <tr
                    key={value}
                    data-filter-value={value}
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
export function LayerFeltSection({
  layerId,
  layer,
  isOpen,
  onToggle,
  setGlobalFeltActive,
  dataset,
  geometryTab,
  onGeometryTabChange,
}) {
  const [localTab, setLocalTab] = useState(() => useStore.getState().ui.layerDataTable?.activeTabByLayer?.[layerId] || 'punkter');
  const tab = geometryTab ?? localTab;
  const setTab = onGeometryTabChange ?? setLocalTab;
  const toggleLayerFeltHiddenValue = useStore(
    (state) => state.toggleLayerFeltHiddenValue,
  );
  const setHighlightedFelt = useStore(
    (state) => state.setHighlightedFelt,
  );

  const data = dataset ?? layer?.data;
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
      data-layer-felt={layerId}
      data-felt-geometry={tab}
      className="border-b last:border-0"
      style={{ borderColor: 'var(--gmi-border)' }}
    >
      <button
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen && geometryTab === undefined) {
            const state = useStore.getState();
            const table = state.ui.layerDataTable;
            const inspection = state.objectTableInspection;
            const geometry = table?.isOpen && table.layerId === layerId && inspection
              ? inspection.geometryScope === 'point' ? 'punkter' : 'ledninger'
              : table?.activeTabByLayer?.[layerId] || 'punkter';
            setTab(geometry);
          }
          onToggle();
          setGlobalFeltActive?.(true);
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
              aria-pressed={tab === 'punkter'}
              onClick={() => setTab('punkter')}
              className={`gmi-focus-ring flex-1 px-2 py-1 text-[10px] font-medium transition-colors ${tab === 'punkter' ? 'border-b-2 border-gmi-interactive text-gmi-navy' : 'text-gmi-text-subtle hover:bg-gmi-surface-soft'}`}
            >
              Punkter ({pointFieldCount})
            </button>
            <button
              aria-pressed={tab === 'ledninger'}
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
