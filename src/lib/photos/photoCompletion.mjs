import { PHOTO_EXPORT_PROFILE_METADATA } from './export/photoExportRules.mjs';
import { photoDirectionLabel } from './photoDirection.mjs';
import { evidenceEligibility } from './photoEvidenceAdoption.mjs';
import { formatPhotoCaptureTime, photoDirectionEvidenceText, photoDirectionSourceLabel, photoMetadataSourceLabel, photoSourceLabel } from './photoPresentation.mjs';

// Presentation over photoExportReadiness. States come from readiness and every write goes through the session,
// so nothing here decides what blocks an export or what counts as accepted.

export const PHOTO_COMPLETION_TARGETS = Object.freeze([
  ['gemini-legacy2019', 'Gemini VA'], ['legacy2019', 'Skråfoto 2019 (standard)'], ['asbuilt52', 'Norsk Vann AsBuilt 5.2'],
].map(([value, label]) => Object.freeze({ value, label, tier: PHOTO_EXPORT_PROFILE_METADATA[value].tier })));

const REQUIREMENT_LABELS = Object.freeze({ required: 'Påkrevd', recommended: 'Anbefalt', optional: 'Valgfritt', omitted: 'Tas ikke med i denne leveransen' });

const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;
export const photoCount = (count) => counted(count, 'bilde', 'bilder');
export const placementCount = (count) => counted(count, 'plassering', 'plasseringer');
export const selectedPhotoCount = (count) => counted(count, 'valgt bilde', 'valgte bilder');
export const selectedPlacementCount = (count) => counted(count, 'valgt plassering', 'valgte plasseringer');
// Readiness copy is written for many. A lookbehind is not needed: "11 bilder" has no word boundary before its last 1.
export const singularCopy = (text) => text.replace(/\b1 bilder\b/g, '1 bilde').replace(/\b1 plasseringer\b/g, '1 plassering');

const line = (key, text) => Object.freeze({ key, text });
const sourceName = ({ kind, sourceFilename }) => `${photoSourceLabel(kind)}${sourceFilename ? ` · ${sourceFilename}` : ''}`;
const rawText = (raw) => typeof raw === 'string' ? raw : JSON.stringify(raw);
const timeText = (value) => { const format = formatPhotoCaptureTime(value); return format ? [format.text, ...format.notes].join(' · ') : value?.iso ?? ''; };

function photoRow(photo) {
  const { occurrenceCount = 1, occurrenceIndex = 1 } = photo.repeatGroup || {};
  return { filename: photo.originalFilename, thumbnailUrl: photo.preview?.state === 'ready' ? photo.preview.thumbnailUrl : null,
    occurrence: occurrenceCount > 1 ? `Plassering ${occurrenceIndex} av ${occurrenceCount}` : null };
}

// Selection is for rows a bulk action can write. Accepted values and rows still waiting for EXIF are left out.
const selectable = (row) => !row.accepted && row.state !== 'pending' && !row.sourcePending;

function captureNote(item) {
  if (item.state === 'adoptable' && item.sourcePending) return 'Leser bildedata … Kan brukes når lesingen er ferdig.';
  if (item.state === 'adoptable' && item.sourcesAgree) return `${[...new Set(item.evidence.filter((source) => source.value).map((source) => photoSourceLabel(source.kind)))].join(' og ')} stemmer overens`;
  if (item.state === 'partial') return item.replacesAccepted ? 'Har tid uten sekunder · Erstatter godtatt verdi' : 'Har tid uten sekunder';
  if (item.state === 'pending') return 'Leser bildedata …';
  if (item.state === 'none') return 'Ingen kildeverdi';
  return null;
}

