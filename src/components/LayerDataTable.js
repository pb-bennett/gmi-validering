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
import { ArrowCounterClockwiseIcon, MagnifyingGlassIcon, MagnifyingGlassPlusIcon, XIcon } from '@phosphor-icons/react';
import { normalizeTableSearchQuery, filterTableSearchRows, segmentTableSearchText, tableSearchScalarText } from '@/lib/tableSearch';
import { resolveExactObjectInspectionRows } from '@/lib/objectTableInspection';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth, getDiagnosticColumnOrder, createLayerDataTableColumns } from '@/lib/objectTablePresentation';

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

function visibleHeaderLabel(label, width, multiline = false) {
  const text = String(label || '');
  const capacity = Math.max(1, Math.floor((width - 12) / 7) * (multiline ? 2 : 1));
  return text.length > capacity ? `${text.slice(0, Math.max(0, capacity - 1))}…` : text;
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
const DataCell = React.memo(function DataCell({ value, missingLabel = '-', searchQuery = '' }) {
  const displayValue = value === null || value === undefined || value === ''
    ? missingLabel
    : String(value);
  const isMissing = displayValue === missingLabel;
  const needsTooltip = displayValue.length > 25;

  return (
    <span
      className={`block truncate ${isMissing ? 'text-gmi-text-subtle italic' : ''}`}
      title={needsTooltip ? displayValue : undefined}
    >
      {!isMissing && tableSearchScalarText(value) !== null && searchQuery
        ? segmentTableSearchText(displayValue, searchQuery).map((segment, index) => segment.match
          ? <mark key={index} className="rounded-sm bg-gmi-cyan-soft text-inherit">{segment.text}</mark>
          : <React.Fragment key={index}>{segment.text}</React.Fragment>)
        : displayValue}
    </span>
  );
});

// Memoized zoom button
const ZoomButton = React.memo(function ZoomButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="gmi-focus-ring flex h-5 w-5 items-center justify-center rounded bg-gmi-surface-soft text-gmi-interactive transition-colors hover:bg-gmi-cyan-soft"
      title="Zoom til"
      aria-label="Zoom til"
    >
      <MagnifyingGlassPlusIcon size={14} weight="regular" aria-hidden="true" />
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
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = normalizeTableSearchQuery(searchQuery);

  const isOpen = layerDataTable?.isOpen;
  const layerId = layerDataTable?.layerId;
  const layer = layerId ? layers[layerId] : null;
  const isExactInspection = ['exact-object-set', 'contextual-object-set'].includes(inspection?.kind);
  const isContextualInspection = inspection?.kind === 'contextual-object-set';
  const [contextualSorting, setContextualSorting] = useState([]);
  const [contextualColumnOrder, setContextualColumnOrder] = useState(null);

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
  const searchedItems = useMemo(
    () => filterTableSearchRows(items, normalizedSearchQuery),
    [items, normalizedSearchQuery],
  );

  useEffect(() => {
    if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
  }, [normalizedSearchQuery, layerId, activeTab, inspection?.id]);

  // Defer field calculation for large datasets
  const fields = useMemo(() => {
    const requiredFields = isContextualInspection
      ? [inspection.presentation.temaColumn, inspection.presentation.fieldColumn]
      : [];
    const fieldItems = isContextualInspection ? contextualScopeRows : items;
    if (fieldItems.length === 0) return [...new Set(requiredFields)];

    const fieldSet = new Set();
    const fieldHasData = {};

    // Sample first 100 items for performance, then verify
    const sampleSize = Math.min(fieldItems.length, 100);
    for (let i = 0; i < sampleSize; i++) {
      const attrs = fieldItems[i].attributes || {};
      Object.keys(attrs).forEach((key) => {
        fieldSet.add(key);
        const value = attrs[key];
        if (value !== null && value !== undefined && value !== '') {
          fieldHasData[key] = true;
        }
      });
    }

    // For remaining items, only check if they have data (not for new fields)
    for (let i = sampleSize; i < fieldItems.length; i++) {
      const attrs = fieldItems[i].attributes || {};
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
      (field) => field.length > 0 && (isContextualInspection || fieldHasData[field]),
    );
    if (isContextualInspection) {
      for (const field of ['Stedfestingsårsak', 'Merknad']) {
        if (!fieldSet.has(field) && fieldItems.some((row) => Object.hasOwn(row.attributes || {}, field))) {
          presentFields.push(field);
        }
      }
    }

    const sfcodeIndex = presentFields.indexOf('S_FCODE');
    if (sfcodeIndex > -1) {
      presentFields.splice(sfcodeIndex, 1);
      presentFields.unshift('S_FCODE');
    }

    return [...new Set([...presentFields, ...requiredFields])];
  }, [items, contextualScopeRows, isContextualInspection, inspection]);

  const savedOrder = useMemo(() => {
    return layerId &&
      layerDataTable?.columnOrderByLayer?.[layerId]?.[activeTab]
      ? layerDataTable.columnOrderByLayer[layerId][activeTab]
      : [];
  }, [layerId, layerDataTable?.columnOrderByLayer, activeTab]);

  const orderedFields = useMemo(() => {
    if (!isContextualInspection) return normalizeColumnOrder(fields, savedOrder);
    const initial = getDiagnosticColumnOrder(fields, inspection.presentation);
    return contextualColumnOrder?.inspectionId === inspection.id
      ? normalizeColumnOrder(initial, contextualColumnOrder.fields)
      : initial;
  }, [fields, savedOrder, isContextualInspection, inspection, contextualColumnOrder]);

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
      if (isContextualInspection) setContextualColumnOrder({ inspectionId: inspection.id, fields: nextOrder });
      else if (!isExactInspection) setLayerDataTableColumnOrder(layerId, activeTab, nextOrder);
      setDraggedField(null);
    },
    [
      draggedField,
      layerId,
      orderedFields,
      activeTab,
      setLayerDataTableColumnOrder, isExactInspection, isContextualInspection, inspection,
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
    return createLayerDataTableColumns({
      orderedFields,
      columnWidths,
      isContextualInspection,
      inspection,
      getFieldLabel,
      zoomCell: ({ row }) => (
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
      dataCell: (info, id) => <DataCell value={info.getValue()} searchQuery={normalizedSearchQuery} missingLabel={isContextualInspection && id === inspection.presentation.fieldColumn ? 'Mangler' : '-'} />,
    });
  }, [activeTab, orderedFields, columnWidths, handleZoomTo, isContextualInspection, inspection, normalizedSearchQuery]);

  const table = useReactTable({
    data: searchedItems,
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
      .filter((field) => {
        const meta = columns.find((entry) => entry.id === field)?.meta;
        return meta?.pinned || meta?.isFixed;
      })
      .reduce((sum, field) => sum + (columnWidths[field] || 80), 0);
  };

  return (
    <div
      className="flex h-full flex-col border-t border-gmi-border-strong bg-gmi-surface text-gmi-text"
    >
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gmi-border bg-gmi-surface-soft px-3 py-1.5"
      >
        <div className="flex items-center gap-1.5">
          <span
            className="text-[11px] font-semibold text-gmi-navy"
          >
            Datatabell
          </span>
          {isExactInspection && (
            <span className="max-w-72 truncate text-[10px] text-gmi-text-muted" title={inspection.context.reason}>
              Objektutvalg: {inspection.context.title}{inspection.context.reason ? ` · ${inspection.context.reason}` : ''}
            </span>
          )}
          <span
            className="max-w-50 truncate text-[10px] text-gmi-text-subtle"
            title={layer.name}
          >
            {layer.name}
          </span>
        </div>

        {!isExactInspection && <div className="flex items-center gap-0.5">
          <button
            onClick={() => setLayerDataTableTab(layerId, 'punkter')}
            className={`gmi-compact-button gmi-focus-ring px-2 py-0.5 text-[10px] font-medium ${activeTab === 'punkter' ? 'gmi-selected-control' : 'text-gmi-text-muted'}`}
          >
            Punkter
          </button>
          <button
            onClick={() => setLayerDataTableTab(layerId, 'ledninger')}
            className={`gmi-compact-button gmi-focus-ring px-2 py-0.5 text-[10px] font-medium ${activeTab === 'ledninger' ? 'gmi-selected-control' : 'text-gmi-text-muted'}`}
          >
            Ledninger
          </button>
        </div>
        }

        {isContextualInspection && inspection.focusIndices.length !== inspection.scopeIndices.length && (
          <div className="flex items-center rounded border border-gmi-border-strong bg-gmi-surface p-0.5 text-[10px]" aria-label="Vis objektutvalg">
            {[['focus', 'Utvalg', inspection.focusIndices.length], ['scope', 'Alle', inspection.scopeIndices.length]].map(([view, label, count]) => (
              <button key={view} type="button" onClick={() => setObjectTableInspectionView(view)} aria-pressed={inspection.activeView === view}
                className={`gmi-compact-button gmi-focus-ring px-1.5 py-0.5 font-medium ${inspection.activeView === view ? 'gmi-selected-control' : 'text-gmi-text-muted'}`}>
                {label} {count}
              </button>
            ))}
          </div>
        )}

        {/* Filter status */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-gmi-text-muted">
            {isExactInspection ? (
              <span>{totalCount} {activeTab === 'punkter' ? 'punkter' : 'ledninger'}</span>
            ) : hasActiveFilters ? (
              <>
                <span className="font-semibold text-gmi-interactive">
                  {filteredCount}
                </span>
                <span> av {totalCount}</span>
                <span className="text-gmi-text-subtle">
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
              className="gmi-compact-button gmi-focus-ring flex items-center gap-0.5 px-1.5 py-0.5 text-gmi-interactive"
              title="Nullstill alle filtre"
            >
              <ArrowCounterClockwiseIcon size={12} weight="regular" aria-hidden="true" />
              <span>Nullstill</span>
            </button>
          )}
        </div>

        <div className="ml-auto flex min-w-36 flex-1 items-center justify-end gap-2">
          <div className="relative w-full min-w-24 max-w-64">
            <MagnifyingGlassIcon size={14} weight="regular" aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gmi-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Søk i data"
              placeholder="Søk i data…"
              className="gmi-focus-ring h-7 w-full rounded border border-gmi-border bg-gmi-surface pl-7 pr-7 text-[11px] text-gmi-text placeholder:text-gmi-text-subtle"
            />
            {searchQuery !== '' && (
              <button
                type="button"
                aria-label="Tøm søk"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="gmi-focus-ring absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gmi-text-muted hover:text-gmi-navy"
              >
                <XIcon size={12} weight="regular" aria-hidden="true" />
              </button>
            )}
          </div>
          {normalizedSearchQuery && (
            <span className="shrink-0 text-[10px] text-gmi-text-muted" role="status">
              {searchedItems.length} treff
            </span>
          )}
        </div>

        <button
          onClick={closeLayerDataTable}
          className="gmi-compact-button gmi-focus-ring flex h-[19px] w-[26px] items-center justify-center text-gmi-text-muted hover:text-gmi-navy"
          title="Lukk datatabell"
          aria-label="Lukk datatabell"
        >
          <XIcon size={12} weight="regular" aria-hidden="true" />
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
            className="sticky top-0 z-20 flex bg-gmi-surface-soft"
          >
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header, index) => {
                const isZoom = index === 0;
                const isFixed = header.column.columnDef.meta?.isFixed || header.column.columnDef.meta?.pinned;
                const headerId = header.column.id;
                const width = columnWidths[headerId] || 80;
                const stickyLeft = stickyLeftFor(headerId);
                const multiline = header.column.columnDef.meta?.contextualField || header.column.columnDef.meta?.contextualOrdinary;
                const fullHeaderLabel = String(header.column.columnDef.header || '');

                return (
                  <div
                    key={header.id}
                    draggable={!isZoom && (!isContextualInspection || !isFixed)}
                    onDragStart={() => handleDragStart(headerId)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => (!isContextualInspection || !isFixed) && handleDrop(headerId)}
                    onClick={
                      isZoom
                        ? undefined
                        : header.column.getToggleSortingHandler()
                    }
                    className={`shrink-0 select-none border-b border-gmi-border-strong bg-gmi-surface-soft px-1.5 py-1 text-left text-[10px] font-medium text-gmi-text-muted ${
                      isZoom
                        ? 'text-center'
                        : 'cursor-pointer hover:bg-gmi-border'
                    } ${isZoom || isFixed ? 'sticky z-30' : ''}`}
                    style={{
                      width,
                      minWidth: width,
                      maxWidth: width,
                      left: stickyLeft,
                      boxShadow: isFixed
                        ? '2px 0 4px -2px rgba(15,23,43,0.18)'
                        : undefined,
                    }}
                  >
                    <div className={`flex items-center gap-0.5 ${multiline ? 'items-start' : 'truncate'}`}>
                      <span className={multiline ? 'line-clamp-2 leading-3' : 'truncate'} title={fullHeaderLabel || undefined}>
                        {visibleHeaderLabel(fullHeaderLabel, width, multiline)}
                      </span>
                      {header.column.getIsSorted() && (
                        <span
                          className="text-gmi-interactive"
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
                  className="group flex cursor-pointer border-b border-gmi-border bg-gmi-surface hover:bg-gmi-surface-soft"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
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
                        className={`flex shrink-0 items-center px-1.5 text-[10px] ${
                          isZoom ? 'justify-center' : ''
                        } ${isZoom || isFixed ? 'sticky z-10' : ''} ${
                          (isZoom || isFixed) && !cell.column.columnDef.meta?.contextualField
                            ? 'bg-gmi-surface group-hover:bg-gmi-surface-soft'
                            : ''
                        }`}
                        style={{
                          backgroundColor: cell.column.columnDef.meta?.contextualField
                            ? row.original.__contextualResult === 'FAIL' ? '#fef2f2' : row.original.__contextualResult === 'CHECK' ? '#fffbeb' : '#f0fdf4'
                            : undefined,
                          width,
                          minWidth: width,
                          maxWidth: width,
                          left: stickyLeft,
                          height: ROW_HEIGHT,
                          boxShadow: isFixed
                            ? '2px 0 4px -2px rgba(15,23,43,0.18)'
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
        className="flex shrink-0 items-center justify-end border-t border-gmi-border bg-gmi-surface-soft px-3 py-1 text-[9px] text-gmi-text-subtle"
      >
        <span>
          Dra kolonner for å endre rekkefølge • Klikk for å sortere
        </span>
      </div>
    </div>
  );
}
