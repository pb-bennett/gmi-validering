import { PHOTO_EXPORT_PROFILE_METADATA } from './export/photoExportRules.mjs';
import { photoDirectionLabel } from './photoDirection.mjs';
import { evidenceEligibility } from './photoEvidenceAdoption.mjs';
import { planCaptureCompletion } from './photoCaptureCompletion.mjs';
import { formatPhotoCaptureTime, photoDirectionEvidenceText, photoDirectionSourceLabel, photoMetadataOrigin, photoMetadataSourceLabel, photoSourceLabel } from './photoPresentation.mjs';

// Presentation over photoExportReadiness. States come from readiness and every write goes through the session,
// so nothing here decides what blocks an export or what counts as accepted. GML evidence remains available
// for explicit adoption through the existing per-photo dialog.

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
// A technically completed value always carries its note (M5); other provenance is named by the source label.
const timeText = (value, provenance = null) => { const format = formatPhotoCaptureTime(value, provenance?.technical ? provenance : null); return format ? [format.text, ...format.notes].join(' · ') : value?.iso ?? ''; };

function photoRow(photo) {
  const { occurrenceCount = 1, occurrenceIndex = 1 } = photo.repeatGroup || {};
  return { filename: photo.originalFilename, thumbnailUrl: photo.preview?.state === 'ready' ? photo.preview.thumbnailUrl : null,
    occurrence: occurrenceCount > 1 ? `Plassering ${occurrenceIndex} av ${occurrenceCount}` : null };
}

// Selection is for rows a bulk action can write. Accepted values and rows still waiting for EXIF are left out;
// a default direction counts as missing, because a manual value may replace it.
const selectable = (row) => (!row.accepted || row.state === 'defaulted') && row.state !== 'pending' && !row.sourcePending;

function captureNote(item) {
  if (item.sourcesDiffer) return 'Kildene oppgir ulike tider.';
  if (item.cleared) return 'Fjernet av deg.';
  if (!item.accepted && item.evidence.some((source) => source.kind === 'gml' && source.value)) return 'GML-verdien er ikke godtatt.';
  if (item.state === 'partial' && !item.accepted) return 'Har tid uten sekunder';
  if (item.state === 'pending') return 'Leser bildedata …';
  if (item.state === 'none') return 'Ingen kildeverdi';
  return null;
}

// C1.4: a known, accepted date is sufficient for the user-facing task: date-only, minute-precision and estimated values
// count as done. Hours, minutes and seconds are supplementary. Only a target that requires a complete time (Legacy,
// AsBuilt) keeps an accepted incomplete value as work left, because its export contract blocks on it. The actual
// precision and provenance are kept on the row (`precisionState`).
const dateSufficient = (item, requirement) => item.state === 'partial' && Boolean(item.accepted) && requirement !== 'required';

function captureRow(source, photo, requirement) {
  const item = dateSufficient(source, requirement) ? { ...source, state: 'accepted', precisionState: 'partial' } : source;
  const row = { ...item, ...photoRow(photo), key: item.assetId, sources: item.evidence.map((source) => line(source.id,
    `${sourceName(source)}: ${source.value ? timeText(source.value) : `${rawText(source.raw)} (kan ikke tolkes sikkert)`}`)),
  acceptedText: item.accepted ? `${timeText(item.accepted.value, item.accepted.provenance)} · ${photoMetadataSourceLabel('captureTime', item.accepted.provenance)}` : null,
  note: item.accepted?.provenance?.estimated ? '12:00:00 er teknisk standard, ikke målt opptakstid.' : captureNote(item),
  noteTone: item.sourcesDiffer || (!item.accepted && item.evidence.some((source) => source.kind === 'gml' && source.value)) ? 'warning' : undefined,
  origin: item.origin };
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
    origin: photoMetadataOrigin(item.accepted, item.accepted?.basis) };
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