function captureRow(item, photo) {
  const row = { ...item, ...photoRow(photo), key: item.assetId, sources: item.evidence.map((source) => line(source.id,
    `${sourceName(source)}: ${source.value ? timeText(source.value) : `${rawText(source.raw)} (kan ikke tolkes sikkert)`}`)),
  acceptedText: item.accepted ? `${timeText(item.accepted.value)} · ${photoMetadataSourceLabel('captureTime', item.accepted.provenance)}` : null, note: captureNote(item) };
  return Object.freeze({ ...row, selectable: selectable(row) });
}

function directionNote(item) {
  if (item.accepted) return null;
  if (item.sourcePending && item.state !== 'pending') return 'Leser bildedata … Kan brukes når lesingen er ferdig.';
  if (item.state === 'adoptable' && item.zeroNeedsReview) return 'GML oppgir 0°, som ikke regnes mot den andre kilden.';
  if (item.state === 'pending') return 'Leser bildedata …';
  if (item.state === 'none') return 'Ingen kildeverdi';
  return null;
}

function directionRow(item, photo) {
  const evidence = (photo.directionEvidence || []).filter((source) => source.field === 'direction');
  const row = { ...item, ...photoRow(photo), key: item.occurrenceId, photoId: item.occurrenceId, sources: evidence.map((source) => line(source.id, photoDirectionEvidenceText(source))),
    acceptedText: item.accepted ? `${photoDirectionLabel(item.accepted.degrees)} · ${photoDirectionSourceLabel(item.accepted)}` : null, note: directionNote(item),
    // The explicit route, asked of the same rule the action uses: a real heading from another source still stops it.
    zeroAcceptable: item.state === 'zero-review' && !item.sourcePending && evidenceEligibility(photo, 'direction', 'gml', { includeZero: true }).status === 'eligible' };
  return Object.freeze({ ...row, selectable: selectable(row) });
}

const PHOTOGRAPHER_STATES = Object.freeze({ alreadyAccepted: 'accepted', eligible: 'adoptable', conflicting: 'conflict', unusable: 'unusable', missing: 'none' });

// Readiness counts photographers without classifying them, so its asset scope is reused and only the source rule is asked here.
function photographerRow(item, photo) {
  const accepted = photo.captureMetadata?.photographer || null;
  const evidence = (photo.metadataEvidence || []).filter((source) => source.field === 'photographer');
  const row = { assetId: item.assetId, photoId: item.photoId, ...photoRow(photo), key: item.assetId, accepted, state: PHOTOGRAPHER_STATES[evidenceEligibility(photo, 'photographer', 'exif').status],
    sources: evidence.map((source) => line(source.id, `${sourceName(source)}: ${source.value || `${rawText(source.raw)} (kan ikke tolkes sikkert)`}`)),
    acceptedText: accepted ? `${accepted.value} · ${photoMetadataSourceLabel('photographer', accepted.provenance)}` : null, note: null };
  return Object.freeze({ ...row, selectable: selectable(row) });
}

const CAPTURE_GROUPS = Object.freeze([
  ['adoptable', 'Kan brukes'], ['conflict', 'Ulike kildeverdier', 'Velg verdi for hvert bilde. Ingen kilde går foran en annen.'],
  ['partial', 'Tid uten sekunder', 'Oppgi sekunder, eller bekreft at de er 00.'], ['unusable', 'Kan ikke tolkes'],
  ['pending', 'Leser bildedata', 'Oppdateres av seg selv når lesingen er ferdig.'], ['none', 'Ingen kildeverdi'],
]);
const DIRECTION_GROUPS = Object.freeze([
  ['adoptable', 'Kan brukes'], ['conflict', 'Ulike kildeverdier', 'Velg plasseringene og oppgi riktig retning.'], ['zero-review', 'GML oppgir 0°'],
  ['unsupported', 'Ukjent referanse', 'Vises bare. Verdien brukes ikke, fordi den ikke er oppgitt fra geografisk nord.'], ['unusable', 'Kan ikke tolkes'],
  ['invalid', 'Ugyldig godtatt retning', 'Rett retningen med «Angi på kartet».'],
  ['pending', 'Leser bildedata', 'Oppdateres av seg selv når lesingen er ferdig.'], ['none', 'Ingen kildeverdi'],
]);
const PHOTOGRAPHER_GROUPS = Object.freeze([
  ['adoptable', 'Kan brukes'], ['conflict', 'Ulike kildeverdier', 'Velg verdi for hvert bilde.'], ['unusable', 'Kan ikke tolkes'], ['none', 'Ingen kildeverdi'],
]);

