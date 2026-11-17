import { captureTimesAgree, completeCaptureValue, gmlCaptureEvidence, normalizeCaptureTime } from './photoCaptureMetadata.mjs';
import { isEstimatedCaptureTime } from './photoEstimatedDates.mjs';
import { matchPhotoReferences } from './photoReferenceMatching.mjs';

// M2 of the FOTO capture-time plan (20261117-135049, §6.2 and §8). A pure planner: it says what incoming GML capture
// times could do to each photo asset's accepted value, and never writes anything. Source priority is GML > EXIF >
// filename, but priority alone never replaces a value: only empty values and agreeing automatic or filename values
// that GML can make more precise are offered under an ordinary option. Everything else is a row defaulting to keep.

// Seconds and fractions rank equal because subseconds never decide agreement.
const PRECISION_RANK = Object.freeze({ date: 0, minute: 1, second: 2, fraction: 2 });
const rank = (value) => PRECISION_RANK[value.precision];
const byAsset = (a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);
const sorted = (values) => [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// The protection class of an accepted value (§4). Anything not recognised is protected like a manual value.
export function captureTimeProtectionClass(metadata = {}) {
  const accepted = metadata.captureTime;
  if (!accepted) return metadata.captureTimeCleared ? 'removed' : 'none';
  const kind = accepted.provenance?.kind;
  if (kind === 'exif') return accepted.acceptance === 'auto' ? 'exif-auto' : 'exif-chosen';
  if (kind === 'filename') return 'filename';
  if (kind === 'gml') return 'gml';
  if (kind === 'manual' && isEstimatedCaptureTime(accepted)) return 'estimated';
  return 'manual';
}

// Only these classes may change under the ordinary «Bruk … fra GML» options. All other classes need a row choice.
const OPTION_CLASSES = new Set(['none', 'exif-auto', 'filename']);

// An estimate's stored noon is a technical default, not an observation, so it is compared as its date only.
const comparable = (cls, value) => (cls === 'estimated' ? normalizeCaptureTime(value.iso.slice(0, 10)) : value);

const emptyPlan = (sourceId = null) => Object.freeze({ sourceId, fill: [], fillPartial: [], completions: [], reviewRows: [],
  conflicts: [], unchanged: [], ambiguous: [], pending: [],
  counts: Object.freeze({ assets: 0, fill: 0, fillPartial: 0, completions: 0, reviewRows: 0, conflicts: 0, unchanged: 0,
    ambiguous: 0, pending: 0, stale: 0, optionComplete: 0, optionPartial: 0 }),
  options: Object.freeze({ complete: 0, partial: 0, partialHasMinute: false }) });

/**
 * Plan GML capture-time reconciliation for one GML source.
 *
 * @param assets  Photo assets or occurrences: `{ id, assetId?, originalFilename, sourceRelativePath?, captureMetadata,
 *                spatial? }`. Occurrences of one asset are folded into one decision (`assetId || id`).
 * @param source  A parsed GML source: `{ id, filename, entries }`, entries as `terrainPhotoGml` produces them.
 * @param ledger  Optional `matchPhotoReferences` result whose `photoId`s are asset ids. When omitted it is computed
 *                over the unique assets, exactly as `attachSource` does.
 * @returns A frozen plan. Every row is keyed by `assetId` and sorted by it, so asset order never changes the result.
 */
export function planGmlCaptureTimeReconciliation(assets, source, ledger = null) {
  if (!Array.isArray(source?.entries)) return emptyPlan(source?.id ?? null);
  const owners = new Map();
  for (const photo of assets || []) {
    const assetId = photo.assetId || photo.id;
    const owner = owners.get(assetId);
    if (owner) owner.photoIds.add(photo.id);
    else owners.set(assetId, { asset: { ...photo, id: assetId }, photoIds: new Set([photo.id]) });
  }
  const uniqueAssets = sorted(owners.keys()).map((assetId) => owners.get(assetId).asset);
  const matches = (ledger || matchPhotoReferences(source.entries, uniqueAssets)).matches || [];
  const entries = new Map(source.entries.map((entry) => [entry.id, entry]));

  // Every edge naming an asset, matched or not: an asset named by an ambiguous edge, or by more than one
  // matched edge in a supplied ledger, gets no proposal at all.
  const matchedBy = new Map(), ambiguousIds = new Set();
  let stale = 0;
  for (const match of matches) {
    if (match.status === 'ambiguous') for (const id of match.photoIds || []) ambiguousIds.add(id);
    if (match.status !== 'matched') continue;
    if (!owners.has(match.photoId) || !entries.has(match.entryId)) { stale++; continue; }
    matchedBy.set(match.photoId, [...(matchedBy.get(match.photoId) || []), match]);
  }

  const plan = { fill: [], fillPartial: [], completions: [], reviewRows: [], conflicts: [], unchanged: [], ambiguous: [], pending: [] };
  for (const [assetId, owner] of owners) {
    const { asset } = owner;
    const metadata = asset.captureMetadata || {};
    const cls = captureTimeProtectionClass(metadata);
    const base = { assetId, photoIds: Object.freeze(sorted(owner.photoIds)), occurrenceCount: owner.photoIds.size,
      filename: asset.originalFilename ?? null };
    const edges = matchedBy.get(assetId) || [];
    if (ambiguousIds.has(assetId) || edges.length > 1) {
      const contested = matches.filter((edge) => edge.status === 'ambiguous' && edge.photoIds?.includes(assetId));
      const reasons = sorted(new Set(contested.map((edge) => edge.reason).filter(Boolean)));
      plan.ambiguous.push({ ...base, reason: reasons.includes('duplicate-gml-reference') || !reasons.length ? 'duplicate-gml-reference' : reasons[0],
        entryIds: Object.freeze(sorted(new Set([...edges, ...contested].map((edge) => edge.entryId)))) });
      continue;
    }
    if (!edges.length) continue;
    const entry = entries.get(edges[0].entryId);
    const evidence = gmlCaptureEvidence(source, entry)[0] || null;
    const current = metadata.captureTime ? { class: cls, value: metadata.captureTime.value ?? null,
      provenance: metadata.captureTime.provenance ?? null, acceptance: metadata.captureTime.acceptance ?? null,
      comparedAs: cls === 'estimated' ? 'date' : null } : { class: cls, value: null, provenance: null, acceptance: null, comparedAs: null };
    const incoming = evidence ? { value: evidence.value, raw: evidence.raw, evidenceId: evidence.id,
      complete: Boolean(evidence.value && completeCaptureValue(evidence.value)) } : null;
    const row = { ...base, entryId: entry.id, sourceId: source.id, sourceFilename: source.filename ?? null, current, incoming };
    const keep = (reason, rule) => plan.unchanged.push({ ...row, rule, reason, evidence: evidence || null });

    // R0: nothing usable to offer.
    if (!evidence) { keep('no-gml-capture-time', 'R0'); continue; }
    if (!evidence.value) { keep('invalid-gml-capture-time', 'R0'); continue; }
    // An EXIF read still in progress may yet supply a value to compare with, so nothing is proposed yet.
    if (cls === 'none' && asset.spatial?.exifRead?.state === 'pending') { plan.pending.push({ ...row, reason: 'pending-exif', evidence }); continue; }
    // R5: a removal is a decision and is never undone by a source.
    if (cls === 'removed') { keep('capture-time-cleared', 'R5'); continue; }

    const proposal = { ...row, evidence, proposedValue: evidence.value };
    // R1: fill an empty value. Partial values never pad missing components.
    if (cls === 'none') {
      if (incoming.complete) plan.fill.push({ ...proposal, rule: 'R1', option: 'complete' });
      else plan.fillPartial.push({ ...proposal, rule: 'R1', option: 'partial' });
      continue;
    }
    const existing = current.value ? normalizeCaptureTime(current.value.iso) : null;
    if (!existing) { keep('unreadable-current-capture-time', 'R0'); continue; }
    if (metadata.captureTime.provenance?.evidenceId === evidence.id) { keep('already-accepted', 'R2'); continue; }
    const compared = comparable(cls, existing);
    // R4: any disagreement, whatever the classes, is a visible choice that defaults to keeping the current value.
    if (!captureTimesAgree(compared, evidence.value)) {
      plan.conflicts.push({ ...proposal, rule: 'R4', reason: 'capture-time-differs', defaultDecision: 'keep' });
      continue;
    }
    // R2: agreement without a precision gain changes nothing. A known offset is not a precision gain and is never
    // carried onto a value that lacks one.
    if (rank(evidence.value) <= rank(compared)) { keep('agrees', 'R2'); continue; }
    // A partial GML value would make an export-complete estimate incomplete, so it is never offered for one (§6.2).
    if (cls === 'estimated' && !incoming.complete) { keep('agrees', 'R2'); continue; }
    // R3: GML is the highest priority and strictly more precise here.
    if (OPTION_CLASSES.has(cls)) plan.completions.push({ ...proposal, rule: 'R3', option: incoming.complete ? 'complete' : 'partial' });
    else plan.reviewRows.push({ ...proposal, rule: 'R3', reason: cls === 'estimated' ? 'can-replace-estimate' : 'can-complete', defaultDecision: 'keep' });
  }

  const freezeRow = (row) => Object.freeze({ ...row, current: row.current && Object.freeze(row.current),
    incoming: row.incoming && Object.freeze(row.incoming) });
  const lists = Object.fromEntries(Object.entries(plan).map(([key, rows]) => [key, Object.freeze(rows.sort(byAsset).map(freezeRow))]));
  const optionRows = [...lists.fill, ...lists.fillPartial, ...lists.completions];
  const complete = optionRows.filter((row) => row.option === 'complete').length;
  const partial = optionRows.filter((row) => row.option === 'partial');
  return Object.freeze({ sourceId: source.id ?? null, ...lists,
    counts: Object.freeze({ assets: owners.size, ...Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.length])),
      stale, optionComplete: complete, optionPartial: partial.length }),
    options: Object.freeze({ complete, partial: partial.length, partialHasMinute: partial.some((row) => row.proposedValue.precision === 'minute') }) });
}
