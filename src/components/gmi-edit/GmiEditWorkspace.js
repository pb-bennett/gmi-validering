'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowArcLeftIcon, ArrowArcRightIcon, ArrowLeftIcon, DownloadSimpleIcon, TableIcon, StackIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import {
  describeGmiEditStatus, gmiChangeSetDependents, gmiEditDownloadState, gmiEditMessage,
  gmiObjectKey, scopeToTableTab, summarizeGmiEditCounts, GMI_EDIT_TABLE_VIEWS,
} from '@/lib/gmiEditView.mjs';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import useGmiEditLayer from './useGmiEditLayer';
import GmiObjectEditor from './GmiObjectEditor';
import GmiChangeList from './GmiChangeList';
import GmiExportDialog from './GmiExportDialog';
import GmiConfirmDialog from './GmiConfirmDialog';
import GmiBatchDialog from './GmiBatchDialog';
import GmiBatchInspector from './GmiBatchInspector';
import GmiChangeSetDetail from './GmiChangeSetDetail';
import { gmiSelectionTargets } from '@/lib/gmiBatchInspectorView.mjs';
import GmiFullValidation from './GmiFullValidation';
import GmiLayerFilters from './GmiLayerFilters';
import './gmiEdit.css';

export const GMI_EDIT_INSPECTOR_ROOT_ID = 'gmi-edit-inspector-root';
/**
 * Rettinger: individual corrections of one imported GMI survey layer.
 * Left panel (this component): layer and session status, filters, change
 * list, undo/redo and the revised-GMI download. The object editor is
 * portalled into the right inspector slot rendered by the page.
 */
