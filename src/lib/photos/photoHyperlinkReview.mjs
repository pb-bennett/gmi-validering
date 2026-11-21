// Batch 1A: inspection only. No patch, session, position or delivery mutation API.
import { bindGmiLayerSchema } from '../validation-v2/gmiLayerSchemaBinding.js';
import { resolveGmiTemaIdentity } from '../validation-v2/temaIdentity.js';
import { createObjectRef } from '../validation-v2/objectRef.js';
import { getDatasetRevision } from '../validation-v2/datasetRevision.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { gmiPointPosition, reviewGmiPhotoSource } from './gmiPhotoSource.mjs';
import { photoPositionDistance } from './photoPositioning.mjs';
import { photoDeliveryOptions } from './photoDeliveryChoice.mjs';

const collections = { point: 'points', line: 'lines' };
const identifiers = ['AnleggsID', 'S_OBJID', 'PUNKT-NAVN', 'PUNKT-KODE'];
export const PHOTO_LINK_REVIEW_STALE = 'Kildegrunnlaget eller Validator-revisjonen er endret. Lukk gjennomgangen og åpne den på nytt fra gjeldende lag.';
const relevantFinding = (finding) => finding.canonicalFieldId === 'attachmentLink'
  && finding.reasonCode === 'APPLICABILITY_UNEXPECTED_VALUE' && finding.objectRef?.geometryScope === 'point';

/** Uses full detailed findings, never grouped/capped display samples. */
export function preparePhotoLinkReviewHandoff({ layer, binding, dataset, datasetKind, run, ruleIds, session = null }) {
  const fail = () => ({ ok: false, message: PHOTO_LINK_REVIEW_STALE });
  if (!layer?.data || !dataset || !Array.isArray(dataset.points) || !Array.isArray(dataset.lines)
    || !Array.isArray(run?.ruleResults) || !Array.isArray(ruleIds) || !binding || !binding.inputId
    || binding.layerId !== layer.id || binding.datasetRevision !== getDatasetRevision(layer.data)
    || !['original', 'proposed'].includes(datasetKind) || (datasetKind === 'original' && dataset !== layer.data)
    || (datasetKind === 'proposed' && !session) || run?.layerId !== layer.id
    || run.datasetRevision !== getDatasetRevision(dataset)) return fail();
  const findings = run.ruleResults.filter((entry) => ruleIds.includes(entry.rule.ruleId)).flatMap((entry) => entry.findings).filter(relevantFinding);
  if (!findings.length) return fail();
  for (const finding of findings) {
    const ref = finding.objectRef;
    if (ref.layerId !== layer.id || ref.datasetRevision !== run.datasetRevision || !Number.isSafeInteger(ref.sourceIndex) || ref.sourceIndex < 0
      || ref.key !== createObjectRef({ layerId: layer.id, datasetRevision: run.datasetRevision, geometryScope: 'point', objectIndex: ref.sourceIndex }).key) return fail();
    const original = layer.data.points[ref.sourceIndex], effective = dataset.points[ref.sourceIndex];
    if (!original || !effective || original.id !== effective.id || (original.guid ?? null) !== (effective.guid ?? null)) return fail();
  }
  return { ok: true, request: Object.freeze({ kind: 'validator-photo-links', layerId: layer.id, binding,
    originalDataset: layer.data, dataset, datasetKind, run, session,
    ruleIds: Object.freeze([...ruleIds]), findings: Object.freeze([...findings]),
    refs: Object.freeze([...new Map(findings.map((finding) => [finding.objectRef.key, finding.objectRef])).values()]) }) };
}

export function photoLinkReviewHandoffIsCurrent(request, { layer, binding, dataset, session = null }) {
  if (request?.kind !== 'validator-photo-links' || !request.binding || !Array.isArray(request.findings) || !Array.isArray(request.refs)
    || request.originalDataset !== layer?.data || request.dataset !== dataset
    || request.binding.inputId !== binding?.inputId || request.binding.datasetRevision !== binding?.datasetRevision
    || request.session !== session) return false;
  const checked = preparePhotoLinkReviewHandoff({ ...request, layer, binding, dataset, session });
  return checked.ok && checked.request.findings.length === request.findings.length
    && checked.request.findings.every((finding, index) => finding === request.findings[index])
    && checked.request.refs.length === request.refs.length && checked.request.refs.every((ref, index) => ref.key === request.refs[index].key);
}

