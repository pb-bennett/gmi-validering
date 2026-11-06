import { fullCaptureTime } from './exportContract.mjs';
import { photoExportDiagnosticLabel } from './photoExportDiagnostics.mjs';
import { PHOTO_EXPORT_IMPORT_EVIDENCE, PHOTO_EXPORT_REQUIREMENTS, PHOTO_EXPORT_SCHEMA_REQUIREMENTS, evaluatePhotoExportRules, isValidExportDirection } from './photoExportRules.mjs';
import { evidenceEligibility, evidenceValuesConflict } from '../photoEvidenceAdoption.mjs';

// Synchronous and read-only over canonical state, so it is safe to recompute on every render. It reads no bytes,
// hashes nothing, issues no identifiers, starts no work and takes the time from `now`. Accepted values decide
// everything here: source evidence only describes what could be accepted next.

// Generation is confirmed by the plan for these; readiness cannot know them without reading files.
export const PHOTO_EXPORT_PENDING_CHECKS = Object.freeze(['original-files', 'attachment-names', 'projection']);

const SOURCE_KINDS = Object.freeze(['exif', 'gml']);
const readingExif = (photo) => photo.spatial?.exifRead?.state === 'pending';
const sourceValue = ({ id, kind, tag, sourceFilename, value, raw }) => ({ id, kind, tag: tag ?? null, sourceFilename: sourceFilename ?? null, value: value ?? null, raw });
const tally = (items, states) => Object.fromEntries(states.map((state) => [state, items.filter((item) => item.state === state).length]));

// One state from planning §6, with the values and available sources an interface needs to act on it.
// `blocking` follows the requirement; a recommended time is never blocking, whatever its state.
export function classifyCaptureTime(photo, requirement = 'recommended') {
  const accepted = photo.captureMetadata?.captureTime || null;
  const evidence = (photo.metadataEvidence || []).filter((item) => item.field === 'captureTime');
  const usable = evidence.filter((item) => item.value);
  const result = (state, details = {}) => ({ state, requirement, blocking: requirement === 'required' && state !== 'accepted', accepted,
    evidence: evidence.map(sourceValue), adoptableKinds: [], sourcesAgree: false, sourcePending: readingExif(photo), replacesAccepted: false, ...details });
  if (fullCaptureTime(accepted)) return result('accepted');
  if (accepted) return result('partial', { replacesAccepted: true });
  if (evidenceValuesConflict(usable, 'captureTime')) return result('conflict');
  const adoptableKinds = SOURCE_KINDS.filter((kind) => evidenceEligibility(photo, 'captureTime', kind).status === 'eligible');
  if (adoptableKinds.length) return result('adoptable', { adoptableKinds, sourcesAgree: new Set(usable.map((item) => item.kind)).size > 1 });
  if (readingExif(photo)) return result('pending');
  if (usable.length) return result('partial');
  return result(evidence.length ? 'unusable' : 'none');
}
const CAPTURE_STATES = Object.freeze(['accepted', 'adoptable', 'conflict', 'partial', 'unusable', 'pending', 'none']);

// Direction is owned by the occurrence. GML 0° is reported apart and never counts as a known direction.
function classifyDirection(photo) {
  const accepted = photo.direction?.current || null;
  if (accepted) return { state: isValidExportDirection(accepted) ? 'accepted' : 'invalid', accepted, adoptableKinds: [], sourcePending: readingExif(photo) };
  const results = SOURCE_KINDS.map((kind) => [kind, evidenceEligibility(photo, 'direction', kind).status]);
  const has = (status) => results.some(([, item]) => item === status);
  const adoptableKinds = results.filter(([, status]) => status === 'eligible').map(([kind]) => kind);
  const zeroNeedsReview = has('zeroNeedsReview');
  const state = has('conflicting') ? 'conflict' : adoptableKinds.length ? 'adoptable' : zeroNeedsReview ? 'zero-review'
    : readingExif(photo) ? 'pending' : has('unsupportedReference') ? 'unsupported' : has('unusable') ? 'unusable' : 'none';
  return { state, accepted, adoptableKinds, zeroNeedsReview, sourcePending: readingExif(photo) };
}
const DIRECTION_STATES = Object.freeze(['accepted', 'adoptable', 'conflict', 'zero-review', 'unsupported', 'unusable', 'invalid', 'pending', 'none']);