// The hint follows the target's own rule, so it never names Gemini VA when another target is chosen. The rule itself is
// readiness's: a required time blocks, a recommended one is let through with the schema gap shown.
function missingTimeHint(requirement, schemaName) {
  const none = 'Ingen kilde har en brukbar dato.';
  if (requirement === 'required') return `${none} Opptakstid med sekunder kreves${schemaName ? ` for ${schemaName}` : ''}, og må fylles ut før eksport.`;
  if (requirement === 'recommended') return `${none} Eksporten kan lages uten, men GML-filen følger da ikke ${schemaName || 'skjemaet'}-skjemaet.`;
  if (requirement === 'optional') return `${none} Du kan fylle den ut, men det er valgfritt.`;
  return none;
}
const CAPTURE_GROUPS = Object.freeze([
  ['none', 'Mangler opptaksdato', ({ requirement, schemaName }) => missingTimeHint(requirement, schemaName)],
  // Only a target that requires a complete time lists accepted incomplete values here (C1.4).
  ['partial', 'Dato uten fullstendig klokkeslett', ({ requirement, schemaName }) => requirement === 'required'
    ? `${schemaName || 'Dette målet'} krever klokkeslett med sekunder. Bruk «Teknisk utfylling», eller rediger tiden.` : 'Godta eller rediger verdien med «Rediger…».'],
  ['unusable', 'Kan ikke tolkes'],
  ['conflict', 'Ulike kildeverdier', 'Velg verdi for hvert bilde.'], ['adoptable', 'Opptakstid i kilde', 'Velg verdi med «Rediger…».'],
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
function groupRows(rows, definitions, context) {
  const groups = definitions.map(([state, label, hint = null]) => ({ state, label, hint: typeof hint === 'function' ? hint(context) : hint, rows: rows.filter((row) => row.state === state) })).filter((group) => group.rows.length);
  return groups.map((group) => ({ ...group, open: groups.length === 1 || group.rows.length <= LONG_GROUP }));
}

// A default is settled for export, so it is not work left. It stays in its own group, where it can be corrected.
function panel(rows, definitions, context = {}) {
  return { rows, groups: groupRows(rows, definitions, context), done: rows.filter((row) => row.state === 'accepted'), outstanding: rows.filter((row) => !['accepted', 'defaulted'].includes(row.state)).length };
}

function requirementFor(key, requirement, outstanding, empty = false) {
  return { key, requirement, requirementLabel: REQUIREMENT_LABELS[requirement] ?? null, outstanding, empty };
}

export function photoCompletionModel(photos, readiness) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const { captureTime, direction, photographer, placement, context } = readiness.tasks;
  const capturePanel = panel(captureTime.items.map((item) => captureRow(item, byId.get(item.photoId), captureTime.requirement)), CAPTURE_GROUPS,
    { requirement: captureTime.requirement, schemaName: readiness.levels.schema.name });
  // M5: the batch completion steps (source, filename, technical, estimate), each applied by its own button.
  capturePanel.completion = planCaptureCompletion(photos);
  capturePanel.estimatedDates = capturePanel.completion.estimate;
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

// Generation and schema are separate questions, so each gets its own answer. Only rules are checked here.
// Batch 1B.4B: no import-test status is shown to users; the recorded import evidence stays internal (photoExportRules).
function captureTimeGapText({ missing, insufficientPrecision }) {
  return [missing > 0 && `opptakstid mangler for ${photoCount(missing)}`,
    insufficientPrecision > 0 && `${photoCount(insufficientPrecision)} har opptaksdato, men mangler fullstendig klokkeslett`].filter(Boolean).join(', og ');
}

const SCHEMA_GAPS = Object.freeze({ captureTime: captureTimeGapText, direction: (gap) => `retning mangler for ${placementCount(gap.count)}`, context: () => 'leveranseopplysninger mangler' });
export function photoExportLevels({ levels: { generation, schema } }) {
  const notValidated = 'XSD-validering er ikke kjørt.';
  return [
    Object.freeze({ key: 'generation', label: 'Eksportpakke', text: generation === 'possible' ? 'Kan lages' : 'Kan ikke lages ennå' }),
    Object.freeze({ key: 'schema', label: schema.name ? `${schema.name}-skjema` : 'Skjema', text: !schema.assessed ? 'Ikke vurdert ennå'
      : schema.met ? `Kravene er oppfylt etter regelsjekk. ${notValidated}` : `Oppfylles ikke: ${schema.gaps.map((gap) => SCHEMA_GAPS[gap.field](gap)).join(', ')}. ${notValidated}` }),
  ];
}

// A placed photo still being read has no default direction or source time yet, so what readiness blocks on may not be real.
export const photoExportAwaitingSource = ({ recommendations }) => recommendations.some((item) => item.code === 'evidence-pending');

// Missing time is allowed through only where it does not block, and that must never pass quietly.
export function photoCaptureTimeSchemaWarning({ levels, tasks }) {
  const gap = levels.schema.gaps.find((item) => item.field === 'captureTime');
  if (!gap || tasks.captureTime.requirement === 'required') return null;
  const detail = captureTimeGapText(gap);
  return `${detail[0].toUpperCase()}${detail.slice(1)}. GML-filen utelater disse opptakstidene og oppfyller derfor ikke ${levels.schema.name}-skjemaet.`;
}

const CAPTURE_RECOMMENDATIONS = Object.freeze(['evidence-pending', 'capture-time-utc', 'capture-time-implausible', 'capture-time-bulk', 'capture-time-filename', 'capture-time-estimated', 'capture-time-technical', 'capture-time-sources-differ']);
const DIRECTION_RECOMMENDATIONS = Object.freeze(['direction-defaulted', 'direction-sources-differ', 'direction-bulk']);
// C1.5: in Opptakstid, readiness notes are information (`info`) and recommendations are «Bør kontrolleres». Retning is unchanged.
export const completionRecommendations = (readiness, task) => [...readiness.recommendations.map((item) => [item, false]), ...readiness.notes.map((item) => [item, task !== 'direction'])]
  .filter(([item]) => (task === 'direction' ? DIRECTION_RECOMMENDATIONS : CAPTURE_RECOMMENDATIONS).includes(item.code))
  .map(([item, info]) => Object.freeze({ code: item.code, text: singularCopy(item.message), info }));

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
    ['filename', 'Tolket fra filnavn', rows.filter((row) => row.origin === 'filename').length],
    ['estimated', 'Anslått', rows.filter((row) => row.origin === 'estimated').length],
    ['default', 'Standardverdi', rows.filter((row) => row.origin === 'default').length], ['missing', 'Mangler dato', rows.filter((row) => !row.origin).length], ['selected', 'Valgt', selected.length]]
    .filter(([, , count]) => count > 0).map(([key, label, count]) => Object.freeze({ key, label, count }));
}

