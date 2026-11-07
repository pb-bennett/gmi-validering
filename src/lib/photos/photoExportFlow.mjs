import { DEFAULT_PHOTO_FILTER } from './photoWorkspaceState.mjs';
import { photoWorkspaceView } from './photoWorkspaceView.mjs';

// One trip from Fullfør opplysninger to a tool and back, held by the page and never persisted. It keeps identities and
// view choices only. Accepted values, readiness and export plans are left out on purpose, so a return cannot show old
// data: the hub recalculates from canonical photos when it opens again.

const WORK = Object.freeze({
  'direction:missing': Object.freeze({ field: 'direction', countLabel: 'Standardretning', filterLabel: 'Standardretning' }),
  'direction:review': Object.freeze({ field: 'direction', countLabel: 'Kontroller retning', filterLabel: 'Retning til kontroll' }),
  'placement:missing': Object.freeze({ field: 'position', countLabel: 'Mangler plassering', filterLabel: 'Uplassert' }),
});
const workOf = ({ task, scope }) => WORK[`${task}:${scope}`];

export const photoExportFlowIsLive = (flow, layers) => layers.some((layer) => layer.id === flow.layerId);

// The work list is fixed on entry. A flag filter would drop an occurrence the moment it gets a staged value, taking it
// off the map and out of Forrige, and it cannot express accepted values under review or a narrowed selection.
const workFilter = (work, ids) => Object.freeze({ ...DEFAULT_PHOTO_FILTER, work: Object.freeze({ ids: new Set(ids), label: work.filterLabel }) });
export const photoExportFlowFilter = (flow) => workFilter(workOf(flow), flow.workIds);

// `route: 'edit'` needs something to work on and returns null without it. The list follows the workspace sort.
export function createPhotoExportFlow({ layerId, task, route = 'edit', scope = 'missing', workIds = [], focusId = null, photos = [], workspace, selections = {} }) {
  const work = workOf({ task, scope });
  if (!layerId || !work) return null;
  const ordered = route === 'edit' ? photoWorkspaceView(photos, { ...workspace, filter: workFilter(work, workIds) }).rows.map((photo) => photo.id) : [];
  if (route === 'edit' && !ordered.length) return null;
  return Object.freeze({ origin: 'complete', layerId, task, route, scope, workIds: Object.freeze(ordered),
    focusId: ordered.includes(focusId) ? focusId : ordered[0] ?? null,
    restore: Object.freeze({ filter: workspace.filter, activePhotoId: workspace.activePhotoId, selections }) });
}

// Reads effective photos, so a value counts as handled once staged. Canonical data cannot change under an open Edit
// session, so `outstanding + staged` is what is still missing after a Discard, and `outstanding` what is left after a Save.
// Neste moves to what still needs work; Forrige walks the whole list, so a staged value can be looked at again.
export function photoExportFlowProgress(flow, photos, activePhotoId) {
  const { countLabel, field } = workOf(flow);
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const work = flow.workIds.map((id) => byId.get(id)).filter(Boolean);
  const handled = (photo) => Boolean(photo.staged?.[field]);
  const index = work.findIndex((photo) => photo.id === activePhotoId);
  const after = [...work.slice(index + 1), ...work.slice(0, index + 1)];
  return { countLabel, task: flow.task, total: work.length, position: index + 1, staged: work.filter(handled).length, outstanding: work.filter((photo) => !handled(photo)).length,
    nextId: after.find((photo) => !handled(photo) && photo.id !== activePhotoId)?.id ?? null,
    previousId: (index < 0 ? work.at(-1) : work[index - 1])?.id ?? null };
}