/** Reconstitute a read-only V2 adapter from original FOTO evidence, including lexical Tema disagreements. */
export function photoLinkReviewDataset(source) {
  const dataset = { header: source.header, crsContext: source.crsContext, points: [], lines: [] };
  for (const object of Object.values(source.objectsByKey)) {
    dataset[collections[object.geometryScope]][object.sourceIndex] = { id: object.parserId, guid: object.guid,
      coordinates: object.rawGeometry, attributes: { ...object.attributes, [GMI_SOURCE_LEXEMES]: object.rawFields } };
  }
  return dataset;
}

function linkShape(raw) {
  const parsed = extractHyperlinkOccurrences(raw);
  if (typeof raw !== 'string') return 'non-string';
  if (!raw.trim()) return 'empty';
  if (parsed.diagnostics.some((issue) => issue.code === 'invalid-wrapper-grammar')) return 'malformed';
  if (!/^h:/i.test(raw.trim())) return 'bare';
  if (parsed.sources.some((source) => source.members.filter((member) => member.key === 'link')
    .some((member, index, members) => members.some((other, otherIndex) => otherIndex !== index && other.wrapperOrdinal === member.wrapperOrdinal)))) return 'multi-member';
  if (!parsed.occurrences.length) return 'no-link';
  // The extractor can read separators which the current removal engine cannot write.
  const wrappers = [...new Map(parsed.occurrences.map((ref) => [ref.wrapperStart, ref])).values()];
  let end = 0;
  for (const wrapper of wrappers) {
    if (raw.slice(end, wrapper.wrapperStart).trim()) return 'mixed-separators';
    end = wrapper.wrapperEnd;
  }
  return raw.slice(end).trim() ? 'mixed-separators' : 'whole-wrappers';
}

export const PHOTO_LINK_SHAPE_LABELS = Object.freeze({ empty: 'Tomt felt', 'whole-wrappers': 'Hele h:-uttrykk – skrivekontrakt må avklares',
  bare: 'Bar filreferanse – flytting støttes ikke', malformed: 'Feilformet lenke – kontroller originalfeltet',
  'multi-member': 'Flere lenker i samme h:-uttrykk – flytting støttes ikke', 'non-string': 'Sammensatt feltverdi – flytting støttes ikke',
  'no-link': 'Ingen lesbar lenke i uttrykket', 'mixed-separators': 'Blandede skilletegn – flytting støttes ikke' });

function objectEvidence(source, object, effective, tema, objectRef) {
  const attributes = effective.attributes || {};
  const rawAttributes = attributes[GMI_SOURCE_LEXEMES] || {};
  const cells = Object.keys(object.attributes).filter((key) => /^S_HYPERLINK/i.test(key)).map((field) => {
    const raw = object.rawFields?.[field] ?? object.attributes[field] ?? '';
    return { field, raw, shape: linkShape(raw), canonical: field === 'S_HYPERLINK' };
  });
  const identifierText = identifiers.filter((key) => attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== '')
    .map((key) => `${key}: ${Object.hasOwn(rawAttributes, key) ? rawAttributes[key] : `${attributes[key]} (tolket verdi)`}`).join(' · ');
  const pointName = `Punkt ${object.parserId}`;
  return { ...object, attributes, rawAttributes, objectRef, temaIdentity: tema, tema: tema.state === 'RESOLVED' ? tema.resolvedValue : null,
    pointName, identifierText, label: identifierText || pointName,
    anleggsId: typeof rawAttributes.AnleggsID === 'string' && rawAttributes.AnleggsID.trim() ? rawAttributes.AnleggsID : null,
    cells, placement: gmiPointPosition(source, object),
    zEvidence: Object.fromEntries(Object.entries(attributes).filter(([key]) => /høyde|hoyde|vertikal|dybde|dimensjon|bredde/i.test(key))) };
}

