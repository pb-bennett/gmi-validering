import { PHOTO_EXPORT_PROFILE_METADATA } from './export/photoExportRules.mjs';
import { photoDirectionLabel } from './photoDirection.mjs';
import { evidenceEligibility } from './photoEvidenceAdoption.mjs';
import { formatPhotoCaptureTime, photoDirectionEvidenceText, photoDirectionSourceLabel, photoMetadataSourceLabel, photoSourceLabel } from './photoPresentation.mjs';

// Presentation over photoExportReadiness. States come from readiness and every write goes through the session,
// so nothing here decides what blocks an export or what counts as accepted. Source values are accepted by the
// session on its own, which leaves this tool with what is missing and with optional corrections.

export const PHOTO_COMPLETION_TARGETS = Object.freeze([
  ['gemini-legacy2019', 'Gemini VA'], ['legacy2019', 'Skråfoto 2019 (standard)'], ['asbuilt52', 'Norsk Vann AsBuilt 5.2'],
].map(([value, label]) => Object.freeze({ value, label, tier: PHOTO_EXPORT_PROFILE_METADATA[value].tier })));

const REQUIREMENT_LABELS = Object.freeze({ required: 'Påkrevd', recommended: 'Anbefalt', optional: 'Valgfritt', omitted: 'Tas ikke med i denne leveransen' });

const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;
export const photoCount = (count) => counted(count, 'bilde', 'bilder');
export const placementCount = (count) => counted(count, 'plassering', 'plasseringer');
export const selectedPhotoCount = (count) => counted(count, 'valgt bilde', 'valgte bilder');
export const selectedPlacementCount = (count) => counted(count, 'valgt plassering', 'valgte plasseringer');
// Readiness and plan copy is written for many. A lookbehind is not needed: "11 bilder" has no word boundary before its last 1.
const SINGULARS = Object.freeze({ bilder: 'bilde', 'unike bilder': 'unikt bilde', plasseringer: 'plassering', punkter: 'punkt', 'XYZ-punkter': 'XYZ-punkt', originalbilder: 'originalbilde', 'delte originalbilder': 'delt originalbilde',
  'godtatte fotografverdier': 'godtatt fotografverdi', objektkoblinger: 'objektkobling', features: 'feature', forekomster: 'forekomst', 'uplasserte forekomster': 'uplassert forekomst',
  'tidssone-suffikser': 'tidssone-suffiks', tidssoneendringer: 'tidssoneendring', 'Z-plassholdere': 'Z-plassholder' });
const PLURAL_AFTER_ONE = new RegExp(`\\b1 (${Object.keys(SINGULARS).join('|')})\\b`, 'g');
export const singularCopy = (text) => text.replace(PLURAL_AFTER_ONE, (_, plural) => `1 ${SINGULARS[plural]}`);

const line = (key, text) => Object.freeze({ key, text });
const sourceName = ({ kind, sourceFilename }) => `${photoSourceLabel(kind)}${sourceFilename ? ` · ${sourceFilename}` : ''}`;
const rawText = (raw) => typeof raw === 'string' ? raw : JSON.stringify(raw);
const timeText = (value) => { const format = formatPhotoCaptureTime(value); return format ? [format.text, ...format.notes].join(' · ') : value?.iso ?? ''; };

function photoRow(photo) {
  const { occurrenceCount = 1, occurrenceIndex = 1 } = photo.repeatGroup || {};
  return { filename: photo.originalFilename, thumbnailUrl: photo.preview?.state === 'ready' ? photo.preview.thumbnailUrl : null,
    occurrence: occurrenceCount > 1 ? `Plassering ${occurrenceIndex} av ${occurrenceCount}` : null };
}

// Selection is for rows a bulk action can write. Accepted values and rows still waiting for EXIF are left out;
// a default direction counts as missing, because a manual value may replace it.
const selectable = (row) => (!row.accepted || row.state === 'defaulted') && row.state !== 'pending' && !row.sourcePending;
const originOf = (accepted, basis) => !accepted ? null : basis?.kind === 'default' ? 'default' : basis?.kind === 'manual' ? 'manual' : 'source';

function captureNote(item) {
  if (item.sourcesDiffer) return 'Kildene oppgir ulike tider. Den prioriterte kilden er brukt.';
  if (item.state === 'partial') return item.replacesAccepted ? 'Har tid uten sekunder · Erstatter godtatt verdi' : 'Har tid uten sekunder';
  if (item.state === 'pending') return 'Leser bildedata …';
  if (item.state === 'none') return 'Ingen kildeverdi';
  return null;
}

