import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { completionLayer, completionView, jpeg, sharedOriginalLayer } from './helpers/photoCompletionFixtures.mjs';
import { createPhotoEditState, effectivePhoto, photoEditChanges, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { createPhotoExportFlow, photoExportFlowFilter, photoExportFlowIsLive, photoExportFlowProgress } from '../src/lib/photos/photoExportFlow.mjs';
import { canReviewOnMap, canSetOnMap, scopedRows } from '../src/lib/photos/photoCompletion.mjs';
import { DEFAULT_PHOTO_FILTER, emptyPhotoWorkspace, photoFilterIsDefault, photoWorkspaceReducer } from '../src/lib/photos/photoWorkspaceState.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';

const at = (longitude) => ({ crs: 'EPSG:4326', longitude, latitude: 59 });
const workspaceOf = (layerId, photoIds, activePhotoId = photoIds[0]) => ({ ...emptyPhotoWorkspace, layerId, photoIds, activePhotoId });
const FILES = ['a.jpg', 'b.jpg', 'c.jpg'];
const GML = FILES.map((name) => ({ name, direction: '0' }));

// Staged exactly as the page stages: through the real reducer, seen through effectivePhoto.
function editing(session, layerId) {
  const ticket = session.beginPhotoEdits(layerId);
  let state = createPhotoEditState(ticket);
  return { ticket, stage: (photoId, field, value) => { state = photoEditReducer(state, { type: 'stage', photoId, field, value }); },
    undo: () => { state = photoEditReducer(state, { type: 'undo' }); }, changes: () => photoEditChanges(state),
    effective: () => session.getLayerPhotos(layerId).map((photo) => effectivePhoto(photo, state)) };
}
function directionFlow(session, layerId, ids, options = {}) {
  return createPhotoExportFlow({ layerId, task: 'direction', workIds: ids, photos: session.getLayerPhotos(layerId), workspace: workspaceOf(layerId, ids), ...options });
}

test('a flow keeps identities and view choices, and no values, readiness or plan that could go stale', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids, { selections: { direction: [ids[1]] } });
  assert.deepEqual(Object.keys(flow).sort(), ['focusId', 'layerId', 'origin', 'restore', 'route', 'scope', 'task', 'workIds']);
  assert.deepEqual(Object.keys(flow.restore).sort(), ['activePhotoId', 'filter', 'selections']);
  assert.equal(flow.origin, 'complete');
  assert.equal(flow.layerId, layerId);
  assert(Object.isFrozen(flow) && Object.isFrozen(flow.workIds) && Object.isFrozen(flow.restore));
  assert.doesNotMatch(JSON.stringify(flow), /degrees|position|readiness|captureTime/);
});