const issue = (code, text, blocking = true) => Object.freeze({ code, text, blocking });

/**
 * Linear detection. Candidate distances are derived only for the case being inspected.
 * Every point object in the same source is a possible recipient (no Tema whitelist, no radius); `liveSource` states whether
 * the source is bound to a live loaded GMI layer, which a future transfer requires.
 */
export function detectPhotoLinkReview({ source, dataset = photoLinkReviewDataset(source), layerId = source.id || 'foto-review', photos = [], delivery = null,
  focusRefs = null, liveSource = false }) {
  const datasetRevision = getDatasetRevision(dataset);
  const input = { layerId, datasetRevision, dataset, sourceFormat: 'gmi' };
  const schemaBinding = bindGmiLayerSchema(input);
  const assets = [...new Map(photos.map((photo) => [photo.assetId || photo.id, { ...photo, id: photo.assetId || photo.id }])).values()];
  const ledger = reviewGmiPhotoSource(source, assets);
  const rows = [], targets = [];
  const sourceObjects = Object.values(source.objectsByKey).filter((object) => object.geometryScope === 'point');
  if (sourceObjects.length !== dataset.points.length) throw new Error(PHOTO_LINK_REVIEW_STALE);
  const byObject = new Map(), byAsset = new Map(), byOccurrence = new Map(), photosByAsset = new Map(), exactReferences = new Map();
  for (const photo of photos) {
    const assetId = photo.assetId || photo.id;
    if (!photosByAsset.has(assetId)) photosByAsset.set(assetId, []);
    photosByAsset.get(assetId).push(photo);
  }
  for (const reference of source.references) {
    if (!exactReferences.has(reference.referenceRaw)) exactReferences.set(reference.referenceRaw, []);
    exactReferences.get(reference.referenceRaw).push(reference.id);
  }
  for (const reference of source.references) {
    const resolution = ledger.reverseIndexes.byReferenceId[reference.id];
    const row = { ...reference, resolution, identicalRawReferenceIds: exactReferences.get(reference.referenceRaw) };
    if (!byObject.has(reference.objectKey)) byObject.set(reference.objectKey, []);
    byObject.get(reference.objectKey).push(row);
    if (resolution?.photoId) {
      if (!byAsset.has(resolution.photoId)) byAsset.set(resolution.photoId, new Set());
      byAsset.get(resolution.photoId).add(reference.objectKey);
    }
  }
  for (const photo of photos) {
    const key = photo.occurrence?.sourceFingerprint === source.fingerprint ? photo.occurrence.objectKey : null;
    if (!key) continue;
    if (!byOccurrence.has(key)) byOccurrence.set(key, []);
    byOccurrence.get(key).push(photo);
  }
  const focus = focusRefs && new Set(focusRefs.map((ref) => ref.key));
  for (const object of sourceObjects) {
    const effective = dataset.points[object.sourceIndex];
    if (!effective || effective.id !== object.parserId || (effective.guid ?? null) !== object.guid) throw new Error(PHOTO_LINK_REVIEW_STALE);
    const objectRef = createObjectRef({ ...input, geometryScope: 'point', objectIndex: object.sourceIndex });
    let tema;
    try { tema = resolveGmiTemaIdentity({ ...input, schemaBinding, objectRef }); }
    catch { tema = { state: 'UNRESOLVED_SOURCE', resolvedValue: null }; }
    const evidence = objectEvidence(source, object, effective, tema, objectRef);
    const references = byObject.get(object.objectKey) || [];
    const linked = evidence.cells.some((cell) => typeof cell.raw !== 'string' || cell.raw.trim());
    targets.push({ ...evidence, references, photoReferenceCount: references.filter((reference) => reference.targetValid).length,
      photos: byOccurrence.get(object.objectKey) || [] });
    if (!linked || (tema.state === 'RESOLVED' && !['LOK', 'TOP'].includes(evidence.tema))) continue;
    const issues = [];
    if (!evidence.tema) issues.push(issue('tema-unresolved', 'Tema er uavklart. Kontroller Tema og S_FCODE i Validator; objektet behandles ikke som en bekreftet LOK/TOP.'));
    if (object.identityIssues?.length) issues.push(issue('identity', 'Manglende eller duplisert GUID. Kildeindeks identifiserer raden; objektidentitet må avklares før flytting.'));
    if (evidence.cells.some((cell) => !cell.canonical) || evidence.cells.length !== 1) issues.push(issue('link-columns', 'Avvikende eller flere lenkekolonner. Kontroller originalkolonnene; ingen kolonne opprettes eller slås sammen.'));
    const unsupported = evidence.cells.find((cell) => !['whole-wrappers', 'empty'].includes(cell.shape));
    if (unsupported) issues.push(issue('link-shape', `Lenkefeltet kan ikke endres: ${PHOTO_LINK_SHAPE_LABELS[unsupported.shape]}.`));
    if (evidence.placement?.status !== 'viable') issues.push(issue('placement', 'Originalposisjonen kan ikke tolkes sikkert. Kontroller punktgeometri og deklarert koordinatsystem.', false));
    if (!references.length) issues.push(issue('no-references', 'Ingen lesbare bildereferanser. Kontroller lenkegrammatikken og originalfeltet.'));
    const groups = new Map();
    for (const reference of references) {
      const assetId = reference.resolution?.photoId;
      const key = assetId || reference.id;
      const occurrences = byOccurrence.get(object.objectKey) || [];
      if (!groups.has(key)) groups.set(key, { key, decisionKey: photoLinkDecisionKey(object.objectKey, key), assetId: assetId || null, references: [],
        photos: assetId ? photosByAsset.get(assetId) || []
          : reference.resolution?.status === 'ambiguous' ? reference.resolution.photoIds.flatMap((id) => photosByAsset.get(id) || []) : [],
        // The FOTO occurrence of exactly this object and asset: the unit of the existing GMI/GML/Ikke delivery decision.
        occurrencePhoto: assetId ? occurrences.find((photo) => (photo.assetId || photo.id) === assetId) || null : null,
        sharedObjectKeys: assetId ? [...(byAsset.get(assetId) || [])] : [] });
      groups.get(key).references.push(reference);
    }
    const relatedPhotos = [...new Map([...groups.values()].filter((group) => group.assetId).flatMap((group) => group.photos).map((photo) => [photo.id, photo])).values()];
    rows.push({ ...evidence, references, groups: [...groups.values()], photos: byOccurrence.get(object.objectKey) || [], relatedPhotos, issues,
      focused: !focus || focus.has(objectRef.key) });
  }
  if (focus && focusRefs.some((ref) => ref.layerId !== layerId || ref.datasetRevision !== datasetRevision || !rows.some((row) => row.objectRef.key === ref.key))) throw new Error(PHOTO_LINK_REVIEW_STALE);
  return { source, layerId, datasetRevision, rows, targets, targetsByKey: new Map(targets.map((target) => [target.objectKey, target])),
    delivery, restricted: Boolean(focus), liveSource: liveSource === true };
}

