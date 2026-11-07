import { groupPhotoExportDiagnostics } from './export/photoExportDiagnostics.mjs';
import { photoExportReadiness } from './export/photoExportReadiness.mjs';
import { photoCompletionStatus, singularCopy } from './photoCompletion.mjs';

// Presentation and step state for the export wizard. Rules stay in readiness and names stay in the plan, so nothing here
// decides what blocks an export or composes a filename, and nothing here writes to the session.

// The label is left out on purpose: it cannot change readiness, so typing in the field must not recompute it. Without
// `now`, a capture time in the future would go unreported.
export const photoExportDeliveryReadiness = (photos, { profile, crs, context }, now = Date.now()) => photoExportReadiness(photos, { profile, crs, context, now });

const lines = (items) => Object.freeze(items.map(({ code, label, message }) => Object.freeze({ code, label, text: singularCopy(message) })));
const assetsBeingRead = (photos) => new Set(photos.filter((photo) => photo.spatial?.exifRead?.state === 'pending').map((photo) => photo.assetId)).size;

function excludedText({ placed, excluded }) {
  if (!placed) return 'Ingen bilder er plassert ennå. Bare plasserte bilder kan eksporteres.';
  return excluded ? singularCopy(`${excluded} plasseringer mangler posisjon og blir ikke med.`) : null;
}

// The first screen. `reading` comes first and looks at the whole layer: readiness only counts placed photos, whereas a
// plan goes stale when any member finishes. Until the read ends, readiness can report blockers that are not real, because
// a default direction waits for the read, so nothing it derives from those photos is passed on.
export function photoExportDeliveryModel({ photos, readiness }) {
  const reading = assetsBeingRead(photos);
  const shared = { excludedText: excludedText(readiness.counts) };
  if (reading) {
    return Object.freeze({ ...shared, state: 'reading', heading: 'Leser bildedata …', blockers: Object.freeze([]), checks: lines([]), notes: lines([]), completionPrimary: false,
      advance: Object.freeze({ enabled: false, label: 'Neste', reason: singularCopy(`${reading} bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.`) }) });
  }
  const { status: state, text: heading } = photoCompletionStatus(readiness);
  const blocked = state === 'blocked';
  // The label states what is given up, which only holds for a gap in capture time.
  const withoutTime = state === 'schema-gap' && readiness.levels.schema.gaps.some((gap) => gap.field === 'captureTime');
  return Object.freeze({ ...shared, state, heading, blockers: Object.freeze(groupPhotoExportDiagnostics(readiness.blocking)), checks: lines(readiness.recommendations), notes: lines(readiness.notes),
    completionPrimary: blocked,
    advance: Object.freeze({ enabled: !blocked, label: withoutTime ? 'Fortsett uten opptakstid' : 'Neste', reason: blocked ? 'Rett det som mangler for å gå videre.' : null }) });
}

const NO_PREVIEW = Object.freeze({ status: 'idle', plan: null, error: null });
const NO_DOWNLOAD = Object.freeze({ status: 'idle', error: null });
export const PHOTO_EXPORT_WIZARD_START = Object.freeze({ step: 'delivery', run: 0, preview: NO_PREVIEW, download: NO_DOWNLOAD });

// Async work starts in click handlers. A build starts with `run: state.run + 1`, a download with the current run, and the
// result reports back with that same run, so anything older is dropped. Whether a plan is live is deliberately not read
// here, which keeps the reducer pure: see photoExportPackageState.
export function photoExportWizardReducer(state, action) {
  const { preview, download } = state;
  const packaging = download.status === 'packaging', current = action.run === state.run;
  switch (action.type) {
    case 'build-start':
      return packaging || !(action.run > state.run) ? state : { step: 'package', run: action.run, preview: { ...NO_PREVIEW, status: 'building' }, download: NO_DOWNLOAD };
    case 'build-done':
      return current && preview.status === 'building' ? { ...state, preview: { ...NO_PREVIEW, status: 'ready', plan: action.plan } } : state;
    case 'build-failed':
      return current && preview.status === 'building' ? { ...state, preview: { ...NO_PREVIEW, status: 'failed', error: action.error } } : state;
    // Going back discards the plan. The next build gets a new timestamp and new Gemini UUIDs.
    case 'back':
      return packaging || state.step !== 'package' ? state : { ...PHOTO_EXPORT_WIZARD_START, run: state.run + 1 };
    case 'download-start':
      return current && !packaging && preview.status === 'ready' && !preview.plan.errors.length ? { ...state, download: { status: 'packaging', error: null } } : state;
    case 'download-done':
      return current && packaging ? { ...state, download: { status: 'done', error: null } } : state;
    case 'download-failed':
      return current && packaging ? { ...state, download: { status: 'failed', error: action.error } } : state;
    default:
      return state;
  }
}

// The second screen, derived in render so it cannot go out of date. A running ZIP finishes first and reports for itself.
// After that a stale plan outranks a failed or finished download, because neither `Prøv igjen` nor `Last ned på nytt`
// could succeed: the package refuses a plan that is no longer live.
export function photoExportPackageState({ preview, download }) {
  if (preview.status === 'idle') return null;
  if (preview.status === 'building') return 'building';
  if (preview.status === 'failed') return 'build-failed';
  if (preview.plan.errors.length) return 'plan-errors';
  if (download.status === 'packaging') return 'packaging';
  if (!preview.plan.isLive()) return 'stale';
  if (download.status === 'failed') return 'packaging-failed';
  return download.status === 'done' ? 'done' : 'ready';
}

// What the package holds. `counts.uniqueImages` is not used, because it includes photos that are left out. An original
// shared by several placements is one image and is counted once in `totalBytes`, which covers originals only.
export function photoExportPackageContents(plan) {
  const { attachments: images, features: placements, excluded, sharedAttachments } = plan.counts;
  const assets = new Map(plan.assets.map((asset) => [asset.assetId, asset]));
  return Object.freeze({ images, placements, excluded, sharedAttachments, totalBytes: plan.assets.reduce((total, asset) => total + (asset.file?.size || 0), 0),
    renamed: Object.freeze(plan.attachments.filter((item) => item.renamed).map((item) => Object.freeze({ assetId: item.assetId, from: assets.get(item.assetId).originalFilename, to: item.filename }))) });
}
