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
import {
  ArrowBendUpLeftIcon, ArrowCounterClockwiseIcon, ArrowsInLineVerticalIcon, ArrowsOutLineVerticalIcon, ListChecksIcon, MagnifyingGlassIcon, MagnifyingGlassPlusIcon,
  MinusCircleIcon, PencilSimpleIcon, PlusCircleIcon, TextColumnsIcon, XIcon,
} from '@phosphor-icons/react';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import { normalizeTableSearchQuery, segmentTableSearchText, tableSearchScalarText } from '@/lib/tableSearch';
import { deriveLayerTableRows } from '@/lib/layerTableRows.mjs';
import { classifyLayerTableReveal } from '@/lib/layerTableReveal.mjs';
import { gmiSelectionBinding, sameGmiSelectionBinding, sameGmiSelectionHost, GMI_RETTINGER_SELECTION_HOST, gmiSelectionKey, gmiSelectionCounts, gmiCheckboxSoftFocus } from '@/lib/gmiEditSelection.mjs';
import GmiConfirmDialog from './gmi-edit/GmiConfirmDialog';
import GmiSeverityIcon from './gmi-edit/GmiSeverityIcon';
import { extractHyperlinkFilenames } from '@/lib/hyperlinkFilenames.mjs';
import FilenameCopyButton from '@/components/FilenameCopyButton';
import { resolveExactObjectInspectionRows } from '@/lib/objectTableInspection';
import { getContextualColumnWidth, getContextualOrdinaryColumnWidth, getOrdinaryColumnWidth, getDiagnosticColumnOrder, createLayerDataTableColumns, applyColumnFocus } from '@/lib/objectTablePresentation';
import { BATCH_REVIEW_COLUMNS, createBatchReviewColumnAccessors, getBatchReviewColumnWidths } from '@/lib/gmiTableReviewPresentation.mjs';
import { GMI_BATCH_OUTCOME_LABELS } from '@/lib/gmiBatchInspectorView.mjs';
import { gmiValidatorReturnTarget, validatorInspectionLayer } from '@/lib/gmiValidatorEditing.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { Lexeme } from '@/components/gmi-edit/GmiObjectEditor';
import { GMI_EDIT_TABLE_VIEWS, gmiEditMessage, describeGmiEditStatus, gmiObjectKey, gmiProposedViewForStatus, tableTabToScope,
  gmiObjectNumber, gmiObjectMatchesQuery, gmiObjectCountLabel, gmiTableViewControls } from '@/lib/gmiEditView.mjs';

const ROW_HEIGHT = 28;
const OBJECT_NUMBER_WIDTH = 40;
const NO_FIELDS = Object.freeze([]);
// Fixed identity columns stay ahead of any temporarily focused (edited) field.
const LEADING_FIELDS = Object.freeze(['S_FCODE']);

/** Batch review: the actual staged change, or a clearly labelled hypothetical for a manual candidate. */
function ReviewChange({ entry }) {
  const change = entry.change || entry.hypothetical?.change;
  if (!change) return <span className="gmi-review-none" aria-label="Ingen endring">—</span>;
  const value = <><Lexeme value={change.from} /> <span aria-hidden="true">→</span><span className="sr-only">til</span> <strong><Lexeme value={change.to} /></strong></>;
  const title = `${entry.change ? '' : 'Hvis inkludert: '}${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`;
  return entry.change
    ? <span className="gmi-review-change truncate" title={title}>{value}</span>
    : <span className="gmi-review-hypothetical truncate" title={title}>Hvis inkludert: {value}</span>;
}

/** Most severe finding first, coloured with the shared Validator severity tokens. */
function ReviewFindings({ entry }) {
  const actual = Boolean(entry.change);
  const findings = actual ? entry.findings : entry.hypothetical?.findings;
  if (!findings) return null;
  // S2: only what the change does is listed; unchanged existing findings and resolved ones are counted in the tooltip.
  const source = actual ? entry : entry.hypothetical;
  const context = [source.existingCount ? `${source.existingCount} eksisterende funn uendret` : '', source.resolvedCount ? `${source.resolvedCount} løst` : '']
    .filter(Boolean).join(' · ');
  if (!findings.length) return actual ? <span className="gmi-review-none" title={context || undefined} data-existing-count={source.existingCount || 0}>Ingen nye funn</span> : null;
  const [first, ...rest] = findings;
  const label = (finding) => finding.label || `${finding.severity}${finding.introduced ? ' (ny)' : ''}`;
  const title = [...findings.map((finding) => `${label(finding)}${finding.note ? ` (${finding.note})` : ''}: ${finding.reason}`), context].filter(Boolean).join('\n');
  return <span className={`gmi-review-finding truncate${actual ? '' : ' gmi-review-hypothetical'}`} data-validation-tone={first.tone} data-transition={first.transition} title={actual ? title : `Hvis inkludert:\n${title}`}>
    <span className="gmi-review-severity"><GmiSeverityIcon tone={first.tone} size={13} />
      <strong className="truncate">{!actual && 'Hvis inkludert: '}{label(first)}</strong></span>
    <span className="min-w-0 truncate">{' '}{first.reason}{rest.length > 0 && ` · +${rest.length}`}</span>
  </span>;
}

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