export default function GmiEditWorkspace({ layerId, inspectorRoot = null, onExit, onGuardChange, onDraftChange }) {
  // Opted out of the React Compiler: it turns optional chains on nullable session views (`view?.x`)
  // into non-optional memo dependencies and crashes before a session exists. Derived values are
  // memoized explicitly per published editing revision instead.
  'use no memo';
  const { layer, status, descriptor, view, openError, retry } = useGmiEditLayer(layerId, { autoOpen: true });
  const closeWorkspace = useStore((state) => state.closeGmiEditWorkspace);
  const setHighlightedFeature = useStore((state) => state.setHighlightedFeature);
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);
  const openLayerDataTable = useStore((state) => state.openLayerDataTable);
  const setLayerDataTableTab = useStore((state) => state.setLayerDataTableTab);
  const tableOpenOnLayer = useStore((state) => state.ui.layerDataTable?.isOpen && state.ui.layerDataTable?.layerId === layerId);

  const [tab, setTab] = useState('filter');
  const [selected, setSelected] = useState(null);
  const [activeChangeSetId, setActiveChangeSetId] = useState(null);
  const [pending, setPending] = useState(null);   // { title, body, confirmLabel, run }
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formRevision, setFormRevision] = useState(0);
  const correction = useStore((state) => state.gmiEditWorkspace?.layerId === layerId ? state.gmiEditWorkspace.correction : null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchInspector, setBatchInspector] = useState(Boolean(correction));
  const [batchInspected, setBatchInspected] = useState(null);
  // A history entry shown in the right inspector (read-only ChangeSet details).
  const [detailId, setDetailId] = useState(null);
  const closeBatchInspector = useCallback(() => { setBatchInspector(false); setBatchInspected(null); }, []);
  const objectDirtyRef = useRef(false), batchDirtyRef = useRef(false), batchResetRef = useRef(null);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty) => { objectDirtyRef.current = dirty; dirtyRef.current = dirty || batchDirtyRef.current; onDraftChange?.(dirtyRef.current); }, [onDraftChange]);
  const onBatchDirtyChange = useCallback((dirty) => { batchDirtyRef.current = dirty; dirtyRef.current = dirty || objectDirtyRef.current; onDraftChange?.(dirtyRef.current); }, [onDraftChange]);
  const registerBatchReset = useCallback((reset) => { batchResetRef.current = reset; }, []);

  // The Data Table owns geometry. Preserve its explicit per-layer choice; a fresh layer defaults to lines.
  const enterObjectTable = useEffectEvent(() => {
    if (!layer) return;
    const storedTab = useStore.getState().ui.layerDataTable?.activeTabByLayer?.[layerId];
    openLayerDataTable(layerId);
    setLayerDataTableTab(layerId, correction ? 'ledninger' : storedTab || (layer.data?.lines?.length ? 'ledninger' : 'punkter'));
  });
  useEffect(() => { enterObjectTable(); }, [layerId]);
  // Also covers temporary workspace unmounts, e.g. opening FOTO through the page guard.
  useEffect(() => () => {
    if (useStore.getState().gmiEditSelection?.binding.layerId === layerId) useStore.setState({ gmiEditSelection: null });
    useStore.setState({ gmiBatchInspectorRequest: null, gmiBatchTableReview: null, gmiEditTableExpanded: false, gmiBatchInspectorLayerId: null, gmiEditColumnFocus: null });
  }, [layerId]);
  // The Data Table shows a batch-mode indicator instead of «Rediger valgte» while this is open.
  useEffect(() => {
    if (!batchInspector) return undefined;
    useStore.setState({ gmiBatchInspectorLayerId: layerId });
    return () => { if (useStore.getState().gmiBatchInspectorLayerId === layerId) useStore.setState({ gmiBatchInspectorLayerId: null }); };
  }, [batchInspector, layerId]);

  const presentation = describeGmiEditStatus(descriptor);
  const editable = presentation.editable && Boolean(view);
  const selectedKey = selected ? gmiObjectKey(selected.scope, selected.sourceIndex) : null;
  const selectedObject = selected ? (selected.scope === 'line' ? layer?.data?.lines : layer?.data?.points)?.[selected.sourceIndex] ?? null : null;

  /** Every way away from the current object passes here: unsubmitted form values are never dropped silently. */
  const guard = useCallback((run, what = 'objektet') => {
    if (!dirtyRef.current) { run(); return; }
    setPending({
      title: 'Forkaste endringer i skjemaet?',
      body: <p>Du har skrevet inn verdier for {what} som ikke er lagt til som retting. Går du videre, forkastes de. Rettinger som allerede er lagt til, beholdes.</p>,
      confirmLabel: 'Forkast skjemaet',
      // The next action can be cancelled by the staged-corrections guard, leaving
      // this workspace mounted. Reset the editor's local form even in that case.
      run: () => { batchResetRef.current?.(); onDirtyChange(false); onBatchDirtyChange(false); setFormRevision((revision) => revision + 1); run(); },
    });
  }, [onDirtyChange, onBatchDirtyChange]);

  useEffect(() => {
    useStore.setState({ gmiEditWorkspaceGuard: guard });
    return () => { if (useStore.getState().gmiEditWorkspaceGuard === guard) useStore.setState({ gmiEditWorkspaceGuard: null }); };
  }, [guard]);
  // Also handles a new handoff while this workspace is already mounted.
  const enterCorrection = useEffectEvent(() => {
    if (!correction) return;
    setBatchOpen(false); setBatchInspector(true); setBatchInspected(null); setDetailId(null);
    openLayerDataTable(layerId); setLayerDataTableTab(layerId, 'ledninger');
    setFormRevision((revision) => revision + 1);
  });
  useEffect(() => { enterCorrection(); }, [correction]);
  const handoffError = useStore((state) => state.gmiEditHandoffError);

  const highlight = useCallback((target) => {
    setHighlightedFeature(`${scopeToTableTab(target.scope)}-${layerId}-${target.sourceIndex}`);
  }, [layerId, setHighlightedFeature]);

  const syncObjectTable = useCallback((target) => {
    const state = useStore.getState();
    const table = state.ui.layerDataTable;
    // A Validator inspection pins its own geometry. An explicit selection in
    // Rettinger returns the open table to this layer's ordinary object browser.
    if (table?.isOpen && (table.layerId !== layerId || state.objectTableInspection)) openLayerDataTable(layerId);
    setLayerDataTableTab(layerId, scopeToTableTab(target.scope));
  }, [layerId, openLayerDataTable, setLayerDataTableTab]);

  const select = useCallback((target, changeSetId = null) => {
    if (batchInspector) {
      const object = (target.scope === 'line' ? layer?.data?.lines : layer?.data?.points)?.[target.sourceIndex];
      if (object) setBatchInspected({ ...target, object });
      highlight(target); syncObjectTable(target); return;
    }
    // Choosing an object always returns the inspector from ChangeSet details to the editor.
    if (selected && target.scope === selected.scope && target.sourceIndex === selected.sourceIndex) {
      setActiveChangeSetId(changeSetId); setDetailId(null); syncObjectTable(target); return;
    }
    guard(() => {
      setSelected(target); setActiveChangeSetId(changeSetId); setDetailId(null); highlight(target);
      syncObjectTable(target);
    });
  }, [guard, highlight, selected, syncObjectTable, batchInspector, layer]);

  const onBatchRequest = useEffectEvent((request) => {
    if (!request || request.layerId !== layerId) return;
    useStore.setState({ gmiBatchInspectorRequest: null });
    if (batchOpen || batchInspector || !view) return;
    guard(() => {
      // Re-read after the draft confirmation; its scope may have changed.
      const selection = useStore.getState().gmiEditSelection;
      const result = gmiSelectionTargets(view, selection);
      if (!result.ok && result.code !== 'line-only') return;
      setBatchInspector(true); setBatchInspected(null);
      useStore.getState().changeGmiEditSelection(layerId, { type: 'show-only', value: true }, selection.binding);
      syncObjectTable({ scope: selection.scope });
    });
  });
  useEffect(() => useStore.subscribe((state, previous) => {
    if (state.gmiBatchInspectorRequest !== previous.gmiBatchInspectorRequest) onBatchRequest(state.gmiBatchInspectorRequest);
  }), []);

  // Row clicks in the Data Table arrive as one-shot store requests.
  const onObjectRequest = useEffectEvent((request) => {
    if (!request || request.layerId !== layerId) return;
    useStore.getState().clearGmiEditObjectRequest(request);
    select({ scope: request.scope, sourceIndex: request.sourceIndex });
  });
  useEffect(() => useStore.subscribe((state, previous) => {
    if (state.gmiEditObjectRequest !== previous.gmiEditObjectRequest) onObjectRequest(state.gmiEditObjectRequest);
  }), []);

  const locate = () => {
    const coordinates = selectedObject?.coordinates;
    const vertex = coordinates?.length ? (selected.scope === 'point' ? coordinates[0] : coordinates[Math.floor(coordinates.length / 2)]) : null;
    if (!vertex || vertex.x === undefined || vertex.y === undefined) { setNotice({ tone: 'warning', text: 'Objektet har ingen koordinater som kan vises.' }); return; }
    const tableTab = scopeToTableTab(selected.scope);
    viewObjectInMap(`${tableTab}-${layerId}-${selected.sourceIndex}`, [vertex.y, vertex.x], 20, {
      layerId, objectType: selected.scope === 'line' ? 'pipe' : 'point',
      lineIndex: selected.scope === 'line' ? selected.sourceIndex : undefined, pointIndex: selected.scope === 'point' ? selected.sourceIndex : undefined,
    });
  };

  const exit = () => guard(() => { closeWorkspace(); onExit?.(); }, 'objektet');

  // Page-level actions that would unmount this workspace (global reset, opening FOTO) go through the same
  // draft guard and dialog. Only the boolean "draft exists" leaves this component; the draft itself stays in the editor.
  useEffect(() => {
    onGuardChange?.(guard);
    return () => onGuardChange?.(null);
  }, [onGuardChange, guard]);

  const runTransition = (result, text) => {
    if (!result.ok) { setNotice({ tone: 'error', text: gmiEditMessage(result.code) }); return false; }
    setNotice({ tone: 'ok', text });
    return true;
  };
  const labelOf = (id) => view?.changeSets.find((changeSet) => changeSet.id === id)?.label
    || view?.redo.find((changeSet) => changeSet.id === id)?.label || id;
  const firstObjectOf = (id) => {
    const changeSet = [...(view?.changeSets || []), ...(view?.redo || [])].find((entry) => entry.id === id);
    const cell = changeSet?.cells[0];
    return cell ? { scope: cell.scope, sourceIndex: cell.sourceIndex } : null;
  };
  const undo = ({ reveal = true } = {}) => {
    const id = view?.changeSets.at(-1)?.id, label = labelOf(id), target = firstObjectOf(id);
    if (runTransition(gmiEditSessions.undo(view.handle), `Angret: ${label}`) && target && reveal) select(target, null);
  };
  /** Open one history entry's details in the right inspector (through the draft guard). */
  const showChangeSet = (id) => {
    if (detailId === id && !batchInspector) { setDetailId(null); return; }
    guard(() => { closeBatchInspector(); setDetailId(id); setActiveChangeSetId(id); }, batchInspector ? 'masseendringen' : 'objektet');
  };
  /** Review a correction in the Data Table: Foreslått, its geometry, edited fields in focus. */
  const showProposed = (changeSet) => {
    const state = useStore.getState(), table = state.ui.layerDataTable;
    if (!table?.isOpen || table.layerId !== layerId || state.objectTableInspection) openLayerDataTable(layerId);
    if (changeSet.cells[0]) setLayerDataTableTab(layerId, scopeToTableTab(changeSet.cells[0].scope));
    useStore.getState().setGmiEditTableView(layerId, GMI_EDIT_TABLE_VIEWS.PROPOSED);
  };
  const renderChangeSet = (changeSet, variant) => {
    const index = view.changeSets.findIndex((entry) => entry.id === changeSet.id);
    return <GmiChangeSetDetail key={changeSet.id} layerId={layerId} changeSet={changeSet} number={index + 1} effective={view.effective}
      downloadState={gmiEditDownloadState(status) === 'downloaded' ? 'downloaded' : 'unsaved'} editable={editable}
      isLast={index === view.changeSets.length - 1} variant={variant}
      onSelectObject={(target, id) => select(target, id)} onShowProposed={showProposed}
      onUndo={() => undo({ reveal: false })} onDiscard={discard} onClose={variant === 'history' ? () => setDetailId(null) : undefined} />;
  };
  const redo = () => {
    const id = view?.redo.at(-1)?.id, label = labelOf(id), target = firstObjectOf(id);
    if (runTransition(gmiEditSessions.redo(view.handle), `Gjort om: ${label}`) && target) select(target, id);
  };
  const discard = (id) => {
    const dependents = gmiChangeSetDependents(view.changeSets, id);
    const perform = () => {
      const result = gmiEditSessions.discard(view.handle, id);
      runTransition(result, `Forkastet: ${labelOf(id)}${dependents.length ? '. Senere rettinger er beholdt; kontroller dem.' : ''}`);
      if (activeChangeSetId === id) setActiveChangeSetId(null);
      if (detailId === id) setDetailId(null);
    };
    if (!dependents.length) { perform(); return; }
    setPending({
      title: 'Forkaste en tidligere retting?',
      body: <>
        <p>«{labelOf(id)}» kan være forutsetningen for senere rettinger. De blir <strong>ikke</strong> forkastet automatisk:</p>
        <ul className="gmi-edit-unsaved-layers">{dependents.map((entry) => <li key={entry.id}>{entry.label || entry.id}
          {entry.reasons.includes('same-object') ? ' – retter samme objekt' : ''}{entry.reasons.includes('conflict') ? ' – erstattet verdier fra denne' : ''}
          {entry.reasons.includes('eligibility') ? ' – utvalget ble beregnet med denne rettingen' : ''}</li>)}</ul>
        <p>For eksempel kan en SDR-retting bygge på en rettet Material-verdi. Kontroller de senere rettingene etterpå.</p>
      </>,
      confirmLabel: 'Forkast likevel',
      run: perform,
    });
  };
  const discardAll = () => setPending({
    title: 'Forkaste alle rettinger?',
    body: <p>Alle {view.changeSets.length} rettinger for laget fjernes{status?.unsaved ? ', og de er ikke lastet ned' : ''}. Angre-historikken tømmes også. Originalfilen endres ikke.</p>,
    confirmLabel: 'Forkast alle',
    run: () => { runTransition(gmiEditSessions.discardAll(view.handle), 'Alle rettinger er forkastet.'); setActiveChangeSetId(null); },
  });

  if (!layer) return null;
  // Undone/discarded entries close their details automatically.
  const detailChangeSet = detailId ? view?.changeSets.find((changeSet) => changeSet.id === detailId) || null : null;
  const counts = summarizeGmiEditCounts(status);
  const downloadState = gmiEditDownloadState(status);
  const problem = openError && descriptor?.state !== 'editable' && descriptor?.state !== 'read-only' && descriptor?.state !== 'error' ? gmiEditMessage(openError) : null;

  return <section className="gmi-edit-workspace" aria-label="Rettinger" data-gmi-edit-state={descriptor?.state || 'none'}>
    <header className="gmi-edit-header">
      <div className="gmi-edit-title-row">
        <PhotoIconButton icon={ArrowLeftIcon} size={20} label="Tilbake til appen" onClick={exit} className="photo-workspace-back" />
        <div className="min-w-0">
          <p className="gmi-edit-kicker">Rettinger</p>
          <h1 title={layer.name}>{layer.name}</h1>
        </div>
      </div>
      <p className="gmi-edit-status-line">
        <span className="gmi-edit-status-pill" data-tone={presentation.tone} data-gmi-edit-status>{presentation.label}</span>
        {counts && <span data-gmi-edit-counts>{counts}</span>}
        {downloadState === 'unsaved' && <span className="gmi-edit-download-pill" data-download-state="unsaved">Ikke lastet ned</span>}
        {downloadState === 'downloaded' && <span className="gmi-edit-download-pill" data-download-state="downloaded">Lastet ned</span>}
      </p>
      {presentation.message && <div className="gmi-edit-message" data-tone={presentation.tone} role={presentation.tone === 'error' ? 'alert' : 'status'}>
        <p>{presentation.message}</p>
        {(descriptor?.state === 'error' || descriptor?.state === 'invalidated') && <button type="button" className="gmi-edit-link" onClick={retry}>Åpne filen på nytt</button>}
      </div>}
      {problem && <p className="gmi-edit-message" data-tone="error" role="alert">{problem}</p>}
      {notice && <p className="gmi-edit-message gmi-edit-notice" data-tone={notice.tone} role="status">{notice.text}</p>}
    </header>
    <GmiFullValidation view={view} layerId={layerId} guard={guard} />
    <div className="gmi-edit-tabs" role="tablist" aria-label="Rettinger">
      <button type="button" role="tab" aria-selected={tab === 'filter'} className="gmi-focus-ring" onClick={() => setTab('filter')}>Filter</button>
      <button type="button" role="tab" aria-selected={tab === 'changes'} className="gmi-focus-ring" onClick={() => setTab('changes')}>
        Endringer{view?.changeSets.length ? ` (${view.changeSets.length})` : ''}
      </button>
      {!tableOpenOnLayer && <PhotoIconButton icon={TableIcon} size={16} label="Åpne datatabell" className="gmi-edit-tab-tool" onClick={() => openLayerDataTable(layerId)} />}
    </div>
    <div className="gmi-edit-body">
      {tab === 'filter' ? <GmiLayerFilters layerId={layerId} layer={layer} status={status} />
        : <GmiChangeList changeSets={view?.changeSets || []} redoCount={view?.redo.length || 0} effective={view?.effective} activeChangeSetId={activeChangeSetId}
          detailChangeSetId={batchInspector ? null : detailChangeSet?.id || null} editable={editable} onSelectObject={(target, id) => select(target, id)}
          onDiscard={discard} onShowDetail={view ? showChangeSet : undefined} />}
    </div>
    <footer className="gmi-edit-footer">
      <button type="button" className="gmi-compact-button gmi-focus-ring gmi-batch-open" disabled={!editable}
        onClick={() => guard(() => { closeBatchInspector(); setBatchOpen(true); }, 'objektet')}><StackIcon size={16} aria-hidden="true" /> Masseendringer</button>
      <div className="gmi-edit-history">
        <PhotoIconButton icon={ArrowArcLeftIcon} label="Angre siste retting" tooltip={view?.summary.canUndo ? `Angre: ${labelOf(view.changeSets.at(-1).id)}` : 'Ingenting å angre'}
          unavailable={!editable || !view?.summary.canUndo} onClick={undo} />
        <PhotoIconButton icon={ArrowArcRightIcon} label="Gjør om retting" tooltip={view?.summary.canRedo ? `Gjør om: ${labelOf(view.redo.at(-1).id)}` : 'Ingenting å gjøre om'}
          unavailable={!editable || !view?.summary.canRedo} onClick={redo} />
        {editable && view.changeSets.length > 0 && <button type="button" className="gmi-edit-link" onClick={discardAll}>Forkast alle</button>}
      </div>
      <button type="button" className="gmi-primary-control gmi-focus-ring gmi-edit-download" disabled={!editable} onClick={() => setExportOpen(true)}
        title={editable ? undefined : 'Filen kan ikke lastes ned som revidert GMI fordi den ikke kan rettes sikkert.'}>
        <DownloadSimpleIcon size={16} aria-hidden="true" /> Last ned revidert GMI <span className="gmi-edit-experimental-tag">Eksperimentell</span>
      </button>
    </footer>
    {inspectorRoot && createPortal(batchInspector && view ? <GmiBatchInspector key={`batch:${formRevision}`} view={view} onDirtyChange={onBatchDirtyChange} registerReset={registerBatchReset}
      onClose={closeBatchInspector} onRequestClose={() => guard(closeBatchInspector, 'masseendringen')} inspected={batchInspected} onInspectClose={() => setBatchInspected(null)}
      renderChangeSet={(changeSet) => renderChangeSet(changeSet, 'staged')}
      onStaged={(changeSet) => { setTab('changes'); setActiveChangeSetId(changeSet.id); setNotice(null); }} />
      : detailChangeSet && view ? <div className="gmi-edit-editor">{renderChangeSet(detailChangeSet, 'history')}</div>
      : <GmiObjectEditor key={`${selectedKey}:${view?.handle.sessionId || descriptor?.state}:${formRevision}`} view={view} status={descriptor}
      object={selectedObject} scope={selected?.scope} sourceIndex={selected?.sourceIndex} onDirtyChange={onDirtyChange} onLocate={locate}
      onShowChangeSet={(id) => { setTab('changes'); setActiveChangeSetId(id); }} />, inspectorRoot)}
    {exportOpen && view && <GmiExportDialog layerId={layerId} view={view} status={status} onClose={() => setExportOpen(false)} />}
    {batchOpen && view && <GmiBatchDialog view={view} onClose={() => setBatchOpen(false)} onDirtyChange={onBatchDirtyChange} registerReset={registerBatchReset}
      onStaged={(changeSet) => { setTab('changes'); setActiveChangeSetId(changeSet.id); setNotice({ tone: 'ok', text: `Lagt til: ${changeSet.label}` }); }} />}
    {handoffError && <p role="alert">{handoffError}</p>}
    {pending && <GmiConfirmDialog title={pending.title} confirmLabel={pending.confirmLabel} testId="workspace"
      onCancel={() => setPending(null)} onConfirm={() => { const run = pending.run; setPending(null); run(); }}>{pending.body}</GmiConfirmDialog>}
  </section>;
}
