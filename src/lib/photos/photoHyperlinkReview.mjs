// Batch 1A: inspection only. No patch, session, position or delivery mutation API.
import { bindGmiLayerSchema } from '../validation-v2/gmiLayerSchemaBinding.js';
import { resolveGmiTemaIdentity } from '../validation-v2/temaIdentity.js';
import { createObjectRef } from '../validation-v2/objectRef.js';
import { getDatasetRevision } from '../validation-v2/datasetRevision.js';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { gmiPointPosition, reviewGmiPhotoSource } from './gmiPhotoSource.mjs';
import { immutable } from './photoSpatial.mjs';
import { photoPositionDistance } from './photoPositioning.mjs';

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
  return { ...object, attributes, rawAttributes, objectRef, temaIdentity: tema, tema: tema.state === 'RESOLVED' ? tema.resolvedValue : null,
    label: identifiers.filter((key) => attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== '')
      .map((key) => `${key}: ${Object.hasOwn(rawAttributes, key) ? rawAttributes[key] : `${attributes[key]} (tolket verdi)`}`).join(' · ') || `Punkt ${object.parserId}`,
    cells, placement: gmiPointPosition(source, object),
    zEvidence: Object.fromEntries(Object.entries(attributes).filter(([key]) => /høyde|hoyde|vertikal|dybde|dimensjon|bredde/i.test(key))) };
}

/** Linear detection. Candidate distances are derived only for the case being inspected. */
export function detectPhotoLinkReview({ source, dataset = photoLinkReviewDataset(source), layerId = source.id || 'foto-review', photos = [], delivery = null, focusRefs = null }) {
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
    if (evidence.tema === 'KUM') targets.push({ ...evidence, references, photos: byOccurrence.get(object.objectKey) || [] });
    if (!linked || (tema.state === 'RESOLVED' && !['LOK', 'TOP'].includes(evidence.tema))) continue;
    const issues = [];
    if (!evidence.tema) issues.push('Tema er uavklart. Kontroller Tema og S_FCODE i Validator; objektet behandles ikke som en bekreftet LOK/TOP.');
    if (object.identityIssues?.length) issues.push('Manglende eller duplisert GUID. Kildeindeks identifiserer raden; objektidentitet må avklares før flytting.');
    if (evidence.cells.some((cell) => !cell.canonical) || evidence.cells.length !== 1) issues.push('Avvikende eller flere lenkekolonner. Kontroller originalkolonnene; ingen kolonne opprettes eller slås sammen.');
    if (evidence.placement?.status !== 'viable') issues.push('Originalposisjonen kan ikke tolkes sikkert. Kontroller punktgeometri og deklarert koordinatsystem.');
    if (!references.length) issues.push('Ingen lesbare bildereferanser. Kontroller lenkegrammatikken og originalfeltet.');
    const groups = new Map();
    for (const reference of references) {
      const assetId = reference.resolution?.photoId;
      const key = assetId || reference.id;
      if (!groups.has(key)) groups.set(key, { key, assetId: assetId || null, references: [], photos: assetId ? photosByAsset.get(assetId) || []
        : reference.resolution?.status === 'ambiguous' ? reference.resolution.photoIds.flatMap((id) => photosByAsset.get(id) || []) : [],
        sharedObjectKeys: assetId ? [...(byAsset.get(assetId) || [])] : [] });
      groups.get(key).references.push(reference);
    }
    const relatedPhotos = [...new Map([...groups.values()].filter((group) => group.assetId).flatMap((group) => group.photos).map((photo) => [photo.id, photo])).values()];
    rows.push({ ...evidence, references, groups: [...groups.values()], photos: byOccurrence.get(object.objectKey) || [], relatedPhotos, issues,
      focused: !focus || focus.has(objectRef.key) });
  }
  if (focus && focusRefs.some((ref) => ref.layerId !== layerId || ref.datasetRevision !== datasetRevision || !rows.some((row) => row.objectRef.key === ref.key))) throw new Error(PHOTO_LINK_REVIEW_STALE);
  return { source, layerId, datasetRevision, rows, targets, delivery, restricted: Boolean(focus) };
}

function xyDistance(source, left, right) {
  const a = left.rawGeometry?.length === 1 && left.rawGeometry[0], b = right.rawGeometry?.length === 1 && right.rawGeometry[0];
  if (left.placement?.status !== 'viable' || right.placement?.status !== 'viable' || !a || !b) return null;
  if ([25832, 25833, 5972].includes(Number(source.crsContext?.epsg))) return Math.hypot(a.x - b.x, a.y - b.y);
  return photoPositionDistance(left.placement.position, right.placement.position);
}

