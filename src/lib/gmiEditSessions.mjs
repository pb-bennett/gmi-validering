// App binding of the GMI editing-session registry (M3).
//
// `gmiEditSessions` is the one registry for the survey store, fed by the
// existing `loadedGmiSources` (the original imported Files, held outside
// Zustand). Zustand receives only `state.gmiEditStatus[layerId]`: a small
// frozen status per opened layer (state, revision, counts, unsaved flag). No
// bytes, documents, parser results or proposed datasets enter the store, and
// the status slice is not persisted.
//
// Lifecycle (bindGmiEditSessionStore):
// - any change of `state.layers` (remove, reset, replaced data) reconciles the
//   registry: sessions whose source is no longer live are disposed together
//   with their proposed-cache entries;
// - removeLayer/resetAll in store.js refuse with `gmi-edits-pending` while an
//   affected session has unsaved changes, unless `{discardGmiEdits: true}` is
//   passed explicitly (the future Rettinger UI confirms first);
// - a `beforeunload` listener is attached only while unsaved changes exist.
import { createGmiEditSessions } from './gmi-edit/editSessions.mjs';
import { isLoadedGmiSurveyLayer, loadedGmiSources } from './photos/loadedGmiSource.mjs';
import { reconcileGmiEditSelection } from './gmiEditSelection.mjs';

let surveyStore = null, unsubscribeStore = null, unloadGuard = null;

function publishStatus(layerId, status) {
  if (!surveyStore) return;
  const current = surveyStore.getState().gmiEditStatus || {};
  if (status ? current[layerId] === status : !(layerId in current)) return;
  const next = { ...current };
  if (status) next[layerId] = status; else delete next[layerId];
  surveyStore.setState({ gmiEditStatus: next }, false, 'gmiEdit/status');
}

export const gmiEditSessions = createGmiEditSessions({
  sources: loadedGmiSources,
  getLayer: (layerId) => surveyStore?.getState().layers?.[layerId] ?? null,
  isGmiLayer: isLoadedGmiSurveyLayer,
  onChange: (layerId, status) => { publishStatus(layerId, status); unloadGuard?.sync(); },
});

/**
 * A `beforeunload` guard that is attached only while `registry` reports
 * unsaved changes, so pages without edits keep normal unload (and bfcache)
 * behaviour. Call `sync()` after registry changes; `dispose()` detaches it.
 */
export function createGmiEditUnloadGuard(target, registry) {
  let attached = false;
  const listener = (event) => {
    if (!registry.hasUnsavedChanges()) return undefined;
    event.preventDefault();
    event.returnValue = '';   // legacy browsers need a value to show the prompt
    return '';
  };
  const guard = {
    get attached() { return attached; },
    sync() {
      if (!target?.addEventListener) return;
      const wanted = registry.hasUnsavedChanges();
      if (wanted && !attached) { target.addEventListener('beforeunload', listener); attached = true; }
      else if (!wanted && attached) { target.removeEventListener('beforeunload', listener); attached = false; }
    },
    dispose() { if (attached) target.removeEventListener('beforeunload', listener); attached = false; },
    listener,
  };
  return guard;
}

export function bindGmiEditSessionStore(store, { unloadTarget = typeof window === 'undefined' ? null : window } = {}) {
  unsubscribeStore?.();
  if (surveyStore && surveyStore !== store) gmiEditSessions.clear();
  surveyStore = store;
  unloadGuard?.dispose();
  unloadGuard = unloadTarget ? createGmiEditUnloadGuard(unloadTarget, gmiEditSessions) : null;
  unsubscribeStore = store.subscribe((state, previous) => {
    if (state.layers !== previous.layers) gmiEditSessions.reconcile();
    // Re-read after reconcile: it can synchronously publish invalidation status.
    const live = store.getState();
    let inspection = live.ui.layerDataTable?.isOpen && live.ui.layerDataTable.layerId === live.objectTableInspection?.layerId ? live.objectTableInspection : null;
    // Proposed inspections belong to an exact immutable session snapshot, unlike Original selections.
    const basis = inspection?.editBasis;
    if (basis && live.gmiEditSelection?.host?.kind === 'inspection'
      && (live.gmiEditStatus[basis.layerId] !== previous.gmiEditStatus?.[basis.layerId] || live.objectTableInspection !== previous.objectTableInspection)
      && gmiEditSessions.resolve(gmiEditSessions.getHandle(basis.layerId)).session !== basis.session) inspection = null;
    const selection = reconcileGmiEditSelection(live.gmiEditSelection, {
      workspaceLayerId: live.gmiEditWorkspace?.layerId, layers: live.layers, statuses: live.gmiEditStatus || {},
      inspection,
    });
    if (selection !== live.gmiEditSelection) store.setState({ gmiEditSelection: selection }, false, 'gmiEdit/selectionReconcile');
  });
}

/**
 * Lifecycle check for store actions that drop layers. `null` when nothing is
 * pending, otherwise the blocking result returned to the caller.
 */
export function gmiEditRemovalBlock(layerIds, { discardGmiEdits = false } = {}) {
  if (discardGmiEdits) return null;
  const layers = gmiEditSessions.unsavedLayers(layerIds);
  return layers.length ? Object.freeze({ ok: false, code: 'gmi-edits-pending', layers }) : null;
}
