'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowArcLeftIcon, ArrowArcRightIcon, ArrowLeftIcon, DownloadSimpleIcon, MagnifyingGlassIcon, TableIcon, StackIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import {
  describeGmiEditStatus, describeGmiObject, gmiChangeSetDependents, gmiEditDownloadState, gmiEditMessage, gmiObjectContext,
  gmiObjectKey, scopeToTableTab, summarizeGmiEditCounts,
} from '@/lib/gmiEditView.mjs';
import PhotoIconButton from '@/components/photos/PhotoIconButton';
import useGmiEditLayer from './useGmiEditLayer';
import GmiObjectEditor from './GmiObjectEditor';
import GmiChangeList from './GmiChangeList';
import GmiExportDialog from './GmiExportDialog';
import GmiConfirmDialog from './GmiConfirmDialog';
import GmiBatchDialog from './GmiBatchDialog';
import GmiFullValidation from './GmiFullValidation';
import './gmiEdit.css';

export const GMI_EDIT_INSPECTOR_ROOT_ID = 'gmi-edit-inspector-root';
const LIST_PAGE = 200;
const NO_CELLS = Object.freeze([]);
// Memo bodies avoid optional chains on possibly-null values: the React Compiler can turn
// `value?.field` into a non-optional memo dependency (`value.field`) and crash on null.

function ObjectList({ layer, scope, onScope, query, onQuery, changedOnly, onChangedOnly, changedObjects, selectedKey, onSelect }) {
  'use no memo';
  const listKey = `${scope}|${query.trim().toLowerCase()}|${changedOnly}`;
  const [page, setPage] = useState({ key: listKey, limit: LIST_PAGE });
  const limit = page.key === listKey ? page.limit : LIST_PAGE;
  const data = layer.data || null;
  const objects = useMemo(() => (data ? (scope === 'line' ? data.lines : data.points) : null) || [], [data, scope]);
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const out = [];
    objects.forEach((object, sourceIndex) => {
      const key = gmiObjectKey(scope, sourceIndex);
      if (changedOnly && !changedObjects.has(key)) return;
      const title = describeGmiObject(scope, sourceIndex, object.id ?? null);
      const context = gmiObjectContext(object.attributes);
      if (needle && !`${title} ${context} ${object.guid || ''}`.toLowerCase().includes(needle)) return;
      out.push({ key, sourceIndex, title, context, changed: changedObjects.has(key) });
    });
    return out;
  }, [objects, scope, changedOnly, changedObjects, needle]);
  const lines = layer.data?.lines?.length || 0, points = layer.data?.points?.length || 0;
  return <div className="gmi-edit-object-panel">
    <div className="gmi-edit-list-controls">
      <div className="gmi-edit-segmented" role="group" aria-label="Objekttype">
        {[['line', `Ledninger (${lines})`], ['point', `Punkter (${points})`]].map(([key, text]) => <button key={key} type="button" aria-pressed={scope === key}
          className={`gmi-compact-button gmi-focus-ring${scope === key ? ' gmi-selected-control' : ''}`} onClick={() => onScope(key)}>{text}</button>)}
      </div>
      <div className="gmi-edit-search">
        <MagnifyingGlassIcon size={14} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Søk nummer, tema, GUID…" aria-label="Søk etter objekt" />
      </div>
      <label className="gmi-edit-check"><input type="checkbox" checked={changedOnly} onChange={(event) => onChangedOnly(event.target.checked)} />Bare objekter med rettinger</label>
    </div>
    <ul className="gmi-edit-object-list" aria-label={scope === 'line' ? 'Ledninger' : 'Punkter'}>
      {rows.slice(0, limit).map((row) => <li key={row.key}>
        <button type="button" className="gmi-edit-object-row gmi-focus-ring" aria-pressed={row.key === selectedKey} data-object-key={row.key}
          onClick={() => onSelect({ scope, sourceIndex: row.sourceIndex })}>
          <span className="gmi-edit-object-title">{row.title}{row.changed && <span className="gmi-edit-changed-pill">Rettet</span>}</span>
          {row.context && <span className="gmi-edit-object-context">{row.context}</span>}
        </button>
      </li>)}
      {!rows.length && <li className="gmi-edit-empty">{changedOnly ? 'Ingen objekter med rettinger.' : 'Ingen objekter funnet.'}</li>}
      {rows.length > limit && <li><button type="button" className="gmi-edit-link gmi-edit-pad" onClick={() => setPage({ key: listKey, limit: limit + LIST_PAGE })}>Vis flere ({rows.length - limit} til)</button></li>}
    </ul>
  </div>;
}