/** Exact decision identity: one source object and one reference group (a confident asset, or a single unresolved reference). */
export const photoLinkDecisionKey = (objectKey, groupKey) => JSON.stringify([objectKey, groupKey]);

function xyDistance(source, left, right) {
  const a = left.rawGeometry?.length === 1 && left.rawGeometry[0], b = right.rawGeometry?.length === 1 && right.rawGeometry[0];
  if (left.placement?.status !== 'viable' || right.placement?.status !== 'viable' || !a || !b) return null;
  if ([25832, 25833, 5972].includes(Number(source.crsContext?.epsg))) return Math.hypot(a.x - b.x, a.y - b.y);
  return photoPositionDistance(left.placement.position, right.placement.position);
}

/** Target evidence for one source case. Conflicts are recipient-specific; group conflicts belong to the decision. */
export function photoLinkReviewCandidate(model, row, target) {
  // Numeric parser coercion is not identifier equivalence: "001", "1" and "1 " stay distinct evidence.
  const sameIdentifiers = identifiers.filter((key) => typeof row.rawAttributes[key] === 'string' && row.rawAttributes[key].trim()
    && Object.hasOwn(target.rawAttributes, key) && row.rawAttributes[key] === target.rawAttributes[key]);
  const existingAssets = new Set(target.references.map((ref) => ref.resolution?.photoId).filter(Boolean));
  const reusedAssets = row.groups.filter((group) => group.assetId && existingAssets.has(group.assetId)).map((group) => group.assetId);
  const zSource = row.rawGeometry?.[0]?.z, zTarget = target.rawGeometry?.[0]?.z;
  const conflicts = [];
  if (target.placement?.status !== 'viable') conflicts.push(issue('target-placement', 'Mottakeren mangler en sikker posisjon. Kontroller geometri og deklarert koordinatsystem.'));
  if (target.identityIssues?.length) conflicts.push(issue('target-identity', 'Mottakeren har manglende eller duplisert GUID. Kontroller kildeidentiteten.'));
  if (target.cells.length !== 1 || target.cells.some((cell) => !cell.canonical)) conflicts.push(issue('target-link-column', 'Mottakeren har manglende eller avvikende lenkekolonne. Kolonner opprettes ikke.'));
  const unsupported = target.cells.find((cell) => !['whole-wrappers', 'empty'].includes(cell.shape));
  if (unsupported) conflicts.push(issue('target-link-shape', `Mottakerens lenkefelt kan ikke utvides: ${PHOTO_LINK_SHAPE_LABELS[unsupported.shape]}.`));
  if (reusedAssets.length) conflicts.push(issue('target-reuse', `Samme bilde finnes allerede på mottakeren (${reusedAssets.length} filtreff). Gjenbruk er ikke avklart.`));
  if (row.groups.some((group) => group.assetId && target.photos.some((photo) => (photo.assetId || photo.id) === group.assetId)))
    conflicts.push(issue('target-placement-same-photo', 'Mottakeren har en egen FOTO-plassering for samme bilde. Plasseringer og beslutninger slås ikke sammen.'));
  if (!target.tema) conflicts.push(issue('target-tema', 'Mottakerens Tema er uavklart. Kontroller Tema og S_FCODE i Validator.', false));
  if (target.photoReferenceCount) conflicts.push(issue('target-existing-links', `Mottakeren har ${target.photoReferenceCount} eksisterende bildereferanse(r). De beholdes uendret.`, false));
  return { target, distanceMetres: xyDistance(model.source, row, target), sameIdentifiers, reusedAssets,
    deltaZ: Number.isFinite(zSource) && Number.isFinite(zTarget) ? zTarget - zSource : null, conflicts };
}

