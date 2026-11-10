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
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { ArrowCounterClockwiseIcon, MagnifyingGlassIcon, MagnifyingGlassPlusIcon, XIcon } from '@phosphor-icons/react';
import { normalizeTableSearchQuery, segmentTableSearchText, tableSearchScalarText } from '@/lib/tableSearch';
import { deriveLayerTableRows } from '@/lib/layerTableRows.mjs';
import { gmiSelectionBinding, sameGmiSelectionBinding, gmiSelectionKey, gmiSelectionCounts } from '@/lib/gmiEditSelection.mjs';
import GmiConfirmDialog from './gmi-edit/GmiConfirmDialog';
import { extractHyperlinkFilenames } from '@/lib/hyperlinkFilenames.mjs';
import FilenameCopyButton from '@/components/FilenameCopyButton';
import { resolveExactObjectInspectionRows } from '@/lib/objectTableInspection';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth, getDiagnosticColumnOrder, createLayerDataTableColumns } from '@/lib/objectTablePresentation';
import { validatorInspectionLayer } from '@/lib/gmiValidatorEditing.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { GMI_EDIT_TABLE_VIEWS, GMI_EDIT_TABLE_VIEW_LABELS, gmiEditMessage, gmiObjectKey, gmiProposedViewForStatus, tableTabToScope } from '@/lib/gmiEditView.mjs';

const ROW_HEIGHT = 28;
const MAX_COLUMN_WIDTH = 180;
const MIN_COLUMN_WIDTH = 50;

function SelectionCheckbox({ label, checked, indeterminate = false, onToggle, tabIndex = -1 }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} tabIndex={tabIndex}
    className="gmi-focus-ring h-3.5 w-3.5 shrink-0 cursor-pointer accent-gmi-interactive"
    style={{ accentColor: 'var(--gmi-interactive)' }} onChange={() => {}}
    onClick={(event) => { event.stopPropagation(); onToggle(event.shiftKey); }}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onToggle(event.shiftKey); } }} />;
}

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

const HyperlinkCell = React.memo(function HyperlinkCell({ value, searchQuery }) {
  const filenames = useMemo(() => extractHyperlinkFilenames(value), [value]);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1"><DataCell value={value} searchQuery={searchQuery} /></div>
      {filenames.length > 0 && (
        <div className="flex max-w-24 shrink-0 items-center gap-0.5 overflow-x-auto" aria-label="Filnavn">
          {filenames.map((filename, index) => (
            <FilenameCopyButton tabIndex={-1} key={filename} filename={filename} referenceNumber={filenames.length > 1 ? index + 1 : undefined} />
          ))}
        </div>
      )}
    </div>
  );
});

// Proposed value that differs from the delivered one (Foreslått / Kun endrede modes). Read-only: editing stays in Rettinger.
const ChangedCell = React.memo(function ChangedCell({ change, children }) {
  const original = change.original === '' ? 'tom' : change.original;
  const proposed = change.proposed === '' ? 'tom' : change.proposed;
  return (
    <span className="gmi-edit-table-cell-changed" data-gmi-changed-cell title={`Original: ${original} → Foreslått: ${proposed}`}>
      {children}
    </span>
  );
});