// Edit mode hands out effective photos. Staged positions and directions are not accepted data.
const canonicalPhoto = (photo) => photo.saved
  ? { ...photo, spatial: { ...photo.spatial, current: photo.saved.current }, direction: { current: photo.saved.direction } } : photo;

const uniqueAssets = (photos) => [...new Map(photos.map((photo) => [photo.assetId, photo])).values()];

// Equal values are not evidence of bulk fill: only values recorded as bulk count, and only when actually repeated.
function repeatedBulkValues(items, basisOf, valueOf) {
  const groups = Map.groupBy(items.filter((item) => { const basis = basisOf(item); return basis?.kind === 'manual' && basis.mode === 'bulk'; }), valueOf);
  return [...groups].filter(([, group]) => group.length > 1).map(([value, group]) => ({ value, count: group.length }));
}

// Wall clocks are compared without the host timezone. An unknown offset could be as far ahead as UTC+14,
// so only a time in the future everywhere counts as after `now`: a photo taken a moment ago never does.
const LATEST_OFFSET_MS = 14 * 3600000;
function earliestInstant(value) {
  const [, year, month, day, hour = 0, minute = 0, second = 0] = value.iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const clock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!value.offset) return clock - LATEST_OFFSET_MS;
  if (value.offset === 'Z') return clock;
  const sign = value.offset.startsWith('-') ? -1 : 1;
  return clock - sign * (Number(value.offset.slice(1, 3)) * 3600000 + Number(value.offset.slice(4)) * 60000);
}
const implausibleCaptureTime = (value, nowMs) => Number(value.iso.slice(0, 4)) < 2000 || earliestInstant(value) > nowMs;

function recommendationsFor({ profile, placed, assets, nowMs }) {
  const recommendations = [];
  const add = (code, count, message, details = {}) => { if (count) recommendations.push({ code, label: photoExportDiagnosticLabel(code), count, message, ...details }); };
  const timeOf = (photo) => photo.captureMetadata?.captureTime || null;

  if (profile === 'gemini-legacy2019') {
    const utc = assets.filter((photo) => fullCaptureTime(timeOf(photo)) && /^(?:Z|[+-]00:00)$/.test(timeOf(photo).value.offset ?? ''));
    add('capture-time-utc', utc.length, `${utc.length} bilder har tid i UTC. Gemini VA får klokkeslettet uten tidssone, altså UTC og ikke lokal tid.`, { assetIds: utc.map((photo) => photo.assetId) });
  }
  const implausible = assets.filter((photo) => timeOf(photo) && implausibleCaptureTime(timeOf(photo).value, nowMs));
  add('capture-time-implausible', implausible.length, `${implausible.length} bilder har en usannsynlig dato.`, { assetIds: implausible.map((photo) => photo.assetId) });
  const bulkTimes = repeatedBulkValues(assets, (photo) => timeOf(photo)?.provenance, (photo) => timeOf(photo).value.iso);
  const bulkTimeCount = bulkTimes.reduce((total, group) => total + group.count, 0);
  add('capture-time-bulk', bulkTimeCount, `${bulkTimeCount} bilder har samme manuelt angitte tid.`, { groups: bulkTimes });

  const zero = placed.filter((photo) => photo.direction?.current?.degrees === 0);
  if (placed.length >= 5 && zero.length * 2 >= placed.length) add('direction-all-zero', zero.length, `${zero.length} bilder peker nøyaktig mot nord. Kontroller at dette stemmer.`, { occurrenceIds: zero.map((photo) => photo.id) });
  const bulkDirections = repeatedBulkValues(placed, (photo) => photo.direction?.current?.basis, (photo) => photo.direction.current.degrees);
  const bulkDirectionCount = bulkDirections.reduce((total, group) => total + group.count, 0);
  add('direction-bulk', bulkDirectionCount, `${bulkDirectionCount} plasseringer har samme manuelt angitte retning.`, { groups: bulkDirections });

  const pending = assets.filter(readingExif);
  add('evidence-pending', pending.length, `Leser fortsatt bildedata for ${pending.length} bilder.`, { assetIds: pending.map((photo) => photo.assetId) });
  return recommendations;
}