const byDistance = (a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity) || a.target.sourceIndex - b.target.sourceIndex;
/**
 * Every other point object of the same source, by ascending XY distance from the source; ties and objects without a safe
 * distance keep source order. Nothing is filtered by Tema or radius, and nothing is selected.
 */
export function photoLinkReviewCandidates(model, row) {
  return model.targets.filter((target) => target.objectKey !== row.objectKey).map((target) => photoLinkReviewCandidate(model, row, target)).sort(byDistance);
}

export const PHOTO_LINK_OUTCOMES = Object.freeze({ KEEP: 'keep', MOVE: 'move', GML: 'gml', EXCLUDE: 'exclude' });
export const PHOTO_LINK_OUTCOME_LABELS = Object.freeze({ keep: 'Behold uendret', move: 'Flytt til punktobjekt', gml: 'Lever som GML', exclude: 'Ikke med i leveransen' });
/** Batch 1A.2 is read-only: no decision can be saved, whatever its resolution. */
export const PHOTO_LINK_REVIEW_WRITABLE = false;

export const emptyPhotoLinkReviewChoices = () => ({ decisions: {} });
/**
 * Ephemeral, pure decisions keyed by exact (source object, reference group). Selecting creates an unresolved move without a
 * recipient; a recipient only ever applies to the one decision named in the action. Deselecting removes the decision, so the
 * references stay unchanged. Even blocked decisions may record a recipient for discussion.
 */
