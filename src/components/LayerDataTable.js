'use client';

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import useStore from '@/lib/store';
import fieldsData from '@/data/fields.json';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { resolveExactObjectInspectionRows } from '@/lib/objectTableInspection';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth } from '@/lib/objectTablePresentation';

const ROW_HEIGHT = 28;
const MAX_COLUMN_WIDTH = 180;
const MIN_COLUMN_WIDTH = 50;

function getFieldLabel(fieldName) {
  const fieldDef = fieldsData.find((f) => f.fieldKey === fieldName);
  return fieldDef?.label || fieldName;
}

function estimateColumnWidth(fieldName, label) {
  // Estimate width based on label length, with min/max bounds
  const charWidth = 7;
  const padding = 24;
  const labelWidth = label.length * charWidth + padding;
  return Math.min(
    MAX_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, labelWidth),
  );
}

function normalizeColumnOrder(fields, savedOrder) {
  const base = Array.isArray(savedOrder) ? savedOrder : [];
  const filtered = base.filter((field) => fields.includes(field));
  const remaining = fields.filter(
    (field) => !filtered.includes(field),
  );
  return [...filtered, ...remaining];
}

// Memoized cell component to prevent re-renders
const DataCell = React.memo(function DataCell({ value, missingLabel = '-' }) {
  const displayValue = value === null || value === undefined || value === ''
    ? missingLabel
    : String(value);
  const isMissing = displayValue === missingLabel;
  const needsTooltip = displayValue.length > 25;

  return (
    <span
      className={`block truncate ${isMissing ? 'text-gray-400 italic' : ''}`}
      title={needsTooltip ? displayValue : undefined}
    >
      {displayValue}
    </span>
  );
});

// Memoized zoom button
const ZoomButton = React.memo(function ZoomButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 rounded text-sm transition-transform hover:scale-110 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--color-page-bg)',
        color: 'var(--color-primary)',
      }}
      title="Zoom til"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  );
});