function notesFor({ profile, requirement, placed, assets, captureItems }) {
  const notes = [];
  const add = (code, count, message) => { if (count) notes.push({ code, label: photoExportDiagnosticLabel(code), count, message }); };
  const gemini = profile === 'gemini-legacy2019';

  const adoptable = captureItems.filter((item) => item.state === 'adoptable');
  const source = adoptable.every((item) => item.adoptableKinds.includes('exif')) ? 'EXIF' : adoptable.every((item) => item.adoptableKinds.includes('gml')) ? 'GML' : 'kildene';
  add('capture-time-in-source', adoptable.length, `${adoptable.length} bilder mangler opptakstid, men tiden finnes i ${source}.`);

  if (gemini) {
    add('compatibility-z', placed.length, `${placed.length} punkter får Z=0 som plassholder, ikke målt høyde.`);
    const offsets = assets.filter((photo) => fullCaptureTime(photo.captureMetadata?.captureTime) && photo.captureMetadata.captureTime.value.offset);
    add('compatibility-time', offsets.length, `Tidssone fjernes fra ${offsets.length} bilder. Klokkeslettet endres ikke.`);
  }
  const photographers = requirement?.photographer === 'omitted' ? assets.filter((photo) => photo.captureMetadata?.photographer).length : 0;
  add('photographer-omitted', photographers, `${photographers} godtatte fotografverdier er ikke med i denne leveransen.`);
  const shared = [...Map.groupBy(placed, (photo) => photo.assetId).values()].filter((group) => group.length > 1).length;
  add('shared-attachments', shared, `${shared} originalbilder deles av flere plasseringer.`);
  const linked = assets.filter((photo) => photo.repeatGroup?.referringObjectCount > 0).length;
  add('associations-omitted', linked, `${linked} bilder har objektkoblinger som blir i appen, men ikke er med i leveransen.`);
  return notes;
}