export function reducePhotoLinkReviewChoices(state, action, model) {
  if (action.type === 'clear') return emptyPhotoLinkReviewChoices();
  const row = model.rows.find((entry) => entry.objectKey === action.objectKey);
  const group = row?.groups.find((entry) => entry.key === action.groupKey);
  if (!group) return state;
  const key = group.decisionKey, current = state.decisions[key];
  const write = (decision) => ({ ...state, decisions: decision ? { ...state.decisions, [key]: Object.freeze(decision) }
    : Object.fromEntries(Object.entries(state.decisions).filter(([entry]) => entry !== key)) });
  if (action.type === 'select') return action.selected === true ? current ? state : write({ outcome: 'move', targetKey: null })
    : current ? write(null) : state;
  if (!current) return state;
  if (action.type === 'outcome' && Object.values(PHOTO_LINK_OUTCOMES).includes(action.outcome)) {
    return current.outcome === action.outcome ? state : write({ outcome: action.outcome, targetKey: null });
  }
  if (action.type === 'target' && current.outcome === 'move' && (action.targetKey === null
    || (action.targetKey !== row.objectKey && model.targetsByKey.has(action.targetKey)))) return write({ ...current, targetKey: action.targetKey });
  return state;
}

const referenceIssue = (resolution) => resolution?.status === 'confident' ? null
  : resolution?.status === 'ambiguous' ? issue('asset-ambiguous', `Tvetydig filtreff: ${resolution.photoIds.length} importerte kopier. Avklar kopiene i FOTO.`)
    : resolution?.status === 'invalid' ? issue('asset-invalid', 'Ikke en gyldig bildereferanse. Kontroller originalfeltet og filtypen.')
      : resolution?.reason === 'unsafe-reference' ? issue('asset-unsafe', 'Ekstern adresse eller utrygg sti brukes ikke. Avklar en lokal filreferanse i originalgrunnlaget.')
        : issue('asset-missing', 'Bildefilen mangler i valgt fotolag. Legg til bildene eller velg riktig fotolag.');

/** Move-only conflicts of one reference group with accepted FOTO state; independent of any recipient. */
function groupMoveIssues(model, row, group) {
  const issues = [...new Map(group.references.map((reference) => referenceIssue(reference.resolution)).filter(Boolean).map((entry) => [entry.code, entry])).values()];
  if (!group.assetId) return issues;
  const statuses = new Set(group.photos.map((photo) => model.delivery?.byPhotoId?.[photo.id]?.status).filter(Boolean));
  if ([...statuses].some((status) => status !== 'keep-link') || statuses.size > 1) issues.push(issue('delivery-conflict', 'Bildet har et annet leveringsvalg enn GMI. Avklar GMI, GML eller Ikke før flytting.'));
  if (group.photos.some((photo) => photo.spatial?.current?.position && row.placement?.position
    && photoPositionDistance(photo.spatial.current.position, row.placement.position) > 0.01))
    issues.push(issue('accepted-position', 'Bildet har en annen akseptert plassering. Behold og avklar denne før eventuell flytting.'));
  return issues;
}

/** GML/Ikke reuse the existing FOTO delivery eligibility of exactly this object's occurrence. */
function deliveryOutcomeIssues(model, group, outcome) {
  const entry = group.occurrencePhoto ? model.delivery?.byPhotoId?.[group.occurrencePhoto.id] : null;
  if (!entry) return { entry: null, issues: [issue('delivery-unavailable', 'Bildet har ingen FOTO-plassering på dette objektet. Leveringsvalg kan ikke foreslås.')] };
  if (!entry.linked || !entry.canTransfer) return { entry, issues: [issue('delivery-unavailable', photoDeliveryOptions(entry)
    .find((option) => option.key === (outcome === 'gml' ? 'gml' : 'excluded'))?.reason || 'Leveringsvalget kan ikke endres for denne plasseringen.')] };
  return { entry, issues: [] };
}