test('the source keeps the flow transient and away from export code', async () => {
  const source = await readFile(new URL('../src/lib/photos/photoExportFlow.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /^import .*export\/photoExport/m, 'it reads no readiness and no plan');
  assert.doesNotMatch(source, /applyPhotoEdits|adoptSourceEvidence|fillMissingPhotoValues|setCaptureMetadata/, 'it writes nothing');
  const page = await readFile(new URL('../src/app/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /includeZero/, 'the handoff adds no route to the GML 0° action');
});

test('the work list follows the workspace sort, and focus falls back to its first occurrence', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const descending = directionFlow(session, layerId, ids, { workspace: { ...workspaceOf(layerId, ids), sort: 'filename-desc' } });
  assert.deepEqual(descending.workIds, [...ids].reverse());
  assert.equal(descending.focusId, ids[2]);
  assert.equal(directionFlow(session, layerId, ids, { focusId: ids[1] }).focusId, ids[1]);
  assert.equal(directionFlow(session, layerId, ids.slice(0, 2), { focusId: ids[2] }).focusId, ids[0], 'a focus outside the list is ignored');
});

test('nothing to work on, or an unknown task, gives no flow; the positioning route needs no work list', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  assert.equal(directionFlow(session, layerId, []), null);
  assert.equal(directionFlow(session, layerId, ['removed']), null);
  assert.equal(directionFlow(session, layerId, ids, { task: 'captureTime' }), null, 'only tasks with a map route');
  assert.equal(directionFlow(session, layerId, ids, { task: 'placement', scope: 'review' }), null);
  assert.equal(directionFlow(session, null, ids), null);
  const flow = createPhotoExportFlow({ layerId, task: 'placement', route: 'positioning', workspace: workspaceOf(layerId, ids) });
  assert.deepEqual([flow.route, flow.workIds.length, flow.focusId], ['positioning', 0, null]);
});

test('the work filter holds the list while values are staged, and a plain flag would not', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids.slice(0, 2));
  let workspace = photoWorkspaceReducer(workspaceOf(layerId, ids), { type: 'filter', filter: photoExportFlowFilter(flow) });
  const edit = editing(session, layerId);
  edit.stage(ids[0], 'direction', 90);
  const changedIds = new Set([ids[0]]);
  const view = photoWorkspaceView(edit.effective(), workspace, { changedIds });
  assert.deepEqual(view.rows.map((photo) => photo.id), ids.slice(0, 2), 'a staged occurrence stays on the list and the map');
  assert.deepEqual(view.summary, ['Mangler retning']);
  assert.equal(view.filterActive, true);
  const flag = photoWorkspaceView(edit.effective(), { ...workspace, filter: { ...DEFAULT_PHOTO_FILTER, missingDirection: true } }, { changedIds });
  assert.equal(flag.rows.some((photo) => photo.id === ids[0]), false, 'why the flag was not enough');

  workspace = photoWorkspaceReducer(workspace, { type: 'filter', filter: { placement: 'placed' } });
  assert.equal(workspace.filter.work.ids.size, 2, 'other filters narrow it further');
  workspace = photoWorkspaceReducer(workspace, { type: 'filter', filter: { work: null } });
  assert.equal(Object.hasOwn(workspace.filter, 'work'), false);
});

test('restoring brings back the earlier filter exactly, and the work list never outlives the flow', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  let workspace = photoWorkspaceReducer(workspaceOf(layerId, ids, ids[2]), { type: 'filter', filter: { missingCaptureTime: true, repeated: true } });
  const flow = directionFlow(session, layerId, ids, { workspace });
  assert.equal(flow.restore.activePhotoId, ids[2]);
  workspace = photoWorkspaceReducer(workspace, { type: 'filter', filter: photoExportFlowFilter(flow) });
  assert.equal(workspace.filter.missingCaptureTime, false, 'the flow shows its own list only');
  workspace = photoWorkspaceReducer(workspace, { type: 'filter', filter: { ...flow.restore.filter, work: null } });
  assert.deepEqual(workspace.filter, flow.restore.filter);

  const started = photoWorkspaceReducer(workspaceOf(layerId, ids), { type: 'filter', filter: photoExportFlowFilter(flow) });
  assert.equal(photoFilterIsDefault(started.filter), false);
  const reset = photoWorkspaceReducer(started, { type: 'reset-view' });
  assert.equal(photoFilterIsDefault(reset.filter), true);
  assert.equal(photoWorkspaceReducer(started, { type: 'mode', mode: 'browse' }).filter.work.ids.size, 3, 'a mode change alone does not end it');
});

test('counts keep staged values apart from saved ones and follow undo', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids);
  const edit = editing(session, layerId);
  const progress = (active = ids[0]) => photoExportFlowProgress(flow, edit.effective(), active);
  assert.deepEqual([progress().countLabel, progress().outstanding, progress().staged, progress().total], ['Mangler retning', 3, 0, 3]);
  edit.stage(ids[0], 'direction', 90);
  assert.deepEqual([progress().outstanding, progress().staged], [2, 1]);
  edit.stage(ids[1], 'position', at(10.5));
  assert.deepEqual([progress().outstanding, progress().staged], [2, 1], 'moving a photo sets no direction');
  edit.undo(); edit.undo();
  assert.deepEqual([progress().outstanding, progress().staged], [3, 0]);
});