export function photoExportReadiness(photos, { profile, crs, context, now } = {}) {
  const canonical = photos.map(canonicalPhoto);
  const requirement = PHOTO_EXPORT_REQUIREMENTS[profile] || null;
  const schema = PHOTO_EXPORT_SCHEMA_REQUIREMENTS[profile] || null;
  const evidence = PHOTO_EXPORT_IMPORT_EVIDENCE[profile] || null;
  const placed = canonical.filter((photo) => photo.spatial.current);
  const unplaced = canonical.filter((photo) => !photo.spatial.current);
  const assets = uniqueAssets(placed);

  const rules = evaluatePhotoExportRules({ profile, crs, context,
    assets: uniqueAssets(canonical).map((photo) => ({ assetId: photo.assetId, originalFilename: photo.originalFilename, metadata: photo.captureMetadata })),
    occurrences: canonical.map((photo) => ({ occurrenceId: photo.id, assetId: photo.assetId, current: photo.spatial.current, direction: photo.direction?.current || null })) });
  const blocking = rules.errors.map((item) => ({ ...item, label: photoExportDiagnosticLabel(item.code) }));

  const captureItems = assets.map((photo) => ({ assetId: photo.assetId, photoId: photo.id, ...classifyCaptureTime(photo, requirement?.captureTime) }));
  const directionItems = placed.map((photo) => ({ occurrenceId: photo.id, assetId: photo.assetId, ...classifyDirection(photo) }));

  const withoutFullTime = assets.filter((photo) => !fullCaptureTime(photo.captureMetadata?.captureTime));
  const insufficientPrecision = withoutFullTime.filter((photo) => photo.captureMetadata?.captureTime).length;
  const withoutDirection = placed.filter((photo) => !isValidExportDirection(photo.direction?.current)).length;
  const contextGaps = blocking.filter((item) => item.code === 'invalid-context').map((item) => item.field);

  const gaps = [];
  if (schema?.captureTime && withoutFullTime.length) gaps.push({ field: 'captureTime', count: withoutFullTime.length, missing: withoutFullTime.length - insufficientPrecision, insufficientPrecision });
  if (schema?.direction && withoutDirection) gaps.push({ field: 'direction', count: withoutDirection });
  if (schema?.context && contextGaps.length) gaps.push({ field: 'context', count: contextGaps.length });
  const assessed = Boolean(schema && placed.length);

  const deviations = [];
  if (evidence?.missingCaptureTime && withoutFullTime.length) deviations.push({ field: 'captureTime', state: evidence.missingCaptureTime, count: withoutFullTime.length, referenceOnly: evidence.referenceOnly.includes('missingCaptureTime') });
  if (evidence?.missingDirection && withoutDirection) deviations.push({ field: 'direction', state: evidence.missingDirection, count: withoutDirection, referenceOnly: evidence.referenceOnly.includes('missingDirection') });

  const nowMs = now === undefined || now === null ? Number.NaN : new Date(now).getTime();
  const recommendations = recommendationsFor({ profile, placed, assets, nowMs });
  const blockedAssets = new Set(blocking.map((item) => item.assetId).filter(Boolean));
  const blockedOccurrences = new Set(blocking.map((item) => item.occurrenceId).filter(Boolean));
  const allBlocked = blocking.some((item) => !item.assetId && !item.occurrenceId);
  const schemaMet = assessed && !gaps.length;

  return {
    status: blocking.length ? 'blocked' : !schemaMet ? 'schema-gap' : recommendations.length ? 'recommendations' : 'ready',
    levels: {
      generation: blocking.length ? 'blocked' : 'possible',
      pendingChecks: PHOTO_EXPORT_PENDING_CHECKS,
      // Derived from the rule table. No XSD validator runs here, so this is never a validation result.
      schema: { name: schema?.schema ?? null, method: 'rules', assessed, met: schemaMet, gaps },
      importEvidence: { profile: evidence?.profile ?? 'none', deviations, recorded: evidence },
    },
    counts: { total: canonical.length, placed: placed.length, excluded: unplaced.length, assets: assets.length,
      readyOccurrences: allBlocked ? 0 : placed.filter((photo) => !blockedOccurrences.has(photo.id) && !blockedAssets.has(photo.assetId)).length },
    blocking,
    recommendations,
    excluded: unplaced.map((photo) => ({ occurrenceId: photo.id, assetId: photo.assetId, reason: 'unplaced' })),
    notes: notesFor({ profile, requirement, placed, assets, captureItems }),
    tasks: {
      captureTime: { requirement: requirement?.captureTime ?? null, schemaRequired: Boolean(schema?.captureTime), counts: tally(captureItems, CAPTURE_STATES), items: captureItems },
      direction: { requirement: requirement?.direction ?? null, schemaRequired: Boolean(schema?.direction), counts: tally(directionItems, DIRECTION_STATES), items: directionItems },
      photographer: { requirement: requirement?.photographer ?? null, accepted: assets.filter((photo) => photo.captureMetadata?.photographer).length,
        adoptable: assets.filter((photo) => evidenceEligibility(photo, 'photographer', 'exif').status === 'eligible').length },
      placement: { unplaced: unplaced.length, occurrenceIds: unplaced.map((photo) => photo.id) },
      context: { required: Boolean(requirement?.context), missingFields: contextGaps },
    },
  };
}