/**
 * One row per exact decision, in source-case and group order, with blocking issues and warnings. Cross-decision conflicts
 * (the same photograph proposed twice for one recipient, a recipient whose own links also change) are evaluated together.
 */
export function photoLinkReviewDecisions(model, choices) {
  const decisions = [];
  for (const row of model.rows) for (const group of row.groups) {
    const decision = choices.decisions[group.decisionKey];
    if (!decision) continue;
    const blocking = [], warnings = [];
    let candidate = null, deliveryEntry = null;
    if (decision.outcome === 'move') {
      if (!model.liveSource) blocking.push(issue('foto-only', 'Kilden er ikke koblet til et lastet GMI-lag. Last inn originalfilen før flytting.'));
      blocking.push(...row.issues.filter((entry) => entry.blocking), ...groupMoveIssues(model, row, group));
      warnings.push(...row.issues.filter((entry) => !entry.blocking));
      const target = decision.targetKey ? model.targetsByKey.get(decision.targetKey) : null;
      if (!target) blocking.unshift(issue('recipient-missing', 'Velg en mottaker blant punktobjektene.'));
      else {
        candidate = photoLinkReviewCandidate(model, row, target);
        for (const entry of candidate.conflicts) (entry.blocking ? blocking : warnings).push(entry);
      }
    } else if (decision.outcome !== 'keep') {
      const delivery = deliveryOutcomeIssues(model, group, decision.outcome);
      deliveryEntry = delivery.entry;
      blocking.push(...delivery.issues);
    }
    decisions.push({ key: group.decisionKey, row, group, outcome: decision.outcome, target: candidate?.target || null, candidate,
      distanceMetres: candidate?.distanceMetres ?? null, referenceIds: group.references.map((reference) => reference.id),
      deliveryEntry, blocking, warnings });
  }
  const moves = decisions.filter((entry) => entry.outcome === 'move' && entry.target);
  for (const entry of decisions) {
    if (entry.outcome === 'move' && entry.target && entry.group.assetId && moves.some((other) => other !== entry
      && other.target.objectKey === entry.target.objectKey && other.group.assetId === entry.group.assetId))
      entry.blocking.push(issue('duplicate-recipient-photo', 'Samme bilde foreslås flyttet til samme mottaker fra flere referanser. Sammenslåing er ikke avklart.'));
    if (entry.outcome === 'move' && entry.target && decisions.some((other) => other.row.objectKey === entry.target.objectKey && other.outcome !== 'keep'))
      entry.warnings.push(issue('recipient-also-changes', 'Mottakeren har selv bildelenker med foreslått endring. Samlet resultat for lenkefeltet avklares ved lagring.', false));
    if (entry.group.assetId && decisions.some((other) => other !== entry && other.group.assetId === entry.group.assetId
      && (other.outcome !== entry.outcome || other.target?.objectKey !== entry.target?.objectKey)))
      entry.warnings.push(issue('shared-photo-differs', 'Samme bilde har en annen beslutning på et annet objekt. Hver forekomst behandles separat.', false));
  }
  return Object.freeze(decisions.map((entry) => Object.freeze({ ...entry, blocking: Object.freeze(entry.blocking), warnings: Object.freeze(entry.warnings),
    referenceIds: Object.freeze(entry.referenceIds), resolved: entry.blocking.length === 0 })));
}

/** Progression contract: every selected decision must be resolved; nothing is save-ready while writes are disabled. */
export function photoLinkReviewProgress(model, decisions) {
  const selected = decisions.length, resolved = decisions.filter((entry) => entry.resolved).length;
  const selectedReferenceIds = new Set(decisions.flatMap((entry) => entry.referenceIds));
  return Object.freeze({ selected, resolved, unresolved: selected - resolved,
    unchangedReferences: model.rows.flatMap((row) => row.references).filter((reference) => !selectedReferenceIds.has(reference.id)).length,
    allResolved: selected > 0 && resolved === selected, saveReady: PHOTO_LINK_REVIEW_WRITABLE && selected > 0 && resolved === selected });
}