export function photoLinkReviewCandidates(model, row) {
  return model.targets.map((target) => {
    // Numeric parser coercion is not identifier equivalence: "001", "1" and "1 " stay distinct evidence.
    const sameIdentifiers = identifiers.filter((key) => typeof row.rawAttributes[key] === 'string' && row.rawAttributes[key].trim()
      && Object.hasOwn(target.rawAttributes, key) && row.rawAttributes[key] === target.rawAttributes[key]);
    const existingAssets = new Set(target.references.map((ref) => ref.resolution?.photoId).filter(Boolean));
    const reusedAssets = row.groups.filter((group) => group.assetId && existingAssets.has(group.assetId)).map((group) => group.assetId);
    const zSource = row.rawGeometry?.[0]?.z, zTarget = target.rawGeometry?.[0]?.z;
    const conflicts = [];
    for (const group of row.groups) {
      if (!group.assetId) continue;
      const related = group.photos;
      const statuses = new Set(related.map((photo) => model.delivery?.byPhotoId?.[photo.id]?.status).filter(Boolean));
      if ([...statuses].some((status) => status !== 'keep-link') || statuses.size > 1) conflicts.push('Leveringsvalg for bildet må avklares: GMI, GML eller Ikke.');
      if (related.some((photo) => photo.spatial?.current?.position && photoPositionDistance(photo.spatial.current.position, row.placement?.position) > 0.01)) conflicts.push('Bildet har en annen akseptert plassering. Behold og avklar denne før eventuell KUM-flytting.');
      if (target.photos.some((photo) => photo.assetId === group.assetId)) conflicts.push('KUM har en egen plassering for samme bilde. Plasseringer og beslutninger slås ikke sammen.');
    }
    if (target.placement?.status !== 'viable') conflicts.push('KUM mangler en sikker posisjon. Kontroller geometri og deklarert koordinatsystem.');
    if (target.identityIssues?.length) conflicts.push('KUM har manglende eller duplisert GUID. Kontroller kildeidentiteten.');
    if (target.cells.length !== 1 || target.cells.some((cell) => !cell.canonical)) conflicts.push('KUM har manglende eller avvikende lenkekolonne. Kolonner opprettes ikke.');
    return { target, distanceMetres: xyDistance(model.source, row, target), sameIdentifiers, reusedAssets,
      deltaZ: Number.isFinite(zSource) && Number.isFinite(zTarget) ? zTarget - zSource : null, conflicts: [...new Set(conflicts)] };
  }).sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity) || a.target.sourceIndex - b.target.sourceIndex);
}

export const emptyPhotoLinkReviewChoices = () => ({ targets: {}, groups: {} });
/** Ephemeral proposal only; even blocked cases can record a target for discussion. */
export function reducePhotoLinkReviewChoices(state, action, model) {
  if (action.type === 'clear') return emptyPhotoLinkReviewChoices();
  const row = model.rows.find((entry) => entry.objectKey === action.objectKey);
  if (!row) return state;
  if (action.type === 'target' && (!action.targetKey || model.targets.some((target) => target.objectKey === action.targetKey))) {
    return { ...state, targets: { ...state.targets, [row.objectKey]: action.targetKey || null } };
  }
  if (action.type === 'group' && row.groups.some((group) => group.key === action.groupKey)) {
    return { ...state, groups: { ...state.groups, [JSON.stringify([row.objectKey, action.groupKey])]: action.selected === true } };
  }
  return state;
}

export function photoLinkReviewProposal(model, row, choices) {
  const candidate = photoLinkReviewCandidates(model, row).find((entry) => entry.target.objectKey === choices.targets[row.objectKey]) || null;
  const groups = row.groups.filter((group) => choices.groups[JSON.stringify([row.objectKey, group.key])] === true);
  return immutable({ sourceObjectKey: row.objectKey, targetObjectKey: candidate?.target.objectKey || null,
    referenceIds: groups.flatMap((group) => group.references.map((reference) => reference.id)),
    original: row.placement, current: row.relatedPhotos.map((photo) => ({ photoId: photo.id, current: photo.spatial.current })),
    proposed: candidate?.target.placement || null, distanceMetres: candidate?.distanceMetres ?? null,
    deltaZ: candidate?.deltaZ ?? null, writable: false });
}