test('Neste goes to what is left and Forrige walks everything, and neither writes', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids);
  const edit = editing(session, layerId);
  const before = session.getLayerPhotos(layerId);
  const progress = (active) => photoExportFlowProgress(flow, edit.effective(), active);
  assert.deepEqual([progress(ids[0]).position, progress(ids[0]).nextId, progress(ids[0]).previousId], [1, ids[1], null]);
  edit.stage(ids[1], 'direction', 90);
  assert.equal(progress(ids[0]).nextId, ids[2], 'a staged occurrence is skipped by Neste');
  assert.equal(progress(ids[2]).previousId, ids[1], 'and can still be looked at again');
  assert.equal(progress(ids[2]).nextId, ids[0], 'Neste wraps round to what was missed');
  edit.stage(ids[0], 'direction', 91);
  edit.stage(ids[2], 'direction', 92);
  assert.equal(progress(ids[2]).nextId, null, 'nothing left');
  assert.equal(progress(ids[2]).outstanding, 0);
  assert.deepEqual(session.getLayerPhotos(layerId), before, 'navigation and staging leave canonical photos alone');
  assert.equal(edit.changes().length, 3, 'and the values are still staged');
  const outside = progress('other');
  assert.deepEqual([outside.position, outside.previousId], [0, ids[2]], 'an occurrence picked on the map is not part of the count');
});

test('Save: the bar count is what readiness reports. Discard: readiness reports what it did before', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids);
  const original = completionView(session, layerId);
  assert.equal(original.readiness.blocking.length, 3);

  const discarded = editing(session, layerId);
  discarded.stage(ids[0], 'direction', 90);
  assert.equal(completionView(session, layerId).readiness.blocking.length, 3, 'staged values are not accepted');
  session.endPhotoEdits(discarded.ticket);
  assert.deepEqual(completionView(session, layerId).readiness.blocking, original.readiness.blocking);
  assert.equal(session.getLayerPhotos(layerId)[0].direction.current, null);

  const saved = editing(session, layerId);
  saved.stage(ids[0], 'direction', 90);
  saved.stage(ids[1], 'direction', 180);
  const { outstanding, staged } = photoExportFlowProgress(flow, saved.effective(), ids[0]);
  assert.deepEqual([outstanding, staged], [1, 2]);
  assert.equal(session.applyPhotoEdits(saved.ticket, saved.changes()).ok, true);
  const after = completionView(session, layerId);
  assert.equal(after.readiness.blocking.length, outstanding);
  assert.equal(after.model.tasks.find((task) => task.key === 'direction').outstanding, outstanding);
});

test('placement: a placed occurrence leaves Plassering and joins the delivery tasks', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)), { place: false });
  assert.deepEqual(completionView(session, layerId).model.placement.rows.map((row) => row.photoId), ids);
  const flow = createPhotoExportFlow({ layerId, task: 'placement', workIds: ids, photos: session.getLayerPhotos(layerId), workspace: workspaceOf(layerId, ids) });
  assert.equal(photoExportFlowFilter(flow).work.label, 'Uplassert');
  const edit = editing(session, layerId);
  edit.stage(ids[0], 'position', at(10.1));
  edit.stage(ids[1], 'direction', 45);
  const progress = photoExportFlowProgress(flow, edit.effective(), ids[0]);
  assert.deepEqual([progress.countLabel, progress.outstanding, progress.staged], ['Mangler plassering', 2, 1], 'a direction places nothing');
  assert.equal(session.applyPhotoEdits(edit.ticket, edit.changes().filter((change) => change.photoId === ids[0])).ok, true);
  const { model } = completionView(session, layerId);
  assert.equal(model.tasks.find((task) => task.key === 'placement').outstanding, 2);
  assert.equal(model.tasks.find((task) => task.key === 'direction').outstanding, 1, 'it now needs a direction of its own');
});