function visibleHeaderLabel(label, width, multiline = false) {
  const text = String(label || '');
  // Single-line headers use actual rendered glyph widths and CSS ellipsis.
  if (!multiline) return text;
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

  return (
    <span
      className={`block truncate ${isMissing ? 'text-gmi-text-subtle italic' : ''}`}
      title={!isMissing ? displayValue : undefined}
    >
      {!isMissing && tableSearchScalarText(value) !== null && searchQuery
        ? segmentTableSearchText(displayValue, searchQuery).map((segment, index) => segment.match
          ? <mark key={index} className="rounded-sm bg-gmi-cyan-soft text-inherit">{segment.text}</mark>
          : <React.Fragment key={index}>{segment.text}</React.Fragment>)
        : displayValue}
    </span>
  );
});

/**
 * S4: full text of the visibly truncated cells in one rendered row, read from the
 * cells' own tooltips (`title`), so keyboard users get what mouse users hover.
 */
function truncatedCellTexts(rowElement) {
  const clipped = (element) => [element, ...element.querySelectorAll('*')]
    .some((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1);
  return [...rowElement.querySelectorAll('[role=gridcell][data-column-label]')].flatMap((cell) => [...cell.querySelectorAll('[title]')]
    .filter((element) => !cell.contains(element.parentElement?.closest('[title]')) && element.title && clipped(element))
    .map((element) => ({ label: cell.dataset.columnLabel, text: element.title })));
}

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
  const batchTableReview = useStore((state) => state.gmiBatchTableReview);
  const tableExpanded = useStore((state) => state.gmiEditTableExpanded);
  const changeSelection = useStore((state) => state.changeGmiEditSelection);
  const batchInspectorLayerId = useStore((state) => state.gmiBatchInspectorLayerId);
  const columnFocusRequest = useStore((state) => state.gmiEditColumnFocus);
  const [replaceSelection, setReplaceSelection] = useState(null);
  // The focused field set the user turned off (toggle or manual column drag). Compared on layer and fields,
  // not on the request key, so the choice survives batch → ChangeSet handover; other fields apply again.
  const [columnFocusOff, setColumnFocusOff] = useState(null);
  const [lastColumnFocus, setLastColumnFocus] = useState(null);

  const tableContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const revealRequest = useStore((state) => state.layerTableReveal);
  const clearRevealRequest = useStore((state) => state.clearLayerTableReveal);
  const [pendingReveal, setPendingReveal] = useState(null);
  const [revealedRowId, setRevealedRowId] = useState(null);
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
  const isSelectableInspection = isContextualInspection && Boolean(inspection.selectionContext);
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
    if (isOpen && isSelectableInspection) tableContainerRef.current?.focus();
  }, [isOpen, isSelectableInspection, inspection?.id]);

  useEffect(() => {
    return () => {
      setHighlightedFeatureIds(null);
    };
  }, [setHighlightedFeatureIds]);

  // GMI editing display modes. Only for a layer with an open editing session, and never for exact
  // object inspections (their rows are bound to the original dataset revision). The verified proposed
  // view is computed once per published editing revision (status object), not per render.
  const workspaceHandoff = useStore((state) => state.gmiEditWorkspace?.layerId === layerId ? state.gmiEditWorkspace.handoff ?? null : null);
  const handoffDataset = workspaceHandoff?.provenance.datasetKind ?? null;
  // H4: the Validator rule this selection came from; Foreslått once corrections exist.
  const validatorReturn = gmiValidatorReturnTarget(layerId, workspaceHandoff, { changeSetCount: gmiEditStatus?.changeSetCount || 0 });
  const viewControls = gmiTableViewControls({ status: gmiEditStatus, view: gmiEditTableView, allowIdenticalProposed: handoffDataset === 'proposed',
    inRettinger: Boolean(layerId) && gmiEditWorkspaceLayerId === layerId, isInspection: isExactInspection });
  const gmiEditModesAvailable = viewControls.visible;
  const proposedView = useMemo(
    () => gmiEditModesAvailable && viewControls.effectiveView !== GMI_EDIT_TABLE_VIEWS.ORIGINAL ? gmiProposedViewForStatus(gmiEditSessions, gmiEditStatus) : null,
    [gmiEditModesAvailable, viewControls.effectiveView, gmiEditStatus],
  );
  const tableView = gmiEditModesAvailable && proposedView?.ok ? viewControls.effectiveView : GMI_EDIT_TABLE_VIEWS.ORIGINAL;
  const proposedData = tableView === GMI_EDIT_TABLE_VIEWS.ORIGINAL ? null : proposedView.dataset;
  const changedByObject = tableView === GMI_EDIT_TABLE_VIEWS.ORIGINAL ? null : proposedView.changed.byObject;

  const activeTab = isExactInspection
    ? inspection.geometryScope === 'point' ? 'punkter' : 'ledninger'
    : layerId && layerDataTable?.activeTabByLayer?.[layerId]
      ? layerDataTable.activeTabByLayer[layerId]
      : 'punkter';

  const selectionBinding = gmiSelectionBinding(layerId, gmiEditStatus);
  const selectionHost = useMemo(() => isSelectableInspection ? { kind: 'inspection', key: inspection.selectionContext.key }
    : GMI_RETTINGER_SELECTION_HOST, [isSelectableInspection, inspection?.selectionContext?.key]);
  const selectionEnabled = Boolean(selectionBinding) && (isSelectableInspection && exactRows !== null
    || !isExactInspection && gmiEditWorkspaceLayerId === layerId);
  const selection = selectionEnabled && sameGmiSelectionBinding(storedSelection?.binding, selectionBinding)
    && sameGmiSelectionHost(storedSelection?.host, selectionHost) ? storedSelection : null;
  const selectionDescriptor = isSelectableInspection && !selectionEnabled ? gmiEditStatus || gmiEditSessions.describe(layerId) : null;
  const selectionUnavailable = selectionDescriptor ? describeGmiEditStatus(selectionDescriptor) : null;
  const handoffError = useStore((state) => state.gmiEditHandoffError);
  const scope = tableTabToScope(activeTab);
  const showSelectionOnly = !isExactInspection && Boolean(selection?.showOnly && selection.scope === scope);
  const selectionDisplayKeys = showSelectionOnly ? selection.keys : null;
  const selectionWidth = selectionEnabled ? 32 : 0;
  const selectedKeys = useMemo(() => new Set(selection?.keys || []), [selection]);
  const batchReview = !isExactInspection && selectionEnabled && batchTableReview?.layerId === layerId
    && batchTableReview.selection === selection && batchTableReview.revision === gmiEditStatus?.revision ? batchTableReview : null;
  // Rettinger object labels ("Ledning 38"): a compact, stable source-number column, also in
  // Validator inspections opened inside Rettinger. Never derived from the sorted/virtual row.
  const showObjectNumber = Boolean(layerId) && gmiEditWorkspaceLayerId === layerId;
  const zoomWidth = showObjectNumber ? 32 : 36;
  const numberWidth = showObjectNumber ? OBJECT_NUMBER_WIDTH : 0;
  const sourceData = importedLayer?.data;
  const objectIdOf = useCallback((objectScope, index) => (objectScope === 'line' ? sourceData?.lines : sourceData?.points)?.[index]?.id ?? null, [sourceData]);
  const identityMatches = useMemo(() => showObjectNumber
    // Preserve source-GUID lookup from the retired list; numeric queries keep Nr. semantics.
    ? (item, query) => gmiObjectMatchesQuery(query, scope, item.__index, objectIdOf(scope, item.__index))
      || (!/^\d+$/.test(query) && typeof item.guid === 'string' && item.guid.toLowerCase().includes(query)) : null, [showObjectNumber, scope, objectIdOf]);
  const columnFocus = showObjectNumber && !isContextualInspection && columnFocusRequest?.layerId === layerId ? columnFocusRequest : null;
  const columnFocusSignature = columnFocus ? [columnFocus.layerId, ...columnFocus.fields].join('\u0000') : null;
  // A focus on other fields ends the earlier «off» choice; a gap without focus (handover) does not.
  if (columnFocusSignature && columnFocusSignature !== lastColumnFocus) {
    setLastColumnFocus(columnFocusSignature);
    if (columnFocusOff && columnFocusOff !== columnFocusSignature) setColumnFocusOff(null);
  }
  const columnFocusActive = Boolean(columnFocus && columnFocusOff !== columnFocusSignature);
  const focusFields = columnFocusActive ? columnFocus.fields : NO_FIELDS;

  const { allItemsWithIndex, items, searchedItems, displayItems } = useMemo(() => deriveLayerTableRows({
    dataset: proposedData || layer?.data,
    tab: activeTab,
    filters: { hiddenCodes, hiddenTypes, feltHiddenValues },
    view: tableView,
    changedByObject,
    inspectionRows: isExactInspection ? exactRows || [] : null,
    searchQuery: normalizedSearchQuery,
    selectionKeys: selectionDisplayKeys,
    identityMatches,
  }), [proposedData, layer?.data, activeTab, hiddenCodes, hiddenTypes, feltHiddenValues,
    tableView, changedByObject, isExactInspection, exactRows, normalizedSearchQuery, selectionDisplayKeys, identityMatches]);
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

    // An edited field stays visible even while it is still empty everywhere (fill mode).
    for (const field of focusFields) {
      if (fieldSet.has(field) && !presentFields.includes(field)) presentFields.push(field);
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
  }, [items, contextualScopeRows, isContextualInspection, inspection, tableView, changedByObject, activeTab, showSelectionOnly, displayItems, focusFields]);

  const savedOrder = useMemo(() => {
    return layerId &&
      layerDataTable?.columnOrderByLayer?.[layerId]?.[activeTab]
      ? layerDataTable.columnOrderByLayer[layerId][activeTab]
      : [];
  }, [layerId, layerDataTable?.columnOrderByLayer, activeTab]);

  const orderedFields = useMemo(() => {
    // Review focus is display-only: the saved order (persisted below) stays the user's own.
    if (!isContextualInspection) return applyColumnFocus(normalizeColumnOrder(fields, savedOrder), focusFields, LEADING_FIELDS);
    const initial = getDiagnosticColumnOrder(fields, inspection.presentation);
    return contextualColumnOrder?.inspectionId === inspection.id
      ? normalizeColumnOrder(initial, contextualColumnOrder.fields)
      : initial;
  }, [fields, savedOrder, isContextualInspection, inspection, contextualColumnOrder, focusFields]);

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
      ? sorting.filter((sort) => fields.includes(sort.id) || (showObjectNumber && sort.id === 'objectNumber') || (batchReview && BATCH_REVIEW_COLUMNS.includes(sort.id)))
      : [];
    if (validSorting.length !== sorting.length) {
      setLayerDataTableSorting(layerId, activeTab, validSorting);
    }
  }, [activeTab, fields, layerId, sorting, setLayerDataTableSorting, isExactInspection, tableView, showObjectNumber, batchReview]);

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
      // A manual arrangement wins: the visible order is saved and the temporary focus stops.
      if (columnFocusActive) setColumnFocusOff(columnFocusSignature);
      setDraggedField(null);
    },
    [
      draggedField,
      layerId,
      orderedFields,
      activeTab,
      setLayerDataTableColumnOrder, isExactInspection, isContextualInspection, inspection, columnFocusActive, columnFocusSignature,
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
      // In Rettinger the table is the object browser: a row click asks the workspace to open that object.
      if (!isExactInspection && gmiEditWorkspaceLayerId === layerId) requestGmiEditObject(layerId, tableTabToScope(objectType), index);
      else setHighlightedFeature(featureId);
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

  // Complete geometry scope keeps widths stable through filtering and selection.
  const attributeColumnWidths = useMemo(() => {
    const widths = { zoom: zoomWidth };
    if (showObjectNumber) widths.objectNumber = OBJECT_NUMBER_WIDTH;
    const dataset = proposedData || layer?.data;
    const sizingRows = (activeTab === 'punkter' ? dataset?.points : dataset?.lines) || [];
    orderedFields.forEach((field) => {
      const label = getFieldLabel(field);
      if (isContextualInspection && field === inspection.presentation.fieldColumn) {
        widths[field] = getContextualColumnWidth({ label, values: contextualScopeRows.map((row) => row.attributes?.[field]), kind: 'field' });
      } else if (isContextualInspection && field === inspection.presentation.temaColumn) {
        widths[field] = getContextualColumnWidth({ label, values: contextualScopeRows.map((row) => row.attributes?.[field]), kind: 'tema' });
      } else if (isContextualInspection) {
        widths[field] = getContextualOrdinaryColumnWidth({ values: contextualScopeRows.map((row) => row.attributes?.[field]) });
      } else {
        widths[field] = getOrdinaryColumnWidth({ field, label, values: sizingRows.map((row) => row.attributes?.[field]),
          format: fieldsData.find((definition) => definition.fieldKey === field)?.fieldFormat });
      }
    });
    return widths;
  }, [orderedFields, isContextualInspection, inspection, contextualScopeRows, showObjectNumber, zoomWidth, proposedData, layer?.data, activeTab]);
  const columnWidths = useMemo(() => batchReview
    ? { ...attributeColumnWidths, ...getBatchReviewColumnWidths(batchReview.rows,
      { textField: fieldsData.find((definition) => definition.fieldKey === batchReview.field)?.fieldFormat === 'Tekst' }) }
    : attributeColumnWidths, [attributeColumnWidths, batchReview]);

  const columns = useMemo(() => {
    const base = createLayerDataTableColumns({
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
    const numberColumn = showObjectNumber ? [{
      id: 'objectNumber', header: 'Nr.', size: OBJECT_NUMBER_WIDTH, sortingFn: 'basic', meta: { identity: true },
      accessorFn: (row) => gmiObjectNumber(scope, row.__index, objectIdOf(scope, row.__index)).sortValue,
      cell: ({ row }) => {
        const number = gmiObjectNumber(scope, row.original.__index, objectIdOf(scope, row.original.__index));
        const matched = normalizedSearchQuery && gmiObjectMatchesQuery(normalizedSearchQuery, scope, row.original.__index, objectIdOf(scope, row.original.__index));
        return <span className="gmi-object-number" data-numbered={number.numbered || undefined} title={number.numbered ? number.label : `${number.label} (filen har ikke objektnummer)`}>
          {matched ? <mark className="rounded-sm bg-gmi-cyan-soft text-inherit">{number.text}</mark> : number.text}
        </span>;
      },
    }] : [];
    // The ordinary application keeps its exact columns; Rettinger adds Nr. after the zoom tool.
    const [zoom, ...attributes] = base;
    if (!batchReview) return showObjectNumber ? [zoom, ...numberColumn, ...attributes] : base;
    const fixed = attributes.filter((column) => column.meta?.isFixed);
    const ordinary = attributes.filter((column) => !column.meta?.isFixed);
    const reviewLabels = { batchStatus: 'Status', batchValue: 'Endring', batchFindings: 'Funn etter endring' };
    const reviewColumns = createBatchReviewColumnAccessors({ rows: batchReview.rows, scope }).map((accessor) => ({
      ...accessor, header: reviewLabels[accessor.id], size: columnWidths[accessor.id],
      cell: ({ row }) => {
        const id = accessor.id;
        // Objects outside the reviewed selection get neutral empty cells.
        const entry = batchReview.rows[gmiSelectionKey(scope, row.original.__index)];
        if (!entry) return null;
        if (id === 'batchValue') return <ReviewChange entry={entry} />;
        if (id === 'batchFindings') return <ReviewFindings entry={entry} />;
        return <div className="gmi-review-status" title={[GMI_BATCH_OUTCOME_LABELS[entry.outcome], entry.detail, entry.explanation].filter(Boolean).join('\n')}>
          <span className="gmi-outcome-badge" data-outcome={entry.outcome}>{GMI_BATCH_OUTCOME_LABELS[entry.outcome]}</span>
          {entry.detail && <span className="gmi-outcome-detail truncate">{entry.detail}</span>}
          {entry.canManual && <button type="button" className="gmi-manual-toggle gmi-focus-ring" aria-pressed={entry.manualOn}
            title={entry.manualOn ? 'Fjern objektet fra masseendringen igjen.' : 'Ta med objektet selv om Validator ikke anbefaler feltet her. Kan gi FEIL og krever egen godkjenning.'}
            onClick={(event) => { event.stopPropagation(); batchReview.onManual(entry.cellKey); }}>
            {entry.manualOn ? <MinusCircleIcon size={13} weight="regular" aria-hidden="true" /> : <PlusCircleIcon size={13} weight="regular" aria-hidden="true" />}
            {entry.manualOn ? 'Fjern manuelt tillegg' : 'Inkluder manuelt'}
          </button>}
        </div>;
      },
    }));
    return [zoom, ...numberColumn, ...fixed, ...reviewColumns, ...ordinary];
  }, [activeTab, orderedFields, columnWidths, handleZoomTo, isContextualInspection, inspection, normalizedSearchQuery, changedByObject, batchReview, scope, showObjectNumber, objectIdOf]);

  // TanStack caches accessor values on its core rows. Review outcomes can change
  // without changing source/display rows (for example, manual inclusion).
  const tableData = useMemo(() => batchReview ? [...displayItems] : displayItems, [displayItems, batchReview]);
  const table = useReactTable({
    data: tableData,
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
  const applySelection = (action, binding, focusTarget) => {
    const before = useStore.getState().gmiEditSelection;
    changeSelection(layerId, action, binding, selectionHost);
    if (focusTarget && gmiCheckboxSoftFocus(before, useStore.getState().gmiEditSelection, focusTarget, binding)) {
      requestGmiEditObject(layerId, focusTarget.scope, focusTarget.sourceIndex, { soft: true });
    }
  };
  const selectAction = (action, focusTarget) => {
    if (!selectionEnabled) return;
    if (selection?.origin?.kind === 'validator' && action.scope && action.scope !== selection.scope) return;
    if (selection?.keys.length && action.scope && action.scope !== selection.scope) {
      // A cross-geometry range has no anchor in the new geometry, so it selects one object.
      setReplaceSelection({ action, focusTarget, binding: selectionBinding, from: { scope: selection.scope, count: selection.keys.length },
        to: { scope: action.scope, count: action.type === 'add' ? new Set(action.keys).size : 1 } }); return;
    }
    applySelection(action, selectionBinding, focusTarget);
  };
  const toggleSelectionRow = (row, range = false) => {
    const key = gmiSelectionKey(scope, row.__index);
    selectAction(range ? { type: 'range', key, scope, orderedKeys: visibleKeys, checked: !selectedKeys.has(key) }
      : { type: 'toggle', key, scope }, { scope, sourceIndex: row.__index });
  };

  // DOM focus stays on the grid; its active descendant uses stable source identity.
  // Filtering removes a cursor by falling back to the first remaining sorted row.
  const [navigationRowId, setNavigationRowId] = useState(null);
  const [gridHasFocus, setGridHasFocus] = useState(false);
  // S4: truncated text of the keyboard-active row, shown below the grid while it (or the region) has focus.
  const [activeFullText, setActiveFullText] = useState(null);
  const [fullTextFocused, setFullTextFocused] = useState(false);
  const fullTextRef = useRef(null);
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
    setPendingReveal(null);
    setRevealedRowId(null);
  }, [layerId, activeTab, isOpen, inspection?.id, sourceData]);

  useEffect(() => {
    if (!revealRequest || !isOpen || revealRequest.layerId !== layerId || isExactInspection) return;
    if (revealRequest.targets[0]?.scope !== scope) {
      setLayerDataTableTab(layerId, revealRequest.targets[0]?.scope === 'line' ? 'ledninger' : 'punkter');
      return;
    }
    setPendingReveal(revealRequest);
    setRevealedRowId(null);
    clearRevealRequest(revealRequest);
  }, [revealRequest, isOpen, layerId, isExactInspection, scope, setLayerDataTableTab, clearRevealRequest]);

  const revealResult = pendingReveal && pendingReveal.layerId === layerId
    ? classifyLayerTableReveal({ targets: pendingReveal.targets, sortedRows: rows,
      allRows: allItemsWithIndex, filteredRows: items, searchedRows: searchedItems, showOnly: showSelectionOnly }) : null;
  const revealIndex = revealResult?.kind === 'visible' ? revealResult.index : -1;
  useEffect(() => {
    if (revealIndex < 0 || !pendingReveal) return;
    const row = rows[revealIndex];
    setNavigationRowId(row.id);
    setRevealedRowId(row.id);
    rowVirtualizer.scrollToIndex(revealIndex, { align: 'center' });
    // The edited field may have been moved back by the user's column-focus preference.
    const field = pendingReveal.fields?.find((field) => orderedFields.includes(field));
    if (field && tableContainerRef.current) {
      const position = orderedFields.indexOf(field);
      const left = orderedFields.slice(0, position).reduce((sum, key) => sum + (columnWidths[key] || 80), 0);
      tableContainerRef.current.scrollLeft = Math.max(0, left);
    }
    setPendingReveal(null);
  }, [revealIndex, pendingReveal, rows, rowVirtualizer, orderedFields, columnWidths]);

  useEffect(() => {
    if (!revealedRowId) return;
    const timer = setTimeout(() => setRevealedRowId(null), 5000);
    return () => clearTimeout(timer);
  }, [revealedRowId]);

  useEffect(() => {
    if (gridHasFocus && navigationRow && document.activeElement === tableContainerRef.current) {
      rowVirtualizer.scrollToIndex(navigationIndex, { align: 'auto' });
    }
  }, [navigationIndex, navigationRow, gridHasFocus, rowVirtualizer]);
  useEffect(() => {
    if (fullTextFocused) return;
    // Keyboard only: a mouse click on the grid has the cell tooltips and must not shift the layout.
    const keyboard = gridHasFocus && tableContainerRef.current?.matches(':focus-visible');
    const element = keyboard && navigationRow ? document.getElementById(`table-row-${encodeURIComponent(navigationRow.id)}`) : null;
    const entries = element ? truncatedCellTexts(element) : [];
    const next = entries.length ? { rowId: navigationRow.id, entries } : null;
    setActiveFullText((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [gridHasFocus, navigationRow, fullTextFocused, columnWidths, columns, batchReview]);

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
    if (event.key === 'Enter' && event.shiftKey) {
      // S4: move to the full text of the active row's truncated cells (shown only when there is any).
      event.preventDefault(); fullTextRef.current?.focus(); return;
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
  // Sticky lead: selection checkbox, zoom tool, then (in Rettinger) the object number.
  const leadWidth = selectionWidth + zoomWidth + numberWidth;
  const stickyLeftFor = (columnId) => {
    if (columnId === 'zoom') return selectionWidth;
    if (columnId === 'objectNumber') return selectionWidth + zoomWidth;
    const position = orderedFields.indexOf(columnId);
    if (position < 0) return undefined;
    const column = columns.find((entry) => entry.id === columnId);
    if (!column?.meta?.pinned && !column?.meta?.isFixed) return undefined;
    if (!isContextualInspection) return leadWidth;
    return leadWidth + orderedFields.slice(0, position)
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
      {revealResult && revealResult.kind !== 'visible' && <div role="status" data-table-reveal-message className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gmi-border bg-gmi-surface-soft px-3 py-1 text-xs">
        <span>{revealResult.kind === 'absent' ? 'Objektet finnes ikke i denne tabellvisningen.'
          : `Objektet er skjult av ${revealResult.reasons.map((reason) => ({ filter: 'Tema/Felt-filtre', search: 'søk', 'selected-only': 'Bare valgte' })[reason]).join(' og ')}.`}</span>
        {revealResult.kind === 'hidden' && <button type="button" className="gmi-compact-button gmi-focus-ring text-gmi-interactive" onClick={() => {
          resetLayerFilters(layerId);
          setSearchQuery('');
          if (showSelectionOnly) changeSelection(layerId, { type: 'show-only', value: false }, selectionBinding, selectionHost);
        }}>Nullstill filtre</button>}
        <button type="button" aria-label="Lukk navigasjonsmelding" className="gmi-compact-button gmi-focus-ring" onClick={() => setPendingReveal(null)}>Lukk</button>
      </div>}
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
          {/* Rettinger already names the file in its header; the room goes to the table controls. */}
          {!showObjectNumber && <span
            className="max-w-50 truncate text-[10px] text-gmi-text-subtle"
            title={layer.name}
          >
            {layer.name}
          </span>}
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
            {viewControls.modes.map((mode) => (
              <button key={mode.key} type="button" aria-pressed={tableView === mode.key} title={mode.description} disabled={mode.disabled}
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
          <span className="gmi-edit-table-banner" role="status" title={tableView === GMI_EDIT_TABLE_VIEWS.PROPOSED ? 'Foreslått kopi – originalen er uendret' : undefined}>
            {/* Narrow tables keep the short form so the toolbar stays on one line. */}
            {tableView === GMI_EDIT_TABLE_VIEWS.PROPOSED ? <>Foreslått kopi<span className={showObjectNumber ? 'hidden min-[1700px]:inline' : undefined}> – originalen er uendret</span></> : `Kun endrede · ${proposedView.changed.byKey.size} felt`}
          </span>
        )}
        {columnFocus && (
          <button type="button" className="gmi-column-focus gmi-focus-ring" aria-pressed={columnFocusActive} data-gmi-column-focus={columnFocus.fields.join(',')}
            title={columnFocusActive ? 'Feltet som rettes vises først. Din egen kolonnerekkefølge er uendret. Klikk for vanlig rekkefølge.' : 'Vis feltet som rettes først i tabellen.'}
            onClick={() => setColumnFocusOff(columnFocusActive ? columnFocusSignature : null)}>
            <TextColumnsIcon size={13} weight="regular" aria-hidden="true" />{columnFocus.fields.join(', ')} først
          </button>
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

        {/* Rettinger layout: one compact icon toggle for the 62/38 ↔ 35/65 split, always reachable. */}
        {showObjectNumber && <PhotoIconButton icon={tableExpanded ? ArrowsInLineVerticalIcon : ArrowsOutLineVerticalIcon} size={14}
          label={tableExpanded ? 'Mindre tabell' : 'Større tabell'} data-gmi-table-size={tableExpanded ? 'expanded' : 'normal'}
          tooltip={tableExpanded ? 'Mindre tabell: gi kartet og inspektøren mer plass igjen' : 'Større tabell: vis flere rader (kart og inspektør blir lavere)'}
          className="gmi-table-icon-button" onClick={() => useStore.setState({ gmiEditTableExpanded: !tableExpanded })} />}
        <button
          onClick={closeLayerDataTable}
          className="gmi-compact-button gmi-focus-ring flex h-[19px] w-[26px] items-center justify-center text-gmi-text-muted hover:text-gmi-navy"
          title="Lukk datatabell"
          aria-label="Lukk datatabell"
        >
          <XIcon size={12} weight="regular" aria-hidden="true" />
        </button>
      </div>

      {selectionUnavailable && <div data-gmi-selection-unavailable className="gmi-selection-bar" role="status">
        {['unloaded', 'loading'].includes(selectionDescriptor.state) ? 'Klargjør objektutvalg…'
          : <>Objektutvalg er ikke tilgjengelig. {selectionUnavailable.message || 'Filen kan bare vises og ikke rettes.'}</>}
      </div>}
      {isSelectableInspection && handoffError && <p role="alert" className="gmi-selection-bar">{handoffError}</p>}
      {selectionEnabled && (selectionCounts.total > 0 || selection?.origin?.kind === 'validator') && <div data-gmi-selection-bar className="gmi-selection-bar">
        <p className="gmi-selection-summary" role="status">
          {selection?.origin?.kind === 'validator' && <span title="Utvalget kan bare reduseres. Gjør om til vanlig utvalg for å legge til objekter.">Fra Validator: {selection.origin.targets.length} objekter · bare fjerning tillatt. </span>}
          {selection?.origin?.kind === 'validator-selection' && <span data-gmi-validator-provenance>{validatorReturn
            ? <button type="button" className="gmi-edit-link gmi-focus-ring inline-flex items-center gap-1" data-gmi-validator-return={validatorReturn.dataset}
              title={`Åpne regelen i Validator på ${validatorReturn.dataset === 'proposed' ? 'Foreslått' : 'Original'}. Rettinger beholdes.`}
              onClick={() => useStore.getState().openGmiValidatorFromRettinger(layerId)}>
              <ArrowBendUpLeftIcon size={13} weight="regular" aria-hidden="true" />Tilbake til Validator · {validatorReturn.fieldLabel}</button>
            : <>Valgt i Validator · {selection.origin.fieldLabel}</>} · {selection.origin.count} {selection.origin.count === 1 ? 'objekt' : 'objekter'} valgt i Validator. </span>}
          <strong>{selectionCounts.total}</strong> valgt<span className="gmi-selection-scope"> · {showSelectionOnly
            ? `${rows.length} vises · ${selectionCounts.visible} treffer filter/søk/visning · ${selectionCounts.hidden} utenfor`
            : `${selectionCounts.visible} synlige · ${selectionCounts.hidden} skjult av ${isSelectableInspection ? 'utvalg/søk' : 'filter/søk/visning'}`}</span>
        </p>
        <div className="gmi-selection-actions">
          {selection?.origin?.kind === 'validator' && <button type="button" className="gmi-bar-button gmi-focus-ring"
            onClick={() => selectAction({ type: 'make-ordinary' })}>Gjør om til vanlig utvalg</button>}
          {!isExactInspection && <div className="gmi-bar-segmented" role="group" aria-label="Rader i tabellen">
            <button type="button" aria-pressed={!showSelectionOnly} className="gmi-focus-ring" title="Vanlig visning med Tema/Felt-filtre og søk"
              onClick={() => { if (showSelectionOnly) selectAction({ type: 'show-only', value: false }); }}>Filtrert visning</button>
            <button type="button" aria-pressed={showSelectionOnly} className="gmi-focus-ring" title="Vis hele utvalget uten å endre Tema/Felt, søk eller visningsvalg"
              onClick={() => {
                if (showSelectionOnly) return;
                if (selection.scope !== scope) setLayerDataTableTab(layerId, selection.scope === 'line' ? 'ledninger' : 'punkter');
                selectAction({ type: 'show-only', value: true });
              }}>Bare valgte</button>
          </div>}
          {!showSelectionOnly && <button type="button" className="gmi-bar-button gmi-focus-ring" disabled={!rows.length || headerSelection.checked}
            onClick={() => selectAction({ type: 'add', scope, keys: visibleKeys })}><ListChecksIcon size={13} weight="regular" aria-hidden="true" />Velg alle {rows.length} synlige</button>}
          <button type="button" className="gmi-bar-button gmi-focus-ring" onClick={() => selectAction({ type: 'clear' })}><XIcon size={12} weight="regular" aria-hidden="true" />Fjern utvalg</button>
        </div>
        {isSelectableInspection && <button type="button" className="gmi-primary-control gmi-focus-ring gmi-batch-entry"
          onClick={() => useStore.getState().openGmiValidatorSelection(layerId)}>
          <PencilSimpleIcon size={14} weight="regular" aria-hidden="true" />Åpne i Rettinger ({selectionCounts.total})</button>}
        {!isExactInspection && (batchInspectorLayerId === layerId
          ? <span className="gmi-batch-mode-indicator" role="status"><PencilSimpleIcon size={14} weight="regular" aria-hidden="true" />Masseendring pågår · se panelet til høyre</span>
          : <button type="button" className="gmi-primary-control gmi-focus-ring gmi-batch-entry" onClick={() => useStore.setState({ gmiBatchInspectorRequest: { layerId, at: Date.now() } })}>
            <PencilSimpleIcon size={14} weight="regular" aria-hidden="true" />Rediger valgte ({selectionCounts.total})</button>)}
      </div>}
      {replaceSelection && (() => {
        const { from, to } = replaceSelection;
        const plural = { line: ['ledning', 'ledninger', 'ledningene'], point: ['punkt', 'punkter', 'punktene'] };
        const target = to.count === 1 ? (to.scope === 'line' ? 'én ledning' : 'ett punkt') : gmiObjectCountLabel(to.count, to.scope);
        const removed = from.count === 1 ? (from.scope === 'line' ? 'den valgte ledningen' : 'det valgte punktet') : `de ${from.count} valgte ${plural[from.scope][2]}`;
        return <GmiConfirmDialog title={`Erstatt ${from.count} valgte ${plural[from.scope][from.count === 1 ? 0 : 1]} med ${target}?`}
          confirmLabel="Erstatt utvalget" testId="selection" onCancel={() => setReplaceSelection(null)}
          onConfirm={() => { applySelection({ ...replaceSelection.action, replace: true }, replaceSelection.binding, replaceSelection.focusTarget); setReplaceSelection(null); }}>
          <p>Et utvalg kan bare inneholde én geometritype. Fortsetter du, fjernes {removed} fra utvalget, og utvalget består av {target}.</p>
          <p className="gmi-edit-muted">Ingen objekter eller rettinger endres.{batchInspectorLayerId === layerId ? ' Masseendringen må forhåndsvises på nytt.' : ''}</p>
        </GmiConfirmDialog>;
      })()}
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
                const isIdentity = Boolean(header.column.columnDef.meta?.identity);
                const isFixed = header.column.columnDef.meta?.isFixed || header.column.columnDef.meta?.pinned || isIdentity;
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
                    data-focus-column={focusFields.includes(headerId) || undefined}
                    draggable={!isZoom && !isIdentity && (!isContextualInspection || !isFixed)}
                    onDragStart={() => handleDragStart(headerId)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => !isIdentity && (!isContextualInspection || !isFixed) && handleDrop(headerId)}
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
                      boxShadow: isFixed && !isIdentity
                        ? '2px 0 4px -2px rgba(15,23,43,0.18)'
                        : undefined,
                    }}
                  >
                    <button type="button" disabled={isZoom} aria-label={isZoom ? 'Kart' : isIdentity ? 'Sorter etter objektnummer' : `Sorter etter ${fullHeaderLabel}`}
                      title={isIdentity ? 'Objektnummer – samme nummer som «Ledning 38» i Rettinger' : undefined}
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
                  data-table-revealed={row.id === revealedRowId || undefined}
                  data-review-outcome={batchReview?.rows[gmiSelectionKey(scope, row.original.__index)]?.outcome}
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
                    outline: row.id === revealedRowId || gridHasFocus && row.id === navigationRow?.id ? '2px solid var(--gmi-interactive)' : undefined,
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
                    <SelectionCheckbox label={`${selectedKeys.has(gmiSelectionKey(scope, row.original.__index)) ? 'Fjern' : 'Velg'} ${gmiObjectNumber(scope, row.original.__index, objectIdOf(scope, row.original.__index)).label.toLowerCase()}`}
                      checked={selectedKeys.has(gmiSelectionKey(scope, row.original.__index))} onToggle={(range) => toggleSelectionRow(row.original, range)} />
                  </div>}
                  {row.getVisibleCells().map((cell, index) => {
                    const isZoom = index === 0;
                    const isIdentity = Boolean(cell.column.columnDef.meta?.identity);
                    const isFixed = cell.column.columnDef.meta?.isFixed || cell.column.columnDef.meta?.pinned || isIdentity;
                    const cellId = cell.column.id;
                    const width = columnWidths[cellId] || 80;
                    const stickyLeft = stickyLeftFor(cellId);

                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        aria-colindex={index + 1 + (selectionEnabled ? 1 : 0)}
                        data-column-label={isZoom || typeof cell.column.columnDef.header !== 'string' ? undefined : cell.column.columnDef.header || cellId}
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
                          boxShadow: isZoom && isActiveObject ? 'inset 3px 0 var(--gmi-interactive)' : isFixed && !isIdentity
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

      {activeFullText && (gridHasFocus || fullTextFocused) && (
        <div
          ref={fullTextRef}
          role="region"
          aria-label="Full tekst i aktiv rad"
          data-table-full-text={activeFullText.rowId}
          tabIndex={0}
          onFocus={() => setFullTextFocused(true)}
          onBlur={() => setFullTextFocused(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); tableContainerRef.current?.focus(); } }}
          className="gmi-focus-ring max-h-14 shrink-0 overflow-y-auto border-t border-gmi-border bg-gmi-surface px-3 py-0.5 text-[11px] leading-snug text-gmi-text"
        >
          <p className="text-[9px] text-gmi-text-muted">Full tekst i aktiv rad · Shift+Enter i tabellen: gå hit for å rulle · Escape: tilbake til tabellen</p>
          <dl>{activeFullText.entries.map((entry, index) => (
            <div key={index} className="flex gap-1"><dt className="shrink-0 font-medium">{entry.label}:</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{entry.text}</dd></div>
          ))}</dl>
        </div>
      )}
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