// Names used in this layer, offered as suggestions and never filled in.
export const photographerSuggestions = ({ rows }) => [...new Set(rows.map((row) => row.accepted?.value).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));

// C1.1: where the accepted dates offered for technical completion came from, from each row's own provenance; it is never
// assumed that an incomplete value came from a filename.
const ORIGIN_TEXT = Object.freeze({ filename: 'tolket fra filnavn', exif: 'fra EXIF', gml: 'fra GML', manual: 'angitt manuelt' });
const originBreakdown = (rows) => [...Map.groupBy(rows, (row) => ORIGIN_TEXT[row.provenance?.kind] ? row.provenance.kind : 'other')]
  .map(([kind, items]) => `${items.length} ${ORIGIN_TEXT[kind] || 'fra andre kilder'}`).join(', ');

// C1.1: which components are known, from which sources, and what technical completion adds for the chosen target.
export function technicalCompletionExplanation(rows, requirement, schemaName = null) {
  const dates = rows.filter((row) => row.kind === 'noon').length, minutes = rows.length - dates;
  const known = [dates && `${photoCount(dates)} har bare dato`, minutes && `${photoCount(minutes)} har dato og klokkeslett uten sekunder`].filter(Boolean).join(', og ');
  const schema = schemaName ? `${schemaName}-skjemaet` : 'Skjemaet';
  const target = requirement === 'required'
    ? `${schemaName || 'Dette målet'} krever klokkeslett med sekunder, så disse bildene må fullføres før eksport.`
    : `Datoen er nok for leveransen. ${schema} krever likevel klokkeslett med sekunder, så uten utfylling får disse bildene ikke opptakstid i GML-filen.`;
  return singularCopy(`${known.charAt(0).toUpperCase()}${known.slice(1)} (${originBreakdown(rows)}). ${target} Teknisk utfylling legger bare til de manglende delene; dato og kjente klokkeslett beholdes, og de utfylte delene er ikke målt.`);
}

// C1.2: the outcome of one batch step, from the counts the session actually wrote. Interpreted (filename), measured
// (EXIF), source (GML) and technically completed values are named as such.
export function captureStepResultText(step, { count = 0, counts = {}, kinds = {} } = {}) {
  const parts = [counts.complete && `${counts.complete} med dato og klokkeslett`, counts.minute && `${counts.minute} uten sekunder`, counts.date && `${counts.date} med kun dato`].filter(Boolean).join(', ');
  if (step === 'source') {
    const sources = [kinds.exif && `${kinds.exif} fra EXIF, målt av kameraet`, kinds.gml && `${kinds.gml} fra GML`].filter(Boolean).join(', ');
    return `Godtatt for ${photoCount(count)}: ${parts}${sources ? ` (${sources})` : ''}. Godtatte og fjernede verdier er beholdt.`;
  }
  if (step === 'filename') return `Tolket fra filnavn og godtatt for ${photoCount(count)}: ${parts}. Verdiene er tolket, ikke målt. Godtatte og fjernede verdier er beholdt.`;
  const added = [counts.noon && `${counts.noon} fikk kl. 12:00:00`, counts.seconds && `${counts.seconds} fikk 00 sekunder`].filter(Boolean).join(', ');
  return `Teknisk utfylt for ${photoCount(count)}: ${added}. Dato og kjente klokkeslett er beholdt, og de utfylte delene er ikke målt.`;
}