// A long group starts folded when other groups follow it, so a few conflicts are not buried under hundreds of ready rows.
const LONG_GROUP = 25;
function groupRows(rows, definitions) {
  const groups = definitions.map(([state, label, hint = null]) => ({ state, label, hint, rows: rows.filter((row) => row.state === state) })).filter((group) => group.rows.length);
  return groups.map((group) => ({ ...group, open: groups.length === 1 || group.rows.length <= LONG_GROUP }));
}

function panel(rows, definitions) {
  return { rows, groups: groupRows(rows, definitions), done: rows.filter((row) => row.state === 'accepted') };
}

function requirementFor(key, requirement, outstanding, empty = false) {
  return { key, requirement, requirementLabel: REQUIREMENT_LABELS[requirement] ?? null, outstanding, empty };
}

export function photoCompletionModel(photos, readiness) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const { captureTime, direction, photographer, placement, context } = readiness.tasks;
  const capturePanel = panel(captureTime.items.map((item) => captureRow(item, byId.get(item.photoId))), CAPTURE_GROUPS);
  const directionPanel = panel(direction.items.map((item) => directionRow(item, byId.get(item.occurrenceId))), DIRECTION_GROUPS);
  const photographerPanel = panel(captureTime.items.map((item) => photographerRow(item, byId.get(item.photoId))), PHOTOGRAPHER_GROUPS);
  const unplaced = placement.occurrenceIds.map((id) => Object.freeze({ key: id, photoId: id, ...photoRow(byId.get(id)) }));
  const remaining = ({ rows, done }) => rows.length - done.length;

  // Omitted photographer values never reach the delivery, so they are shown but never counted as work left.
  const tasks = [
    { ...requirementFor('captureTime', captureTime.requirement, remaining(capturePanel), !capturePanel.rows.length), label: 'Opptakstid', group: 'main' },
    { ...requirementFor('direction', direction.requirement, remaining(directionPanel), !directionPanel.rows.length), label: 'Retning', group: 'main' },
    { key: 'placement', label: 'Plassering', group: 'main', requirement: null, requirementLabel: placement.unplaced ? 'Blir ikke med' : null, outstanding: placement.unplaced },
    ...(context.required ? [{ ...requirementFor('context', 'required', context.missingFields.length), label: 'Leveranseopplysninger', group: 'main' }] : []),
    { ...requirementFor('photographer', photographer.requirement, photographer.requirement === 'omitted' ? 0 : remaining(photographerPanel), !photographerPanel.rows.length), label: 'Fotograf',
      group: photographer.requirement === 'omitted' ? 'other' : 'main' },
  ].map((task) => Object.freeze({ ...task, done: task.outstanding === 0 && !task.empty }));

  return { tasks, captureTime: { ...captureTime, ...capturePanel }, direction: { ...direction, ...directionPanel },
    photographer: { ...photographer, ...photographerPanel }, placement: { ...placement, rows: unplaced }, context, excluded: readiness.counts.excluded };
}

// What needs attention first: something that blocks, then anything outstanding, then the first task. With nothing
// placed the photo tasks have no rows yet, so Plassering comes first.
export function initialCompletionTask(tasks) {
  const open = tasks.filter((task) => !task.done && !task.empty);
  return (open.find((task) => task.requirement === 'required') || open.find((task) => task.group === 'main') || tasks[0]).key;
}