/**
 * Rettinger: individual corrections of one imported GMI survey layer.
 * Left panel (this component): layer and session status, objects, change
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

  const [tab, setTab] = useState('objects');
  const [scope, setScope] = useState(() => (layer?.data?.lines?.length ? 'line' : 'point'));
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeChangeSetId, setActiveChangeSetId] = useState(null);
  const [pending, setPending] = useState(null);   // { title, body, confirmLabel, run }
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formRevision, setFormRevision] = useState(0);
  const correction = useStore((state) => state.gmiEditWorkspace?.layerId === layerId ? state.gmiEditWorkspace.correction : null);
  const [batchOpen, setBatchOpen] = useState(Boolean(correction));
  const objectDirtyRef = useRef(false), batchDirtyRef = useRef(false), batchResetRef = useRef(null);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty) => { objectDirtyRef.current = dirty; dirtyRef.current = dirty || batchDirtyRef.current; onDraftChange?.(dirtyRef.current); }, [onDraftChange]);
  const onBatchDirtyChange = useCallback((dirty) => { batchDirtyRef.current = dirty; dirtyRef.current = dirty || objectDirtyRef.current; onDraftChange?.(dirtyRef.current); }, [onDraftChange]);
  const registerBatchReset = useCallback((reset) => { batchResetRef.current = reset; }, []);

  // Enter with the existing object-list scope, even if another layer or a Validator inspection was open.
  const enterObjectTable = useEffectEvent(() => {
    if (!layer) return;
    openLayerDataTable(layerId);
    setLayerDataTableTab(layerId, scopeToTableTab(scope));
  });
  useEffect(() => { enterObjectTable(); }, [layerId]);
  // Also covers temporary workspace unmounts, e.g. opening FOTO through the page guard.
  useEffect(() => () => {
    if (useStore.getState().gmiEditSelection?.binding.layerId === layerId) useStore.setState({ gmiEditSelection: null });
  }, [layerId]);

  const presentation = describeGmiEditStatus(descriptor);
  const editable = presentation.editable && Boolean(view);
  const changedList = view ? view.changedCells : NO_CELLS;
  const changedObjects = useMemo(() => new Set(changedList.map((cell) => gmiObjectKey(cell.scope, cell.sourceIndex))), [changedList]);
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
    if (selected && target.scope === selected.scope && target.sourceIndex === selected.sourceIndex) {
      setActiveChangeSetId(changeSetId); syncObjectTable(target); return;
    }
    guard(() => {
      setSelected(target); setScope(target.scope); setActiveChangeSetId(changeSetId); highlight(target);
      syncObjectTable(target);
    });
  }, [guard, highlight, selected, syncObjectTable]);

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
  const undo = () => {
    const id = view?.changeSets.at(-1)?.id, label = labelOf(id), target = firstObjectOf(id);
    if (runTransition(gmiEditSessions.undo(view.handle), `Angret: ${label}`) && target) select(target, null);
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
      <button type="button" role="tab" aria-selected={tab === 'objects'} className="gmi-focus-ring" onClick={() => setTab('objects')}>Objekter</button>
      <button type="button" role="tab" aria-selected={tab === 'changes'} className="gmi-focus-ring" onClick={() => setTab('changes')}>
        Endringer{view?.changeSets.length ? ` (${view.changeSets.length})` : ''}
      </button>
      {!tableOpenOnLayer && <PhotoIconButton icon={TableIcon} size={16} label="Åpne datatabell" className="gmi-edit-tab-tool" onClick={() => openLayerDataTable(layerId)} />}
    </div>
    <div className="gmi-edit-body">
      {tab === 'objects'
        ? <ObjectList layer={layer} scope={scope} onScope={(nextScope) => { setScope(nextScope); syncObjectTable({ scope: nextScope }); }} query={query} onQuery={setQuery} changedOnly={changedOnly} onChangedOnly={setChangedOnly}
          changedObjects={changedObjects} selectedKey={selectedKey} onSelect={(target) => select(target)} />
        : <GmiChangeList changeSets={view?.changeSets || []} redoCount={view?.redo.length || 0} effective={view?.effective} activeChangeSetId={activeChangeSetId}
          editable={editable} onSelectObject={(target, id) => select(target, id)} onDiscard={discard} />}
    </div>
    <footer className="gmi-edit-footer">
      <button type="button" className="gmi-compact-button gmi-focus-ring gmi-batch-open" disabled={!editable}
        onClick={() => guard(() => setBatchOpen(true), 'objektet')}><StackIcon size={16} aria-hidden="true" /> Masseendringer</button>
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
    {inspectorRoot && createPortal(<GmiObjectEditor key={`${selectedKey}:${view?.handle.sessionId || descriptor?.state}:${formRevision}`} view={view} status={descriptor}
      object={selectedObject} scope={selected?.scope} sourceIndex={selected?.sourceIndex} onDirtyChange={onDirtyChange} onLocate={locate}
      onStaged={() => { setChangedOnly(false); }} onShowChangeSet={(id) => { setTab('changes'); setActiveChangeSetId(id); }} />, inspectorRoot)}
    {exportOpen && view && <GmiExportDialog layerId={layerId} view={view} status={status} onClose={() => setExportOpen(false)} />}
    {batchOpen && view && <GmiBatchDialog correction={correction} view={view} onClose={() => { setBatchOpen(false); if (correction) useStore.setState({ gmiEditWorkspace: { layerId } }); }} onDirtyChange={onBatchDirtyChange} registerReset={registerBatchReset}
      onStaged={(changeSet) => { setTab('changes'); setActiveChangeSetId(changeSet.id); setNotice({ tone: 'ok', text: `Lagt til: ${changeSet.label}` }); }} />}
    {pending && <GmiConfirmDialog title={pending.title} confirmLabel={pending.confirmLabel} testId="workspace"
      onCancel={() => setPending(null)} onConfirm={() => { const run = pending.run; setPending(null); run(); }}>{pending.body}</GmiConfirmDialog>}
  </section>;
}