// Memoized zoom button
const ZoomButton = React.memo(function ZoomButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="gmi-focus-ring flex h-5 w-5 items-center justify-center rounded bg-gmi-surface-soft text-gmi-interactive transition-colors hover:bg-gmi-cyan-soft"
      tabIndex={-1}
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

  const gmiEditStatus = useStore((state) => (state.ui.layerDataTable?.layerId ? state.gmiEditStatus?.[state.ui.layerDataTable.layerId] : null) ?? null);
  const gmiEditTableView = useStore((state) => (state.ui.layerDataTable?.layerId ? state.gmiEditTableView?.[state.ui.layerDataTable.layerId] : null) ?? GMI_EDIT_TABLE_VIEWS.ORIGINAL);
  const setGmiEditTableView = useStore((state) => state.setGmiEditTableView);
  const gmiEditWorkspaceLayerId = useStore((state) => state.gmiEditWorkspace?.layerId ?? null);
  const highlightedFeatureId = useStore((state) => state.ui.highlightedFeatureId);
  const requestGmiEditObject = useStore((state) => state.requestGmiEditObject);
  const storedSelection = useStore((state) => state.gmiEditSelection);
  const changeSelection = useStore((state) => state.changeGmiEditSelection);
  const [replaceSelection, setReplaceSelection] = useState(null);

  const tableContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = normalizeTableSearchQuery(searchQuery);

  const isOpen = layerDataTable?.isOpen;
  const layerId = layerDataTable?.layerId;
  const importedLayer = layerId ? layers[layerId] : null;
  const layer = useMemo(() => {
    // The published status invalidates exact proposed inspections on every history transition.
    void gmiEditStatus;
    return validatorInspectionLayer(gmiEditSessions, importedLayer, inspection?.editBasis);
  }, [importedLayer, inspection, gmiEditStatus]);
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

  // GMI editing display modes. Only for a layer with an open editing session, and never for exact
  // object inspections (their rows are bound to the original dataset revision). The verified proposed
  // view is computed once per published editing revision (status object), not per render.
  const gmiEditModesAvailable = !isExactInspection && (gmiEditStatus?.state === 'editable' || gmiEditStatus?.state === 'read-only');
  const proposedView = useMemo(
    () => gmiEditModesAvailable && gmiEditTableView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL ? gmiProposedViewForStatus(gmiEditSessions, gmiEditStatus) : null,
    [gmiEditModesAvailable, gmiEditTableView, gmiEditStatus],
  );
  const tableView = gmiEditModesAvailable && proposedView?.ok ? gmiEditTableView : GMI_EDIT_TABLE_VIEWS.ORIGINAL;
  const proposedData = tableView === GMI_EDIT_TABLE_VIEWS.ORIGINAL ? null : proposedView.dataset;
  const changedByObject = tableView === GMI_EDIT_TABLE_VIEWS.ORIGINAL ? null : proposedView.changed.byObject;

  const activeTab = isExactInspection
    ? inspection.geometryScope === 'point' ? 'punkter' : 'ledninger'
    : layerId && layerDataTable?.activeTabByLayer?.[layerId]
      ? layerDataTable.activeTabByLayer[layerId]
      : 'punkter';

  const selectionBinding = gmiSelectionBinding(layerId, gmiEditStatus);
  const selectionEnabled = !isExactInspection && gmiEditWorkspaceLayerId === layerId && Boolean(selectionBinding);
  const selection = selectionEnabled && sameGmiSelectionBinding(storedSelection?.binding, selectionBinding) ? storedSelection : null;
  const scope = tableTabToScope(activeTab);
  const showSelectionOnly = Boolean(selection?.showOnly && selection.scope === scope);
  const selectionDisplayKeys = showSelectionOnly ? selection.keys : null;
  const selectionWidth = selectionEnabled ? 32 : 0;
  const selectedKeys = useMemo(() => new Set(selection?.keys || []), [selection]);

  const { allItemsWithIndex, items, searchedItems, displayItems } = useMemo(() => deriveLayerTableRows({
    dataset: proposedData || layer?.data,
    tab: activeTab,
    filters: { hiddenCodes, hiddenTypes, feltHiddenValues },
    view: tableView,
    changedByObject,
    inspectionRows: isExactInspection ? exactRows || [] : null,
    searchQuery: normalizedSearchQuery,
    selectionKeys: selectionDisplayKeys,
  }), [proposedData, layer?.data, activeTab, hiddenCodes, hiddenTypes, feltHiddenValues,
    tableView, changedByObject, isExactInspection, exactRows, normalizedSearchQuery, selectionDisplayKeys]);
  const totalCount = allItemsWithIndex.length;
  const filteredCount = items.length;
  const hiddenCount = totalCount - filteredCount;

  useEffect(() => {
    if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
  }, [normalizedSearchQuery, layerId, activeTab, inspection?.id]);

  // Defer field calculation for large datasets
  const fields = useMemo(() => {
    const requiredFields = isContextualInspection
      ? [inspection.presentation.temaColumn, inspection.presentation.fieldColumn]
      : [];
    const fieldItems = isContextualInspection ? contextualScopeRows : showSelectionOnly ? displayItems : items;
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

    if (!showSelectionOnly && tableView === GMI_EDIT_TABLE_VIEWS.CHANGED && changedByObject) {
      // Kun endrede: identity columns plus the corrected fields of the shown objects.
      const scope = tableTabToScope(activeTab);
      const changedFields = new Set();
      for (const item of fieldItems) changedByObject.get(gmiObjectKey(scope, item.__index))?.forEach((_, field) => changedFields.add(field));
      const identity = ['S_FCODE', 'Tema', 'Type'].filter((field) => fieldSet.has(field) && !changedFields.has(field));
      return [...identity, ...[...changedFields].filter((field) => fieldSet.has(field))];
    }

    return [...new Set([...presentFields, ...requiredFields])];
  }, [items, contextualScopeRows, isContextualInspection, inspection, tableView, changedByObject, activeTab, showSelectionOnly, displayItems]);

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
    if (isExactInspection || !layerId || fields.length === 0 || tableView === GMI_EDIT_TABLE_VIEWS.CHANGED) return;
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
    setLayerDataTableColumnOrder, isExactInspection, tableView,
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
    if (tableView === GMI_EDIT_TABLE_VIEWS.CHANGED) return;
    const validSorting = Array.isArray(sorting)
      ? sorting.filter((sort) => fields.includes(sort.id))
      : [];
    if (validSorting.length !== sorting.length) {
      setLayerDataTableSorting(layerId, activeTab, validSorting);
    }
  }, [activeTab, fields, layerId, sorting, setLayerDataTableSorting, isExactInspection, tableView]);

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
      // In Rettinger the table is the object browser: a row click asks the workspace to open that object.
      if (!isExactInspection && gmiEditWorkspaceLayerId === layerId) requestGmiEditObject(layerId, tableTabToScope(objectType), index);
    },
    [layerId, setHighlightedFeature, isExactInspection, gmiEditWorkspaceLayerId, requestGmiEditObject],
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
      dataCell: (info, id) => {
        const content = id === 'S_HYPERLINK'
          ? <HyperlinkCell value={info.getValue()} searchQuery={normalizedSearchQuery} />
          : <DataCell value={info.getValue()} searchQuery={normalizedSearchQuery} missingLabel={isContextualInspection && id === inspection.presentation.fieldColumn ? 'Mangler' : '-'} />;
        const change = changedByObject?.get(gmiObjectKey(tableTabToScope(activeTab), info.row.original.__index))?.get(id);
        return change ? <ChangedCell change={change}>{content}</ChangedCell> : content;
      },
    });
  }, [activeTab, orderedFields, columnWidths, handleZoomTo, isContextualInspection, inspection, normalizedSearchQuery, changedByObject]);

  const table = useReactTable({
    data: displayItems,
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
  // This snapshot is the actual final sorted model, never the virtual viewport.
  const visibleKeys = rows.map((row) => gmiSelectionKey(scope, row.original.__index));
  const selectionCounts = gmiSelectionCounts(selection, scope, searchedItems.map((row) => gmiSelectionKey(scope, row.__index)));
  const headerSelection = gmiSelectionCounts(selection, scope, visibleKeys);
  const selectAction = (action) => {
    if (!selectionEnabled) return;
    if (selection?.keys.length && action.scope && action.scope !== selection.scope) {
      setReplaceSelection({ action, binding: selectionBinding }); return;
    }
    changeSelection(layerId, action, selectionBinding);
  };
  const toggleSelectionRow = (row, range = false) => {
    const key = gmiSelectionKey(scope, row.__index);
    selectAction(range ? { type: 'range', key, scope, orderedKeys: visibleKeys, checked: !selectedKeys.has(key) }
      : { type: 'toggle', key, scope });
  };

  // DOM focus stays on the grid; its active descendant uses stable source identity.
  // Filtering removes a cursor by falling back to the first remaining sorted row.
  const [navigationRowId, setNavigationRowId] = useState(null);
  const [gridHasFocus, setGridHasFocus] = useState(false);
  const cursorIndex = rows.findIndex((row) => row.id === navigationRowId);
  const navigationIndex = cursorIndex < 0 ? 0 : cursorIndex;
  const navigationRow = rows[navigationIndex];
  const rowElementId = (row) => `table-row-${encodeURIComponent(row.id)}`;
  const rangeExtractor = useCallback((range) => [...new Set([
    ...defaultRangeExtractor(range), ...(range.count ? [navigationIndex] : []),
  ])].sort((a, b) => a - b), [navigationIndex]);

  // Virtual row handling
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => rows[index].id,
    rangeExtractor,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  useEffect(() => {
    if (gridHasFocus && navigationRow && document.activeElement === tableContainerRef.current) {
      rowVirtualizer.scrollToIndex(navigationIndex, { align: 'auto' });
    }
  }, [navigationIndex, navigationRow, gridHasFocus, rowVirtualizer]);

  const handleGridKeyDown = (event) => {
    const grid = tableContainerRef.current;
    if (event.target !== grid) {
      // F2 enters a row's existing controls; Escape returns to row navigation.
      if (event.target.closest('[data-table-row]')) {
        if (event.key === 'Escape') { event.preventDefault(); grid.focus(); }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const controls = [...event.target.closest('[data-table-row]').querySelectorAll('button:not(:disabled), a[href], input[type=checkbox]')];
          const index = controls.indexOf(event.target);
          const next = controls[index + (event.key === 'ArrowRight' ? 1 : -1)];
          if (next) { event.preventDefault(); next.focus(); }
        }
      }
      return;
    }
    if (!navigationRow) return;
    if (event.key === ' ' && selectionEnabled) {
      event.preventDefault(); toggleSelectionRow(navigationRow.original, event.shiftKey); return;
    }
    if (event.key === 'Enter') {
      event.preventDefault(); handleRowClick(navigationRow.original.__index, activeTab); return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      document.getElementById(rowElementId(navigationRow))?.querySelector('button:not(:disabled), a[href]')?.focus();
      return;
    }
    const nextIndex = event.key === 'ArrowDown' ? Math.min(rows.length - 1, navigationIndex + 1)
      : event.key === 'ArrowUp' ? Math.max(0, navigationIndex - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : null;
    if (nextIndex !== null) {
      event.preventDefault();
      setNavigationRowId(rows[nextIndex].id);
      rowVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
    }
  };

  if (!isOpen || !layer) return null;

  // Calculate total table width for horizontal scrolling
  const totalWidth = selectionWidth + Object.values(columnWidths).reduce(
    (a, b) => a + b,
    0,
  );
  const stickyLeftFor = (columnId) => {
    if (columnId === 'zoom') return selectionWidth;
    const position = orderedFields.indexOf(columnId);
    if (position < 0) return undefined;
    const column = columns.find((entry) => entry.id === columnId);
    if (!column?.meta?.pinned && !column?.meta?.isFixed) return undefined;
    if (!isContextualInspection) return 36 + selectionWidth;
    return 36 + selectionWidth + orderedFields.slice(0, position)
      .filter((field) => {
        const meta = columns.find((entry) => entry.id === field)?.meta;
        return meta?.pinned || meta?.isFixed;
      })
      .reduce((sum, field) => sum + (columnWidths[field] || 80), 0);
  };

  return (
    <div
      data-table-geometry={activeTab}
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
            aria-pressed={activeTab === 'punkter'}
            onClick={() => setLayerDataTableTab(layerId, 'punkter')}
            className={`gmi-compact-button gmi-focus-ring px-2 py-0.5 text-[10px] font-medium ${activeTab === 'punkter' ? 'gmi-selected-control' : 'text-gmi-text-muted'}`}
          >
            Punkter
          </button>
          <button
            aria-pressed={activeTab === 'ledninger'}
            onClick={() => setLayerDataTableTab(layerId, 'ledninger')}
            className={`gmi-compact-button gmi-focus-ring px-2 py-0.5 text-[10px] font-medium ${activeTab === 'ledninger' ? 'gmi-selected-control' : 'text-gmi-text-muted'}`}
          >
            Ledninger
          </button>
        </div>
        }

        {gmiEditModesAvailable && (
          <div className="gmi-edit-table-modes" role="group" aria-label="Visning av GMI-rettinger" data-gmi-table-view={tableView}>
            {GMI_EDIT_TABLE_VIEW_LABELS.map((mode) => (
              <button key={mode.key} type="button" aria-pressed={tableView === mode.key} title={mode.description}
                className="gmi-focus-ring" onClick={() => setGmiEditTableView(layerId, mode.key)}>
                {mode.label}
              </button>
            ))}
          </div>
        )}
        {gmiEditModesAvailable && gmiEditTableView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL && proposedView && !proposedView.ok && (
          <span className="text-[10px] text-red-700" role="status">{gmiEditMessage(proposedView.code)} Viser originalen.</span>
        )}
        {tableView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL && (
          <span className="gmi-edit-table-banner" role="status">
            {tableView === GMI_EDIT_TABLE_VIEWS.PROPOSED ? 'Foreslått kopi – originalen er uendret' : `Kun endrede · ${proposedView.changed.byKey.size} felt`}
          </span>
        )}

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
            {showSelectionOnly ? (
              <span>{rows.length} valgte {activeTab}</span>
            ) : isExactInspection ? (
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
              {searchedItems.length} treff{showSelectionOnly && ' i normalvisning'}
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

      {selectionEnabled && selectionCounts.total > 0 && <div data-gmi-selection-bar className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gmi-border px-3 py-1 text-[10px]">
        <span role="status">{selectionCounts.total} valgt · {showSelectionOnly
          ? `${rows.length} vises · ${selectionCounts.visible} treffer filter/søk/visning · ${selectionCounts.hidden} utenfor`
          : `${selectionCounts.visible} synlige · ${selectionCounts.hidden} skjult av filter/søk/visning`}</span>
        <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => selectAction({ type: 'add', scope, keys: visibleKeys })}>Velg alle {rows.length} synlige</button>
        <button type="button" aria-pressed={showSelectionOnly} className="gmi-compact-button gmi-focus-ring" title="Vis hele utvalget uten å endre Tema/Felt, søk eller visningsvalg"
          onClick={() => {
            if (selection.scope !== scope) setLayerDataTableTab(layerId, selection.scope === 'line' ? 'ledninger' : 'punkter');
            selectAction({ type: 'show-only', value: !showSelectionOnly });
          }}>Vis bare valgte</button>
        <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => selectAction({ type: 'clear' })}>Fjern utvalg</button>
      </div>}
      {replaceSelection && <GmiConfirmDialog title={`Erstatt utvalget med ${scope === 'line' ? 'ledninger' : 'punkter'}?`}
        confirmLabel="Erstatt utvalget" testId="selection" onCancel={() => setReplaceSelection(null)}
        onConfirm={() => { changeSelection(layerId, { ...replaceSelection.action, replace: true }, replaceSelection.binding); setReplaceSelection(null); }}>
        <p>Utvalget kan bare inneholde én geometri. Det eksisterende utvalget erstattes hvis du fortsetter.</p>
      </GmiConfirmDialog>}
      <div
        ref={tableContainerRef}
        role="grid"
        aria-label="Objekter i datatabellen"
        aria-readonly="true"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + (selectionEnabled ? 1 : 0)}
        aria-multiselectable={selectionEnabled ? 'true' : undefined}
        aria-activedescendant={navigationRow ? rowElementId(navigationRow) : undefined}
        aria-describedby="layer-table-keyboard-help"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onFocusCapture={(event) => {
          setGridHasFocus(event.target === event.currentTarget || Boolean(event.target.closest('[data-table-row]')));
          if (event.target === event.currentTarget && navigationRow) rowVirtualizer.scrollToIndex(navigationIndex, { align: 'auto' });
        }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setGridHasFocus(false); }}
        className="gmi-focus-ring flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        {!rows.length && (
          <div role="status" className="p-4 text-xs text-gmi-text-muted">
            {normalizedSearchQuery
              ? 'Ingen objekter samsvarer med søket.'
              : !isExactInspection && hiddenCount > 0
                ? `Ingen synlige ${activeTab}. Tema/Felt-filtrene skjuler objektene. Juster filtrene eller velg Nullstill.`
                : `Ingen ${activeTab} i denne visningen.`}
          </div>
        )}
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Sticky header */}
          <div
            role="row"
            aria-rowindex={1}
            className="sticky top-0 z-20 flex bg-gmi-surface-soft"
          >
            {selectionEnabled && <div role="columnheader" aria-colindex={1} className="sticky left-0 z-30 flex shrink-0 items-center justify-center border-b border-gmi-border-strong bg-gmi-surface-soft" style={{ width: selectionWidth }}>
              <SelectionCheckbox label={`Velg alle ${rows.length} synlige objekter`} tabIndex={0} checked={headerSelection.checked} indeterminate={headerSelection.indeterminate}
                onToggle={() => selectAction({ type: headerSelection.checked ? 'remove' : 'add', scope, keys: visibleKeys })} />
            </div>}
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
                    role="columnheader"
                    aria-colindex={index + 1 + (selectionEnabled ? 1 : 0)}
                    aria-sort={isZoom ? undefined : header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                    draggable={!isZoom && (!isContextualInspection || !isFixed)}
                    onDragStart={() => handleDragStart(headerId)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => (!isContextualInspection || !isFixed) && handleDrop(headerId)}
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
                    <button type="button" disabled={isZoom} aria-label={isZoom ? 'Kart' : `Sorter etter ${fullHeaderLabel}`}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`gmi-focus-ring flex w-full items-center gap-0.5 text-left ${multiline ? 'items-start' : 'truncate'}`}>
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
                    </button>
                  </div>
                );
              }),
            )}
          </div>

          {/* Virtualized body */}
          <div
            role="rowgroup"
            style={{
              height: totalSize,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isActiveObject = highlightedFeatureId === `${activeTab}-${layerId}-${row.original.__index}`;
              return (
                <div
                  key={row.id}
                  id={rowElementId(row)}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  aria-current={isActiveObject ? 'true' : undefined}
                  aria-selected={selectionEnabled ? selectedKeys.has(gmiSelectionKey(scope, row.original.__index)) : undefined}
                  data-table-row={row.original.__index}
                  data-keyboard-current={gridHasFocus && row.id === navigationRow?.id ? 'true' : undefined}
                  onClick={() => {
                    setNavigationRowId(row.id);
                    handleRowClick(row.original.__index, activeTab);
                  }}
                  onMouseEnter={() =>
                    handleRowHoverStart(
                      row.original.__index,
                      activeTab,
                    )
                  }
                  onMouseLeave={handleRowHoverEnd}
                  className={`group flex cursor-pointer border-b border-gmi-border ${isActiveObject || selectedKeys.has(gmiSelectionKey(scope, row.original.__index)) ? 'bg-gmi-cyan-soft' : 'bg-gmi-surface'} hover:bg-gmi-surface-soft`}
                  style={{
                    outline: gridHasFocus && row.id === navigationRow?.id ? '2px solid var(--gmi-interactive)' : undefined,
                    outlineOffset: '-2px',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {selectionEnabled && <div role="gridcell" aria-colindex={1} className="sticky left-0 z-10 flex shrink-0 items-center justify-center bg-gmi-surface" style={{ width: selectionWidth, height: ROW_HEIGHT }}>
                    <SelectionCheckbox label={`${selectedKeys.has(gmiSelectionKey(scope, row.original.__index)) ? 'Fjern' : 'Velg'} ${scope === 'line' ? 'ledning' : 'punkt'} ${row.original.__index + 1}`}
                      checked={selectedKeys.has(gmiSelectionKey(scope, row.original.__index))} onToggle={(range) => toggleSelectionRow(row.original, range)} />
                  </div>}
                  {row.getVisibleCells().map((cell, index) => {
                    const isZoom = index === 0;
                    const isFixed = cell.column.columnDef.meta?.isFixed || cell.column.columnDef.meta?.pinned;
                    const cellId = cell.column.id;
                    const width = columnWidths[cellId] || 80;
                    const stickyLeft = stickyLeftFor(cellId);

                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        aria-colindex={index + 1 + (selectionEnabled ? 1 : 0)}
                        className={`flex shrink-0 items-center px-1.5 text-[10px] ${
                          isZoom ? 'justify-center' : ''
                        } ${isZoom || isFixed ? 'sticky z-10' : ''} ${
                          (isZoom || isFixed) && !cell.column.columnDef.meta?.contextualField
                            ? `${isActiveObject ? 'bg-gmi-cyan-soft' : 'bg-gmi-surface'} group-hover:bg-gmi-surface-soft`
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
                          boxShadow: isZoom && isActiveObject ? 'inset 3px 0 var(--gmi-interactive)' : isFixed
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
        <span id="layer-table-keyboard-help">
          {selectionEnabled && 'Space: velg objekt. Shift+Space eller Shift+klikk: velg område. '}
          Piltaster: naviger objekter. Enter: åpne. F2: radverktøy, venstre/høyre: bytt verktøy, Escape: tilbake. Dra kolonner for å endre rekkefølge • Klikk for å sortere
        </span>
      </div>
    </div>
  );
}