// One line on the state of the delivery. Generation is confirmed by the plan, so this never promises a package.
export function photoCompletionStatus(readiness) {
  const { status, blocking, recommendations, levels } = readiness;
  if (status === 'blocked') return { status, text: `${blocking.length} må rettes før eksport` };
  if (status === 'schema-gap') return { status, text: `Kan eksporteres, men følger ikke ${levels.schema.name}-skjemaet` };
  if (status === 'recommendations') return { status, text: `Kan eksporteres, men ${recommendations.length} kan forbedres` };
  return { status, text: 'Ingen opplysninger mangler for dette målet' };
}

const CAPTURE_RECOMMENDATIONS = Object.freeze(['evidence-pending', 'capture-time-utc', 'capture-time-implausible', 'capture-time-bulk']);
const DIRECTION_RECOMMENDATIONS = Object.freeze(['direction-all-zero', 'direction-bulk']);
export const completionRecommendations = (readiness, task) => readiness.recommendations
  .filter((item) => (task === 'direction' ? DIRECTION_RECOMMENDATIONS : CAPTURE_RECOMMENDATIONS).includes(item.code))
  .map((item) => Object.freeze({ code: item.code, text: singularCopy(item.message) }));

// Selections can outlive the rows they name: an accepted or removed row simply stops being selected.
export const liveSelection = (rows, selected = []) => { const keys = new Set(selected); return rows.filter((row) => row.selectable && keys.has(row.key)).map((row) => row.key); };

// A used selection keeps narrowing until it is cleared. Otherwise the button under the cursor would widen to every
// eligible row between the two clicks of a double-click. With nothing left to act on there is nothing to protect.
export const selectionScope = (rows, selected = []) => rows.some((row) => row.selectable) ? selected : [];

// Nothing selected means every eligible row; a selection narrows that and never widens it.
export function scopedRows(rows, selected, eligible) {
  const keys = new Set(selected);
  return rows.filter((row) => eligible(row) && (!keys.size || keys.has(row.key)));
}

export const canAdopt = (kind) => (row) => row.state === 'adoptable' && row.adoptableKinds.includes(kind) && !row.sourcePending;
export const canAdoptPhotographer = (row) => row.state === 'adoptable';
export const canAcceptGmlZero = (row) => row.zeroAcceptable;
// The map can answer every row without an accepted, valid direction. GML 0° that was accepted stays questionable,
// since 0 can mean "not recorded": it can be looked at again, and the map is the only place it can be changed.
export const canSetOnMap = (row) => row.state !== 'accepted';
export const canReviewOnMap = (row) => row.state === 'accepted' && row.accepted.degrees === 0 && row.accepted.basis?.kind === 'gml';
export const isHeldBack = (row) => row.state !== 'pending' && !row.accepted && Boolean(row.sourcePending);
export const selectionRows = (rows, selected) => { const keys = new Set(selected); return rows.filter((row) => keys.has(row.key)); };

// Rows to bulk-fill: an explicit selection only, so one typed value can never reach every photo by default.
export const manualFillRows = (rows, selected) => selectionRows(rows, selected).filter((row) => row.selectable);

// Text of the counts strip. Each row appears in one count, apart from "Valgt", which cuts across them.
export function completionCounts({ rows, done }, selected, eligible) {
  const unresolved = rows.filter((row) => !row.accepted);
  return [['eligible', 'Kan brukes', unresolved.filter(eligible).length], ['selected', 'Valgt', selected.length], ['accepted', 'Godtatt', done.length],
    ['conflict', 'I konflikt', rows.filter((row) => row.state === 'conflict').length],
    ['review', 'Må vurderes', rows.filter((row) => row.state !== 'accepted' && row.state !== 'conflict' && !eligible(row)).length]]
    .map(([key, label, count]) => Object.freeze({ key, label, count }));
}

// Names used in this layer, offered as suggestions and never filled in.
export const photographerSuggestions = ({ rows }) => [...new Set(rows.map((row) => row.accepted?.value).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