function captureRow(item, photo) {
  const row = { ...item, ...photoRow(photo), key: item.assetId, sources: item.evidence.map((source) => line(source.id,
    `${sourceName(source)}: ${source.value ? timeText(source.value) : `${rawText(source.raw)} (kan ikke tolkes sikkert)`}`)),
  acceptedText: item.accepted ? `${timeText(item.accepted.value)} · ${photoMetadataSourceLabel('captureTime', item.accepted.provenance)}` : null, note: captureNote(item),
  origin: originOf(item.accepted, item.accepted?.provenance) };
  return Object.freeze({ ...row, selectable: selectable(row) });
}

function directionNote(item) {
  if (item.sourcesDiffer) return 'Kildene oppgir ulike verdier. GML er brukt.';
  if (item.accepted) return null;
  if (item.state === 'pending') return 'Leser bildedata …';
  if (item.state === 'none') return 'Ingen kildeverdi';
  return null;
}

function directionRow(item, photo) {
  const evidence = (photo.directionEvidence || []).filter((source) => source.field === 'direction');
  const row = { ...item, ...photoRow(photo), key: item.occurrenceId, photoId: item.occurrenceId, sources: evidence.map((source) => line(source.id, photoDirectionEvidenceText(source))),
    // The group says why a default is there, so each row need not repeat it.
    acceptedText: !item.accepted ? null : item.state === 'defaulted' ? photoDirectionLabel(item.accepted.degrees) : `${photoDirectionLabel(item.accepted.degrees)} · ${photoDirectionSourceLabel(item.accepted)}`, note: directionNote(item),
    origin: originOf(item.accepted, item.accepted?.basis) };
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
  ['none', 'Mangler opptakstid', 'Ingen kilde har en brukbar tid. Du kan fylle den ut, men det er valgfritt for Gemini VA.'],
  ['partial', 'Tid uten sekunder', 'Oppgi sekunder, eller bekreft at de er 00.'], ['unusable', 'Kan ikke tolkes'],
  ['conflict', 'Ulike kildeverdier', 'Velg verdi for hvert bilde.'], ['adoptable', 'Fjernet av deg', 'Kilden har en verdi, men den hentes ikke inn igjen av seg selv.'],
  ['pending', 'Leser bildedata', 'Oppdateres av seg selv når lesingen er ferdig.'],
]);
const DIRECTION_GROUPS = Object.freeze([
  ['defaulted', 'Standardretning 0°', 'Ingen kilde oppgir retning. Rett verdien hvis du kjenner den.'],
  ['adoptable', 'Kan brukes'], ['conflict', 'Ulike kildeverdier', 'Velg plasseringene og oppgi riktig retning.'],
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

// A default is settled for export, so it is not work left. It stays in its own group, where it can be corrected.
function panel(rows, definitions) {
  return { rows, groups: groupRows(rows, definitions), done: rows.filter((row) => row.state === 'accepted'), outstanding: rows.filter((row) => !['accepted', 'defaulted'].includes(row.state)).length };
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

  // Omitted photographer values never reach the delivery, so they are shown but never counted as work left.
  const tasks = [
    { ...requirementFor('captureTime', captureTime.requirement, capturePanel.outstanding, !capturePanel.rows.length), label: 'Opptakstid', group: 'main' },
    { ...requirementFor('direction', direction.requirement, directionPanel.outstanding, !directionPanel.rows.length), label: 'Retning', group: 'main' },
    { key: 'placement', label: 'Plassering', group: 'main', requirement: null, requirementLabel: placement.unplaced ? 'Blir ikke med' : null, outstanding: placement.unplaced },
    ...(context.required ? [{ ...requirementFor('context', 'required', context.missingFields.length), label: 'Leveranseopplysninger', group: 'main' }] : []),
    { ...requirementFor('photographer', photographer.requirement, photographer.requirement === 'omitted' ? 0 : photographerPanel.outstanding, !photographerPanel.rows.length), label: 'Fotograf',
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

// The whole layer counts, placed or not: a plan goes stale when any member finishes, and readiness sees placed photos only.
export const photosBeingRead = (photos) => new Set(photos.filter((photo) => photo.spatial?.exifRead?.state === 'pending').map((photo) => photo.assetId)).size;
export const photoReadingNote = (count) => singularCopy(`${count} bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.`);

// One line on the state of the delivery. Generation is confirmed by the plan, so this never promises a package. Until a read
// ends, what readiness blocks on may not be real, so `reading` comes first. Recommendations are categories, each with its own
// count and unit, so no total is given: the list beside this line says how many of what.
export function photoCompletionStatus(readiness, reading = 0) {
  const { status, blocking, levels } = readiness;
  if (reading) return { status: 'reading', text: 'Leser bildedata …' };
  if (status === 'blocked') return { status, text: `${blocking.length} må rettes før eksport` };
  if (status === 'schema-gap') return { status, text: `Kan eksporteres, men følger ikke ${levels.schema.name}-skjemaet` };
  if (status === 'recommendations') return { status, text: 'Kan eksporteres, men noe bør kontrolleres' };
  return { status, text: 'Ingen opplysninger mangler for dette målet' };
}

// Generation, schema and import are separate questions, so each gets its own answer. Only rules are checked here,
// and nothing here can say that a package will import: that takes a real import.
const SCHEMA_GAPS = Object.freeze({ captureTime: (gap) => `opptakstid mangler for ${photoCount(gap.count)}`, direction: (gap) => `retning mangler for ${placementCount(gap.count)}`, context: () => 'leveranseopplysninger mangler' });
export function photoExportLevels({ levels: { generation, schema, importEvidence } }) {
  const notValidated = 'XSD-validering er ikke kjørt.';
  return [
    Object.freeze({ key: 'generation', label: 'Eksportpakke', text: generation === 'possible' ? 'Kan lages' : 'Kan ikke lages ennå' }),
    Object.freeze({ key: 'schema', label: schema.name ? `${schema.name}-skjema` : 'Skjema', text: !schema.assessed ? 'Ikke vurdert ennå'
      : schema.met ? `Kravene er oppfylt etter regelsjekk. ${notValidated}` : `Oppfylles ikke: ${schema.gaps.map((gap) => SCHEMA_GAPS[gap.field](gap)).join(', ')}. ${notValidated}` }),
    Object.freeze({ key: 'import', label: 'Import i Gemini VA', text: importEvidence.profile === 'imported' && !importEvidence.deviations.length
      ? 'Profilen er importert tidligere, men denne pakken er ikke testet.' : 'Ikke verifisert for denne pakken. Må testes manuelt.' }),
  ];
}

// A placed photo still being read has no default direction or source time yet, so what readiness blocks on may not be real.
export const photoExportAwaitingSource = ({ recommendations }) => recommendations.some((item) => item.code === 'evidence-pending');

// Missing time is allowed through only where it does not block, and that must never pass quietly.
export function photoCaptureTimeSchemaWarning({ levels, tasks }) {
  const gap = levels.schema.gaps.find((item) => item.field === 'captureTime');
  if (!gap || tasks.captureTime.requirement === 'required') return null;
  return singularCopy(`${gap.count} bilder mangler full opptakstid, så GML-filen oppfyller ikke ${levels.schema.name}-skjemaet. Det er ikke verifisert at Gemini VA godtar en slik pakke.`);
}

const CAPTURE_RECOMMENDATIONS = Object.freeze(['evidence-pending', 'capture-time-utc', 'capture-time-implausible', 'capture-time-bulk', 'capture-time-sources-differ']);
const DIRECTION_RECOMMENDATIONS = Object.freeze(['direction-defaulted', 'direction-sources-differ', 'direction-bulk']);
export const completionRecommendations = (readiness, task) => [...readiness.recommendations, ...readiness.notes]
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

export const canAdoptPhotographer = (row) => row.state === 'adoptable';
// The map can answer every row without a direction from a source or a person. Any accepted row can still be corrected there.
export const canSetOnMap = (row) => row.state !== 'accepted';
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

// Where the values came from. Each row counts once; "Valgt" cuts across and only shows with a selection.
export function completionSummary({ rows }, selected) {
  return [['source', 'Fra kilde', rows.filter((row) => row.origin === 'source').length], ['manual', 'Manuelt', rows.filter((row) => row.origin === 'manual').length],
    ['default', 'Standardverdi', rows.filter((row) => row.origin === 'default').length], ['missing', 'Mangler', rows.filter((row) => !row.origin).length], ['selected', 'Valgt', selected.length]]
    .filter(([, , count]) => count > 0).map(([key, label, count]) => Object.freeze({ key, label, count }));
}

// Names used in this layer, offered as suggestions and never filled in.
export const photographerSuggestions = ({ rows }) => [...new Set(rows.map((row) => row.accepted?.value).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