test('accepted GML 0° can be reviewed and corrected; other accepted directions are not called questionable', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)), { gml: GML });
  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'gml', ids.slice(0, 2), { includeZero: true }).ok, true);
  const rows = () => completionView(session, layerId).model.direction.rows;
  assert.deepEqual(rows().filter(canReviewOnMap).map((row) => row.photoId), ids.slice(0, 2));
  assert.deepEqual(rows().filter(canSetOnMap).map((row) => row.photoId), [ids[2]], 'accepted rows are not "missing"');

  const flow = directionFlow(session, layerId, ids.slice(0, 2), { scope: 'review' });
  assert.equal(photoExportFlowProgress(flow, session.getLayerPhotos(layerId), ids[0]).countLabel, 'Kontroller retning');
  const edit = editing(session, layerId);
  edit.stage(ids[0], 'direction', 135);
  assert.deepEqual([photoExportFlowProgress(flow, edit.effective(), ids[0]).outstanding, photoExportFlowProgress(flow, edit.effective(), ids[0]).staged], [1, 1]);
  assert.equal(session.getLayerPhotos(layerId)[0].direction.current.degrees, 0, 'the accepted value stands until saved');
  assert.equal(rows().filter(canReviewOnMap).length, 2);
  assert.equal(session.applyPhotoEdits(edit.ticket, edit.changes()).ok, true);
  const corrected = session.getLayerPhotos(layerId)[0].direction.current;
  assert.deepEqual([corrected.degrees, corrected.basis.kind], [135, 'manual']);
  assert.deepEqual(rows().filter(canReviewOnMap).map((row) => row.photoId), [ids[1]]);

  const manualNorth = editing(session, layerId);
  manualNorth.stage(ids[2], 'direction', 0);
  assert.equal(session.applyPhotoEdits(manualNorth.ticket, manualNorth.changes()).ok, true);
  assert.equal(rows().find((row) => row.photoId === ids[2]).state, 'accepted');
  assert.equal(canReviewOnMap(rows().find((row) => row.photoId === ids[2])), false, 'a person chose this 0°');
});

test('an EXIF 0° from true north is ordinary evidence and is not put up for review', async () => {
  const { session, layerId, ids } = await completionLayer([jpeg('nord.jpg', { direction: 0, directionRef: 'T' })]);
  assert.equal(session.adoptSourceEvidence(layerId, 'direction', 'exif', ids).ok, true);
  assert.equal(completionView(session, layerId).model.direction.rows.some(canReviewOnMap), false);
});

test('a selection narrows the map list and never widens it, as for every other action in the hub', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const { rows } = completionView(session, layerId).model.direction;
  assert.deepEqual(scopedRows(rows, [], canSetOnMap).map((row) => row.photoId), ids);
  assert.deepEqual(scopedRows(rows, [ids[1]], canSetOnMap).map((row) => row.photoId), [ids[1]]);
  assert.deepEqual(scopedRows(rows, ['used-and-gone'], canSetOnMap), [], 'a used selection stays narrow');
});

test('repeated photographs: each occurrence is its own work item', async () => {
  const { session, layerId, ids } = await sharedOriginalLayer(jpeg('delt.jpg'));
  const flow = directionFlow(session, layerId, ids);
  assert.equal(flow.workIds.length, 2);
  const edit = editing(session, layerId);
  edit.stage(ids[0], 'direction', 45);
  assert.deepEqual([photoExportFlowProgress(flow, edit.effective(), ids[0]).outstanding, photoExportFlowProgress(flow, edit.effective(), ids[0]).nextId], [1, ids[1]]);
  assert.equal(session.applyPhotoEdits(edit.ticket, edit.changes()).ok, true);
  const [first, second] = session.getLayerPhotos(layerId);
  assert.deepEqual([first.direction.current?.degrees, second.direction.current], [45, null], 'the other placement is untouched');
  assert.equal(completionView(session, layerId).model.tasks.find((task) => task.key === 'direction').outstanding, 1);
});

test('a removed occurrence drops out of the work list, and a removed layer ends the flow', async () => {
  const { session, layerId, ids } = await completionLayer(FILES.map((name) => jpeg(name)));
  const flow = directionFlow(session, layerId, ids);
  assert.equal(photoExportFlowIsLive(flow, session.getSnapshot().photoLayers), true);
  session.removeLayerPhotos(layerId, [ids[1]], { confirmed: true });
  const progress = photoExportFlowProgress(flow, session.getLayerPhotos(layerId), ids[0]);
  assert.deepEqual([progress.total, progress.nextId], [2, ids[2]]);
  session.clear();
  assert.equal(photoExportFlowIsLive(flow, session.getSnapshot().photoLayers), false);
});