export default function LayerDataTable() {
  const layers = useStore((state) => state.layers);
  const layerDataTable = useStore((state) => state.ui.layerDataTable);
  const inspection = useStore((state) => state.objectTableInspection);
  const setLayerDataTableTab = useStore(
    (state) => state.setLayerDataTableTab,
  );
  const setLayerDataTableSorting = useStore(
    (state) => state.setLayerDataTableSorting,
  );
  const setLayerDataTableColumnOrder = useStore(
    (state) => state.setLayerDataTableColumnOrder,
  );
  const closeLayerDataTable = useStore(
    (state) => state.closeLayerDataTable,
  );
  const setObjectTableInspectionView = useStore((state) => state.setObjectTableInspectionView);
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature,
  );
  const setHighlightedFeatureIds = useStore(
    (state) => state.setHighlightedFeatureIds,
  );
  const resetLayerFilters = useStore(
    (state) => state.resetLayerFilters,
  );

  const tableContainerRef = useRef(null);

  const isOpen = layerDataTable?.isOpen;
  const layerId = layerDataTable?.layerId;
  const layer = layerId ? layers[layerId] : null;
  const isExactInspection = ['exact-object-set', 'contextual-object-set'].includes(inspection?.kind);
  const isContextualInspection = inspection?.kind === 'contextual-object-set';
  const [contextualSorting, setContextualSorting] = useState([]);

  // Get filter state for this layer (memoized to prevent re-renders)
  const hiddenCodes = useMemo(
    () => layer?.hiddenCodes || [],
    [layer?.hiddenCodes],
  );
  const hiddenTypes = useMemo(
    () => layer?.hiddenTypes || [],
    [layer?.hiddenTypes],
  );
  const feltHiddenValues = useMemo(
    () => layer?.feltHiddenValues || [],
    [layer?.feltHiddenValues],
  );
  const hasActiveFilters =
    hiddenCodes.length > 0 ||
    hiddenTypes.length > 0 ||
    feltHiddenValues.length > 0;

  const exactRows = useMemo(
    () => isExactInspection ? resolveExactObjectInspectionRows({ layer, inspection }) : null,
    [isExactInspection, layer, inspection],
  );
  const contextualScopeRows = useMemo(
    () => isContextualInspection
      ? resolveExactObjectInspectionRows({ layer, inspection: { ...inspection, activeView: 'scope' } }) || []
      : [],
    [isContextualInspection, layer, inspection],
  );

  useEffect(() => {
    if (isOpen && (!layer || (isExactInspection && exactRows === null))) {
      closeLayerDataTable();
    }
  }, [isOpen, layer, isExactInspection, exactRows, closeLayerDataTable]);

  useEffect(() => setContextualSorting([]), [inspection?.id]);

  useEffect(() => {
    return () => {
      setHighlightedFeatureIds(null);
    };
  }, [setHighlightedFeatureIds]);

  const activeTab = isExactInspection
    ? inspection.geometryScope === 'point' ? 'punkter' : 'ledninger'
    : layerId && layerDataTable?.activeTabByLayer?.[layerId]
      ? layerDataTable.activeTabByLayer[layerId]
      : 'punkter';

  // Memoize raw items with stable reference
  const rawItems = useMemo(() => {
    if (isExactInspection) return exactRows || [];
    if (!layer?.data) return [];
    return activeTab === 'punkter'
      ? layer.data.points || []
      : layer.data.lines || [];
  }, [layer?.data, activeTab, isExactInspection, exactRows]);

  // Helper to check if an item is hidden by filters
  const isItemHidden = useCallback(
    (item, objectType) => {
      const attrs = item.attributes || {};
      const rawFcode = attrs.S_FCODE;
      const fcode =
        rawFcode === null ||
        rawFcode === undefined ||
        String(rawFcode).trim() === ''
          ? '(Ingen verdi)'
          : String(rawFcode);
      const typeVal = attrs.Type || '(Mangler Type)';

      // Check hiddenCodes
      if (hiddenCodes.includes(fcode)) {
        return true;
      }

      // Check hiddenTypes
      const isHiddenByType = hiddenTypes.some(
        (ht) =>
          ht.type === typeVal &&
          (ht.code === null || ht.code === fcode),
      );
      if (isHiddenByType) {
        return true;
      }

      // Check feltHiddenValues
      const mappedObjectType =
        objectType === 'punkter' ? 'points' : 'lines';
      const isHiddenByFelt = feltHiddenValues.some((hidden) => {
        if (hidden.objectType !== mappedObjectType) return false;
        const featureValue = attrs[hidden.fieldName];
        const normalizedValue =
          featureValue === null ||
          featureValue === undefined ||
          featureValue === ''
            ? '(Mangler)'
            : String(featureValue);
        return normalizedValue === hidden.value;
      });
      if (isHiddenByFelt) {
        return true;
      }

      return false;
    },
    [hiddenCodes, hiddenTypes, feltHiddenValues],
  );

  // Count visible objects per tab so we can auto-switch when one tab is
  // completely filtered away.
  const visibleCountByTab = useMemo(() => {
    const points = layer?.data?.points || [];
    const lines = layer?.data?.lines || [];

    if (!hasActiveFilters) {
      return {
        punkter: points.length,
        ledninger: lines.length,
      };
    }

    const visiblePoints = points.reduce(
      (count, item) =>
        count + (isItemHidden(item, 'punkter') ? 0 : 1),
      0,
    );
    const visibleLines = lines.reduce(
      (count, item) =>
        count + (isItemHidden(item, 'ledninger') ? 0 : 1),
      0,
    );

    return {
      punkter: visiblePoints,
      ledninger: visibleLines,
    };
  }, [layer?.data, hasActiveFilters, isItemHidden]);

  useEffect(() => {
    if (isExactInspection || !isOpen || !layerId || !hasActiveFilters) return;

    const activeCount = visibleCountByTab[activeTab] || 0;
    if (activeCount > 0) return;

    const fallbackTab =
      activeTab === 'punkter' ? 'ledninger' : 'punkter';
    const fallbackCount = visibleCountByTab[fallbackTab] || 0;

    if (fallbackCount > 0) {
      setLayerDataTableTab(layerId, fallbackTab);
    }
  }, [
    isOpen,
    layerId,
    hasActiveFilters,
    activeTab,
    visibleCountByTab,
    setLayerDataTableTab,
    isExactInspection,
  ]);

  // Add __index and filter hidden items
  const allItemsWithIndex = useMemo(() => {
    if (isExactInspection) return rawItems;
    return rawItems.map((item, index) => ({
      ...item,
      __index: index,
    }));
  }, [rawItems, isExactInspection]);

  // Filtered items (respecting sidebar filters)
  const items = useMemo(() => {
    if (isExactInspection || !hasActiveFilters) {
      return allItemsWithIndex;
    }
    return allItemsWithIndex.filter(
      (item) => !isItemHidden(item, activeTab),
    );
  }, [allItemsWithIndex, hasActiveFilters, isItemHidden, activeTab, isExactInspection]);

  const totalCount = allItemsWithIndex.length;
  const filteredCount = items.length;
  const hiddenCount = totalCount - filteredCount;

  // Defer field calculation for large datasets
  const fields = useMemo(() => {
    const requiredFields = isContextualInspection
      ? [inspection.presentation.temaColumn, inspection.presentation.fieldColumn]
      : [];
    if (items.length === 0) return [...new Set(requiredFields)];

    const fieldSet = new Set();
    const fieldHasData = {};

    // Sample first 100 items for performance, then verify
    const sampleSize = Math.min(items.length, 100);
    for (let i = 0; i < sampleSize; i++) {
      const attrs = items[i].attributes || {};
      Object.keys(attrs).forEach((key) => {
        fieldSet.add(key);
        const value = attrs[key];
        if (value !== null && value !== undefined && value !== '') {
          fieldHasData[key] = true;
        }
      });
    }

    // For remaining items, only check if they have data (not for new fields)
    for (let i = sampleSize; i < items.length; i++) {
      const attrs = items[i].attributes || {};
      Object.keys(attrs).forEach((key) => {
        if (fieldSet.has(key) && !fieldHasData[key]) {
          const value = attrs[key];
          if (value !== null && value !== undefined && value !== '') {
            fieldHasData[key] = true;
          }
        }
      });
    }

    const presentFields = Array.from(fieldSet).filter(
      (field) => fieldHasData[field],
    );

    const sfcodeIndex = presentFields.indexOf('S_FCODE');
    if (sfcodeIndex > -1) {
      presentFields.splice(sfcodeIndex, 1);
      presentFields.unshift('S_FCODE');
    }

    return [...new Set([...presentFields, ...requiredFields])];
  }, [items, isContextualInspection, inspection]);

  const savedOrder = useMemo(() => {
    return layerId &&
      layerDataTable?.columnOrderByLayer?.[layerId]?.[activeTab]
      ? layerDataTable.columnOrderByLayer[layerId][activeTab]
      : [];
  }, [layerId, layerDataTable?.columnOrderByLayer, activeTab]);

  const orderedFields = useMemo(() => {
    if (!isContextualInspection) return normalizeColumnOrder(fields, savedOrder);
    const { temaColumn, fieldColumn } = inspection.presentation;
    const contextual = temaColumn === fieldColumn ? [temaColumn] : [temaColumn, fieldColumn];
    return [...contextual, '__validator_resultat', ...fields.filter((field) => !contextual.includes(field))];
  }, [fields, savedOrder, isContextualInspection, inspection]);

  useEffect(() => {
    if (isExactInspection || !layerId || fields.length === 0) return;
    const normalized = normalizeColumnOrder(fields, savedOrder);
    const sameLength = normalized.length === savedOrder.length;
    const sameOrder =
      sameLength &&
      normalized.every((field, idx) => field === savedOrder[idx]);
    if (!sameOrder) {
      setLayerDataTableColumnOrder(layerId, activeTab, normalized);
    }
  }, [
    activeTab,
    fields,
    layerId,
    savedOrder,
    setLayerDataTableColumnOrder, isExactInspection,
  ]);

  const sorting = useMemo(() => {
    if (isContextualInspection) return contextualSorting;
    return layerId &&
      layerDataTable?.sortingByLayer?.[layerId]?.[activeTab]
      ? layerDataTable.sortingByLayer[layerId][activeTab]
      : [];
  }, [layerId, layerDataTable?.sortingByLayer, activeTab, isContextualInspection, contextualSorting]);

  useEffect(() => {
    if (isExactInspection || !layerId) return;
    const validSorting = Array.isArray(sorting)
      ? sorting.filter((sort) => fields.includes(sort.id))
      : [];
    if (validSorting.length !== sorting.length) {
      setLayerDataTableSorting(layerId, activeTab, validSorting);
    }
  }, [activeTab, fields, layerId, sorting, setLayerDataTableSorting, isExactInspection]);

  const [draggedField, setDraggedField] = useState(null);

  const handleDragStart = useCallback((field) => {
    setDraggedField(field);
  }, []);

  const handleDrop = useCallback(
    (targetField) => {
      if (!draggedField || draggedField === targetField || !layerId) {
        setDraggedField(null);
        return;
      }

      const nextOrder = [...orderedFields];
      const draggedIndex = nextOrder.indexOf(draggedField);
      const targetIndex = nextOrder.indexOf(targetField);

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedField(null);
        return;
      }

      nextOrder.splice(draggedIndex, 1);
      nextOrder.splice(targetIndex, 0, draggedField);
      if (!isExactInspection) setLayerDataTableColumnOrder(layerId, activeTab, nextOrder);
      setDraggedField(null);
    },
    [
      draggedField,
      layerId,
      orderedFields,
      activeTab,
      setLayerDataTableColumnOrder, isExactInspection,
    ],
  );

  const handleZoomTo = useCallback(
    (item, index, objectType) => {
      const featureId = `${objectType}-${layerId}-${index}`;
      let coords = null;

      if (item.coordinates && item.coordinates.length > 0) {
        if (objectType === 'punkter') {
          coords = item.coordinates[0];
        } else {
          const midIdx = Math.floor(item.coordinates.length / 2);
          coords = item.coordinates[midIdx];
        }
      }

      if (
        !coords ||
        coords.y === undefined ||
        coords.x === undefined
      ) {
        return;
      }

      viewObjectInMap(featureId, [coords.y, coords.x], 20, {
        layerId,
        objectType: objectType === 'ledninger' ? 'pipe' : 'point',
        lineIndex: objectType === 'ledninger' ? index : undefined,
        pointIndex: objectType === 'punkter' ? index : undefined,
      });
    },
    [layerId, viewObjectInMap],
  );

  const handleRowClick = useCallback(
    (index, objectType) => {
      const featureId = `${objectType}-${layerId}-${index}`;
      setHighlightedFeature(featureId);
    },
    [layerId, setHighlightedFeature],
  );

  const handleRowHoverStart = useCallback(
    (index, objectType) => {
      const featureId = `${objectType}-${layerId}-${index}`;
      setHighlightedFeatureIds(new Set([featureId]));
    },
    [layerId, setHighlightedFeatureIds],
  );

  const handleRowHoverEnd = useCallback(() => {
    setHighlightedFeatureIds(null);
  }, [setHighlightedFeatureIds]);

  // Calculate column widths based on field names
  const columnWidths = useMemo(() => {
    const widths = { zoom: 36 };
    orderedFields.forEach((field) => {
      if (field === '__validator_resultat') {
        widths[field] = 86;
        return;
      }
      const label = getFieldLabel(field);
      if (isContextualInspection && field === inspection.presentation.fieldColumn) {
        widths[field] = getContextualColumnWidth({ label, values: contextualScopeRows.map((row) => row.attributes?.[field]), kind: 'field' });
      } else if (isContextualInspection && field === inspection.presentation.temaColumn) {
        widths[field] = getContextualColumnWidth({ label, values: contextualScopeRows.map((row) => row.attributes?.[field]), kind: 'tema' });
      } else if (isContextualInspection) {
        widths[field] = getContextualOrdinaryColumnWidth({ values: contextualScopeRows.map((row) => row.attributes?.[field]) });
      } else {
        widths[field] = estimateColumnWidth(field, label);
      }
    });
    return widths;
  }, [orderedFields, isContextualInspection, inspection, contextualScopeRows]);

  const columns = useMemo(() => {
    const zoomColumn = {
      id: 'zoom',
      header: '',
      size: 36,
      cell: ({ row }) => (
        <ZoomButton
          onClick={(e) => {
            e.stopPropagation();
            handleZoomTo(
              row.original,
              row.original.__index,
              activeTab,
            );
          }}
        />
      ),
    };

    const dataColumns = orderedFields.map((field) => ({
      id: field,
      accessorFn: (row) => field === '__validator_resultat' ? row.__contextualResult : row.attributes?.[field],
      header: field === '__validator_resultat' ? 'Resultat' : getFieldLabel(field),
      size: columnWidths[field] || 80,
      cell: (info) => field === '__validator_resultat'
        ? <span className={`font-medium ${info.getValue() === 'FAIL' ? 'text-red-700' : info.getValue() === 'CHECK' ? 'text-amber-700' : 'text-green-700'}`}>{info.getValue() === 'FAIL' ? 'Feil' : info.getValue() === 'CHECK' ? 'Sjekk' : 'Pass'}</span>
        : <DataCell value={info.getValue()} missingLabel={isContextualInspection && field === inspection.presentation.fieldColumn ? 'Mangler' : '-'} />,
      meta: {
        isFixed: field === 'S_FCODE',
        pinned: isContextualInspection && (field === inspection.presentation.temaColumn || field === inspection.presentation.fieldColumn),
        contextualField: isContextualInspection && field === inspection.presentation.fieldColumn,
        contextualOrdinary: isContextualInspection && field !== '__validator_resultat' && field !== inspection.presentation.temaColumn && field !== inspection.presentation.fieldColumn,
      },
    }));

    return [zoomColumn, ...dataColumns];
  }, [activeTab, orderedFields, columnWidths, handleZoomTo, isContextualInspection, inspection]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      if (!layerId) return;
      const nextSorting =
        typeof updater === 'function' ? updater(sorting) : updater;
      if (isContextualInspection) setContextualSorting(nextSorting);
      else setLayerDataTableSorting(layerId, activeTab, nextSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${layerId}:${activeTab}:${row.__index}`,
  });

  const { rows } = table.getRowModel();

  // Virtual row handling
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  if (!isOpen || !layer) return null;

  // Calculate total table width for horizontal scrolling
  const totalWidth = Object.values(columnWidths).reduce(
    (a, b) => a + b,
    0,
  );
  const stickyLeftFor = (columnId) => {
    if (columnId === 'zoom') return 0;
    const position = orderedFields.indexOf(columnId);
    if (position < 0) return undefined;
    const column = columns.find((entry) => entry.id === columnId);
    if (!column?.meta?.pinned && !column?.meta?.isFixed) return undefined;
    if (!isContextualInspection) return 36;
    return 36 + orderedFields.slice(0, position)
      .filter((field) => columns.find((entry) => entry.id === field)?.meta?.pinned)
      .reduce((sum, field) => sum + (columnWidths[field] || 80), 0);
  };

  return (
    <div
      className="flex flex-col h-full border-t"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
        style={{
          backgroundColor: 'var(--color-page-bg)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="text-[11px] font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Datatabell
          </span>
          {isExactInspection && (
            <span className="text-[10px] max-w-72 truncate" style={{ color: 'var(--color-text-secondary)' }} title={inspection.context.reason}>
              Objektutvalg: {inspection.context.title}{inspection.context.reason ? ` · ${inspection.context.reason}` : ''}
            </span>
          )}
          <span
            className="text-[10px] max-w-50 truncate"
            style={{ color: 'var(--color-text-secondary)' }}
            title={layer.name}
          >
            {layer.name}
          </span>
        </div>

        {!isExactInspection && <div className="flex items-center gap-0.5">
          <button
            onClick={() => setLayerDataTableTab(layerId, 'punkter')}
            className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
            style={{
              backgroundColor:
                activeTab === 'punkter'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'punkter'
                  ? 'white'
                  : 'var(--color-text-secondary)',
            }}
          >
            Punkter
          </button>
          <button
            onClick={() => setLayerDataTableTab(layerId, 'ledninger')}
            className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
            style={{
              backgroundColor:
                activeTab === 'ledninger'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'ledninger'
                  ? 'white'
                  : 'var(--color-text-secondary)',
            }}
          >
            Ledninger
          </button>
        </div>
        }

        {isContextualInspection && inspection.focusIndices.length !== inspection.scopeIndices.length && (
          <div className="flex items-center rounded border border-slate-200 p-0.5 text-[10px]" aria-label="Vis objektutvalg">
            {[['focus', 'Utvalg', inspection.focusIndices.length], ['scope', 'Alle', inspection.scopeIndices.length]].map(([view, label, count]) => (
              <button key={view} type="button" onClick={() => setObjectTableInspectionView(view)} aria-pressed={inspection.activeView === view}
                className="rounded px-1.5 py-0.5 font-medium" style={{ backgroundColor: inspection.activeView === view ? 'var(--color-primary)' : 'transparent', color: inspection.activeView === view ? 'white' : 'var(--color-text-secondary)' }}>
                {label} {count}
              </button>
            ))}
          </div>
        )}

        {/* Filter status */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {isExactInspection ? (
              <span>{totalCount} {activeTab === 'punkter' ? 'punkter' : 'ledninger'}</span>
            ) : hasActiveFilters ? (
              <>
                <span style={{ color: 'var(--color-primary)' }}>
                  {filteredCount}
                </span>
                <span> av {totalCount}</span>
                <span className="text-gray-400">
                  {' '}
                  ({hiddenCount} skjult)
                </span>
              </>
            ) : (
              <span>
                {totalCount}{' '}
                {activeTab === 'punkter' ? 'punkter' : 'ledninger'}
              </span>
            )}
          </span>
          {!isExactInspection && hasActiveFilters && (
            <button
              onClick={() => resetLayerFilters(layerId)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors hover:bg-blue-100"
              style={{ color: 'var(--color-primary)' }}
              title="Nullstill alle filtre"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Nullstill</span>
            </button>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={closeLayerDataTable}
          className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors hover:bg-gray-200"
          style={{
            color: 'var(--color-text-secondary)',
          }}
        >
          ✕
        </button>
      </div>

      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Sticky header */}
          <div
            className="sticky top-0 z-20 flex"
            style={{ backgroundColor: 'var(--color-page-bg)' }}
          >
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header, index) => {
                const isZoom = index === 0;
                const isFixed = header.column.columnDef.meta?.isFixed || header.column.columnDef.meta?.pinned;
                const headerId = header.column.id;
                const width = columnWidths[headerId] || 80;
                const stickyLeft = stickyLeftFor(headerId);

                return (
                  <div
                    key={header.id}
                    draggable={!isZoom && !isContextualInspection}
                    onDragStart={() => !isContextualInspection && handleDragStart(headerId)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(headerId)}
                    onClick={
                      isZoom
                        ? undefined
                        : header.column.getToggleSortingHandler()
                    }
                    className={`px-1.5 py-1 text-left text-[10px] font-medium select-none border-b shrink-0 ${
                      isZoom
                        ? 'text-center'
                        : 'cursor-pointer hover:bg-gray-100'
                    } ${isZoom || isFixed ? 'sticky z-30' : ''}`}
                    style={{
                      backgroundColor: 'var(--color-page-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                      width,
                      minWidth: width,
                      maxWidth: width,
                      left: stickyLeft,
                      boxShadow: isFixed
                        ? '2px 0 4px -2px rgba(0,0,0,0.1)'
                        : undefined,
                    }}
                  >
                    <div className={`flex items-center gap-0.5 ${(header.column.columnDef.meta?.contextualField || header.column.columnDef.meta?.contextualOrdinary) ? 'items-start' : 'truncate'}`}>
                      <span className={(header.column.columnDef.meta?.contextualField || header.column.columnDef.meta?.contextualOrdinary) ? 'line-clamp-2 leading-3' : 'truncate'} title={(header.column.columnDef.meta?.contextualField || header.column.columnDef.meta?.contextualOrdinary) ? String(header.column.columnDef.header) : undefined}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      {header.column.getIsSorted() && (
                        <span
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {header.column.getIsSorted() === 'asc'
                            ? '↑'
                            : '↓'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }),
            )}
          </div>

          {/* Virtualized body */}
          <div
            style={{
              height: totalSize,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  onClick={() =>
                    handleRowClick(row.original.__index, activeTab)
                  }
                  onMouseEnter={() =>
                    handleRowHoverStart(
                      row.original.__index,
                      activeTab,
                    )
                  }
                  onMouseLeave={handleRowHoverEnd}
                  className="flex cursor-pointer hover:bg-blue-50 border-b"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {row.getVisibleCells().map((cell, index) => {
                    const isZoom = index === 0;
                    const isFixed = cell.column.columnDef.meta?.isFixed || cell.column.columnDef.meta?.pinned;
                    const cellId = cell.column.id;
                    const width = columnWidths[cellId] || 80;
                    const stickyLeft = stickyLeftFor(cellId);

                    return (
                      <div
                        key={cell.id}
                        className={`px-1.5 flex items-center text-[10px] shrink-0 ${
                          isZoom ? 'justify-center' : ''
                        } ${isZoom || isFixed ? 'sticky z-10' : ''}`}
                        style={{
                          backgroundColor: isZoom || isFixed
                            ? cell.column.columnDef.meta?.contextualField
                              ? row.original.__contextualResult === 'FAIL' ? '#fef2f2' : row.original.__contextualResult === 'CHECK' ? '#fffbeb' : '#f0fdf4'
                              : 'var(--color-card)'
                            : 'transparent',
                          width,
                          minWidth: width,
                          maxWidth: width,
                          left: stickyLeft,
                          height: ROW_HEIGHT,
                          boxShadow: isFixed
                            ? '2px 0 4px -2px rgba(0,0,0,0.1)'
                            : undefined,
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-end px-3 py-1 border-t text-[9px] shrink-0"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
          backgroundColor: 'var(--color-page-bg)',
        }}
      >
        <span className="text-gray-400">
          Dra kolonner for å endre rekkefølge • Klikk for å sortere
        </span>
      </div>
    </div>
  );
}
