// Source-preserving S_HYPERLINK reference removal (M7).
//
// Pure library. Removes selected, confidently associated photograph
// references from `S_HYPERLINK` cells of an immutable GMI source document,
// for the future combined GMI + FOTO delivery (M9). Nothing here stages an M2
// ChangeSet, touches a FOTO session or ledger, or modifies source bytes.
//
//   planGmiHyperlinkRemoval(document, request)    -> frozen plan (no bytes)
//   applyGmiHyperlinkRemoval(plan, options)        -> verified bytes or failure
//   verifyGmiHyperlinkRemoval(document, output, plan)  independent reference proof
//
// Composition boundary (planning §5, §7; M1 report §10.2):
// - Every plan is made against the immutable ORIGINAL document, whose
//   fingerprint is the FOTO source fingerprint. Offsets and expected lexemes
//   therefore never refer to previously patched output.
// - When an M2 session is supplied, the plan records its exact effective
//   state (`stateKey`, `effectiveKey`) and checks that the verified M2
//   proposal leaves every targeted S_HYPERLINK lexeme untouched (column
//   ownership). Applying compiles that same effective state again, refuses a
//   different one (stale), and runs ONE M1 `editGmiFields` call with the M2
//   field edits plus the S_HYPERLINK edits: one plan -> splice -> independent
//   verification against the original. Previously patched output is never
//   patched again.
// - Ordinary field editing still cannot alter S_HYPERLINK (M2 guard is not
//   relaxed); only this module produces S_HYPERLINK edits.
//
// Eligibility (all must hold, otherwise the whole plan is blocked):
// - the selection is exactly one FOTO occurrence identity
//   (sourceFingerprint, objectKey, assetId) of a CONFIDENT ledger edge, and
//   its referenceIds equal that edge's referenceIds (the ledger's grouping);
// - every reference is a `link` member with a valid image target;
// - the supplied FOTO evidence (object and reference) equals evidence derived
//   afresh from the exact document bytes (createGmiPhotoSource);
// - the cell is physically present, editable, identity-guarded, and its
//   current lexeme re-extracts to the recorded wrapper/member/span evidence;
// - wrapper removals are whole-wrapper with exactly one link; a bare value is
//   one unambiguous path; separators are whitespace only;
// - the resulting lexeme is encodable under the M1 policy.
// Filenames are never matched across the GMI: references are addressed by
// object and occurrence identity only.
//
// Ordinal policy (planning Q3): 'renumber' (default) rewrites only the digits
// of retained `h:N` wrappers to a contiguous 1..n; 'preserve' keeps them.
// Gemini VA acceptance of either form is gate G4 and is NOT established here.
import { extractHyperlinkOccurrences } from '../hyperlinkFilenames.mjs';
import { createGmiPhotoSource } from '../photos/gmiPhotoSource.mjs';
import { validateGmiFieldLexeme } from './encoding.mjs';
import { editGmiFields } from './patch.mjs';
import { getGmiProposedState } from './proposed.mjs';
import { compileGmiEffectiveEdits, isGmiEditSession } from './session.mjs';
import { getGmiSourceBytes, gmiObjectLexemes, gmiSourceIntact, isGmiSourceDocument } from './sourceDocument.mjs';
import { gmiCellKey, resolveGmiCell } from './targets.mjs';

export const GMI_HYPERLINK_FIELD = 'S_HYPERLINK';

export const GMI_HYPERLINK_ORDINAL_POLICIES = Object.freeze({
  RENUMBER: 'renumber',
  PRESERVE: 'preserve',
});

export const GMI_HYPERLINK_REMOVAL_STATUS = Object.freeze({
  READY: 'ready',
  EMPTY: 'empty',
  BLOCKED: 'blocked',
});

const plans = new WeakMap();      // plan -> { document }
const SCOPE_ORDER = { point: 0, line: 1 };
const REFERENCE_EVIDENCE_FIELDS = ['objectKey', 'key', 'referenceRaw', 'rawMember', 'rawWrapper', 'wrapperOrdinal',
  'wrapperNumber', 'memberOrdinal', 'rawStart', 'rawEnd', 'wrapperStart', 'wrapperEnd', 'filename', 'targetValid'];
const OBJECT_EVIDENCE_FIELDS = ['geometryScope', 'sourceIndex', 'parserId', 'guid', 'hyperlinkRaw'];

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values) => [...new Set(values)].sort(compareStrings);
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const isString = (value) => typeof value === 'string' && value.length > 0;

/** The FOTO occurrence identity (photoSession.planGmiAssociations `occurrence.key`). */
export const gmiHyperlinkSelectionKey = ({ sourceFingerprint, objectKey, assetId }) =>
  JSON.stringify([sourceFingerprint, objectKey, assetId]);

function compareBlockers(a, b) {
  return compareStrings(a.selectionKey ?? '', b.selectionKey ?? '') || compareStrings(a.code, b.code)
    || compareStrings(a.referenceId ?? '', b.referenceId ?? '') || compareStrings(a.detail ?? '', b.detail ?? '');
}

// One bare (unwrapped) single path. Anything that looks like a list, a wrapper
// fragment or several paths is not treated as bare.
function bareSinglePath(referenceRaw) {
  if (!referenceRaw || referenceRaw !== referenceRaw.trim()) return false;
  if (/["()]/.test(referenceRaw) || /[,;]/.test(referenceRaw) || /^h\s*:/i.test(referenceRaw)) return false;
  if (/\.[a-z\d]{1,5}\s+\S/i.test(referenceRaw)) return false;     // "a.jpg b.jpg"
  if (/\s[a-z]:[\\/]/i.test(referenceRaw)) return false;            // second drive path
  return true;
}

// Wrapper geometry within one lexeme, from the extractor's own members.
function wrapperLayout(lexeme, record) {
  const byOrdinal = new Map();
  for (const member of record.members) {
    if (member.wrapperOrdinal === null) continue;
    let wrapper = byOrdinal.get(member.wrapperOrdinal);
    if (!wrapper) {
      wrapper = { ordinal: member.wrapperOrdinal, start: member.wrapperStart, end: member.wrapperEnd,
        raw: member.rawWrapper, number: member.wrapperNumber, links: [] };
      byOrdinal.set(member.wrapperOrdinal, wrapper);
    }
    if (member.key === 'link') wrapper.links.push(member);
  }
  const wrappers = [...byOrdinal.values()].sort((a, b) => a.ordinal - b.ordinal);
  wrappers.forEach((wrapper, index) => {
    wrapper.separatorEnd = index + 1 < wrappers.length ? wrappers[index + 1].start : lexeme.length;
    wrapper.separator = lexeme.slice(wrapper.end, wrapper.separatorEnd);
    wrapper.digits = /^h:(\d+)\(/i.exec(wrapper.raw)?.[1] ?? null;
  });
  return wrappers;
}

const memberView = (member) => ({
  key: member.key, referenceRaw: member.referenceRaw, rawMember: member.rawMember,
  metadata: member.metadata.map((entry) => entry.raw),
});

function renumberWrapper(raw, number) {
  const match = /^(h:)(\d+)(\()/i.exec(raw);
  return match[1] + String(number) + raw.slice(match[1].length + match[2].length);
}

/**
 * Build the new lexeme for one cell. `removeOrdinals` are wrapper ordinals
 * (or `null` for a bare value). Returns { ok, lexeme, ordinalChanges, ... }.
 */
function composeCellLexeme(lexeme, record, removeOrdinals, ordinalPolicy) {
  if (removeOrdinals.has(null)) return { ok: true, lexeme: '', ordinalChanges: [], removedWrappers: 0, retainedWrappers: 0, retained: [] };
  const wrappers = wrapperLayout(lexeme, record);
  if (wrappers.some((wrapper) => !/^\s*$/.test(wrapper.separator))) return { ok: false, code: 'unsupported-wrapper-separator' };
  if (wrappers.some((wrapper) => wrapper.digits === null)) return { ok: false, code: 'unsupported-wrapper-ordinal' };
  const retained = wrappers.filter((wrapper) => !removeOrdinals.has(wrapper.ordinal));
  const ordinalChanges = [];
  if (!retained.length) return { ok: true, lexeme: '', ordinalChanges, removedWrappers: wrappers.length, retainedWrappers: 0, retained, wrappers };
  let out = lexeme.slice(0, wrappers[0].start);
  let next = 0;
  for (const wrapper of wrappers) {
    if (removeOrdinals.has(wrapper.ordinal)) continue;     // wrapper + its following whitespace
    next++;
    let text = wrapper.raw;
    if (ordinalPolicy === GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER && Number(wrapper.digits) !== next) {
      text = renumberWrapper(wrapper.raw, next);
      ordinalChanges.push({ wrapperOrdinal: wrapper.ordinal, from: wrapper.digits, to: String(next) });
    }
    wrapper.plannedNumber = ordinalPolicy === GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER ? next : wrapper.number;
    wrapper.plannedRaw = text;
    out += text + wrapper.separator;
  }
  return { ok: true, lexeme: out, ordinalChanges, removedWrappers: wrappers.length - retained.length, retainedWrappers: retained.length, retained, wrappers };
}

// Lexeme-level self-check: retained members (raw member text, sign and other
// metadata) unchanged and in order; wrappers equal except the planned digits.
function selfCheckCellLexeme(record, composed, removeOrdinals) {
  if (composed.lexeme === '') return true;
  const now = extractHyperlinkOccurrences(composed.lexeme);
  if (now.sources.length !== 1 || !now.sources[0].validGrammar) return false;
  const kept = record.members.filter((member) => !removeOrdinals.has(member.wrapperOrdinal));
  const after = now.sources[0].members;
  if (kept.length !== after.length) return false;
  const planned = new Map(composed.retained.map((wrapper) => [wrapper.ordinal, wrapper]));
  return kept.every((member, index) => {
    const next = after[index];
    const wrapper = planned.get(member.wrapperOrdinal);
    return JSON.stringify(memberView(member)) === JSON.stringify(memberView(next))
      && next.rawWrapper === wrapper.plannedRaw && next.wrapperNumber === wrapper.plannedNumber
      && renumberWrapper(next.rawWrapper, wrapper.number) === renumberWrapper(member.rawWrapper, wrapper.number);
  });
}

function normalizeSelection(input, index) {
  if (!input || typeof input !== 'object') return { index, invalid: 'invalid-selection' };
  const { sourceFingerprint, objectKey, assetId, sourceId = null } = input;
  const occurrenceKey = input.occurrenceKey ?? input.key ?? null;
  const referenceIds = Array.isArray(input.referenceIds) ? [...input.referenceIds] : null;
  if (!isString(sourceFingerprint) || !isString(objectKey) || !isString(assetId)) return { index, invalid: 'invalid-selection' };
  if (!referenceIds || !referenceIds.length || referenceIds.some((id) => !isString(id))) return { index, invalid: 'invalid-selection-references' };
  const unique = sortedUnique(referenceIds);
  const selectionKey = gmiHyperlinkSelectionKey({ sourceFingerprint, objectKey, assetId });
  return { index, selectionKey, occurrenceKey, sourceFingerprint, objectKey, assetId, sourceId,
    referenceIds: unique, duplicateReferenceIds: unique.length !== referenceIds.length };
}

// The FOTO session prefixes reference ids with `${source.id}:`; the evidence
// factory does not. Map a supplied id to the factory id.
function referenceIdPrefix(photoSource) {
  const prefix = photoSource.id == null ? '' : `${photoSource.id}:`;
  if (prefix && photoSource.references.length && photoSource.references.every((reference) => reference.id.startsWith(prefix))) return prefix;
  return '';
}

function blockedPlan(document, base, blockers) {
  return finalizePlan(document, { ...base, status: GMI_HYPERLINK_REMOVAL_STATUS.BLOCKED, cells: [], edits: [], blockers });
}

function finalizePlan(document, plan) {
  const blockers = [...plan.blockers].sort(compareBlockers);
  const cells = plan.cells;
  const counts = {
    selections: plan.selections.length,
    cells: cells.length,
    removedReferences: cells.reduce((sum, cell) => sum + cell.removedReferences.length, 0),
    retainedReferencesInCells: cells.reduce((sum, cell) => sum + cell.retainedReferences.length, 0),
    removedWrappers: cells.reduce((sum, cell) => sum + cell.removedWrappers, 0),
    retainedWrappersInCells: cells.reduce((sum, cell) => sum + cell.retainedWrappers, 0),
    clearedCells: cells.filter((cell) => cell.proposed === '').length,
    ordinalChanges: cells.reduce((sum, cell) => sum + cell.ordinalChanges.length, 0),
    blockers: blockers.length,
    warnings: plan.warnings.length,
  };
  const planKey = JSON.stringify([plan.basis.documentFingerprint, plan.basis.session?.effectiveKey ?? null, plan.ordinalPolicy,
    plan.selections.map((selection) => [selection.selectionKey, selection.referenceIds]),
    plan.edits.map((edit) => [edit.target.scope, edit.target.sourceIndex, edit.expected, edit.lexeme]), plan.status]);
  const frozen = deepFreeze({
    kind: 'gmi-hyperlink-removal-plan',
    ok: plan.status !== GMI_HYPERLINK_REMOVAL_STATUS.BLOCKED,
    status: plan.status,
    ordinalPolicy: plan.ordinalPolicy,
    basis: plan.basis,
    selections: plan.selections,
    cells,
    edits: plan.edits,
    counts,
    warnings: plan.warnings,
    blockers,
    planKey,
  });
  plans.set(frozen, { document });
  return frozen;
}

export const isGmiHyperlinkRemovalPlan = (value) => plans.has(value);

/**
 * Plan the removal of selected photograph references from S_HYPERLINK.
 *
 * @param {object} document the immutable ORIGINAL GmiSourceDocument, with a
 *   fingerprint (loadGmiSourceDocument) equal to the FOTO source fingerprint
 * @param {object} request
 * @param {object} request.photoSource the FOTO GMI source (createGmiPhotoSource
 *   evidence as stored by the photo session: id, fingerprint, objectsByKey,
 *   references, associationLedger)
 * @param {object} [request.associationLedger] defaults to photoSource.associationLedger
 * @param {Array<object>} request.selections FOTO occurrences selected for
 *   transfer: { sourceFingerprint, objectKey, assetId, referenceIds,
 *   occurrenceKey?|key?, sourceId? } (an M8 occurrence object qualifies)
 * @param {'renumber'|'preserve'} [request.ordinalPolicy='renumber']
 * @param {object} [request.session] the M2 edit session whose effective field
 *   edits the revised document will also carry
 * @param {Iterable<string>} [request.acceptedAssetIds] when given, every
 *   selected asset must be in it
 * @returns frozen plan; `status` 'ready' | 'empty' | 'blocked'. A blocked plan
 *   has no cells and no edits.
 */
export function planGmiHyperlinkRemoval(document, request = {}) {
  if (!isGmiSourceDocument(document)) throw new TypeError('planGmiHyperlinkRemoval expects a GmiSourceDocument');
  const {
    photoSource, selections, session = null, acceptedAssetIds = null,
    ordinalPolicy = GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER,
  } = request || {};
  const associationLedger = request?.associationLedger ?? photoSource?.associationLedger ?? null;
  const base = {
    ordinalPolicy,
    basis: {
      documentFingerprint: document.fingerprint ?? null,
      documentSize: document.size,
      photoSourceId: photoSource?.id ?? null,
      photoSourceFingerprint: photoSource?.fingerprint ?? null,
      session: null,
    },
    selections: [],
    warnings: [],
  };
  const global = [];
  if (!Object.values(GMI_HYPERLINK_ORDINAL_POLICIES).includes(ordinalPolicy)) global.push({ code: 'invalid-ordinal-policy' });
  if (!Array.isArray(selections)) global.push({ code: 'invalid-selections' });
  if (!document.editable) global.push({ code: 'document-not-editable', detail: document.status });
  if (!isString(document.fingerprint)) global.push({ code: 'document-fingerprint-unavailable' });
  if (!gmiSourceIntact(document)) global.push({ code: 'source-bytes-mutated' });
  if (!photoSource || photoSource.kind !== 'gmi' || !photoSource.objectsByKey || !Array.isArray(photoSource.references)) global.push({ code: 'invalid-photo-source' });
  else {
    if (photoSource.fingerprint !== document.fingerprint) global.push({ code: 'photo-source-fingerprint-mismatch' });
    if (photoSource.loadedBinding && photoSource.loadedBinding.live === false) global.push({ code: 'photo-source-not-live' });
  }
  if (!associationLedger?.associationsById || !associationLedger?.reverseIndexes?.byReferenceId) global.push({ code: 'invalid-association-ledger' });
  let accepted = null;
  if (acceptedAssetIds !== null) {
    try { accepted = new Set(acceptedAssetIds); } catch { global.push({ code: 'invalid-accepted-assets' }); }
  }
  if (session !== null && (!isGmiEditSession(session) || session.document !== document)) global.push({ code: 'session-document-mismatch' });
  if (global.length) return blockedPlan(document, base, global);

  // Session basis: the exact M2 effective state this plan composes with.
  let proposed = null;
  if (session) {
    const compiled = compileGmiEffectiveEdits(session);
    if (!compiled.ok) return blockedPlan(document, base, [{ code: 'session-not-compilable', detail: compiled.code }]);
    proposed = getGmiProposedState(session);
    if (!proposed.ok) return blockedPlan(document, base, [{ code: 'session-proposal-failed', detail: proposed.stage }]);
    base.basis.session = { stateKey: session.stateKey, effectiveKey: compiled.effectiveKey, fieldEditCount: compiled.edits.length };
  }

  // Fresh evidence from the exact document bytes: the supplied FOTO evidence
  // must agree with it, so a stale or contradictory ledger cannot steer us.
  const fresh = createGmiPhotoSource(document.parser, document.fingerprint);
  if (fresh.references.length !== photoSource.references.length
    || Object.keys(fresh.objectsByKey).length !== Object.keys(photoSource.objectsByKey).length) {
    return blockedPlan(document, base, [{ code: 'photo-source-evidence-mismatch' }]);
  }
  const prefix = referenceIdPrefix(photoSource);
  const freshById = new Map(fresh.references.map((reference) => [reference.id, reference]));
  const suppliedById = new Map(photoSource.references.map((reference) => [reference.id, reference]));
  const { associationsById, reverseIndexes } = associationLedger;

  const normalized = selections.map(normalizeSelection);
  const blockers = [];
  const valid = [];
  for (const selection of normalized) {
    if (selection.invalid) { blockers.push({ code: selection.invalid, detail: String(selection.index) }); continue; }
    valid.push(selection);
  }
  valid.sort((a, b) => compareStrings(a.selectionKey, b.selectionKey));
  const seenKeys = new Set(), claimedReferences = new Map();
  const eligible = [];
  for (const selection of valid) {
    const block = (code, detail = {}) => blockers.push({ code, selectionKey: selection.selectionKey, ...detail });
    const before = blockers.length;
    if (seenKeys.has(selection.selectionKey)) { block('duplicate-selection'); continue; }
    seenKeys.add(selection.selectionKey);
    if (selection.duplicateReferenceIds) block('duplicate-selection-reference');
    if (selection.occurrenceKey !== null && selection.occurrenceKey !== selection.selectionKey) block('occurrence-key-mismatch');
    if (selection.sourceFingerprint !== document.fingerprint) block('stale-source-fingerprint');
    if (selection.sourceId !== null && selection.sourceId !== photoSource.id) block('photo-source-mismatch');
    if (accepted && !accepted.has(selection.assetId)) block('asset-not-accepted');
    const edgeId = JSON.stringify([photoSource.id, selection.objectKey, selection.assetId]);
    const edge = Object.hasOwn(associationsById, edgeId) ? associationsById[edgeId] : null;
    if (!edge) block('association-not-confident');
    else if (!sameList(sortedUnique(edge.referenceIds), selection.referenceIds)) block('reference-set-mismatch');
    const suppliedObject = photoSource.objectsByKey[selection.objectKey];
    const freshObject = fresh.objectsByKey[selection.objectKey];
    if (!suppliedObject || !freshObject) block('object-not-found');
    else {
      for (const field of OBJECT_EVIDENCE_FIELDS) {
        if (!Object.is(suppliedObject[field] ?? null, freshObject[field] ?? null)) { block('object-evidence-mismatch', { detail: field }); break; }
      }
    }
    for (const referenceId of selection.referenceIds) {
      const blockRef = (code, detail) => block(code, { referenceId, ...(detail ? { detail } : {}) });
      if (claimedReferences.has(referenceId)) { blockRef('reference-claimed-twice'); continue; }
      claimedReferences.set(referenceId, selection.selectionKey);
      const resolution = Object.hasOwn(reverseIndexes.byReferenceId, referenceId) ? reverseIndexes.byReferenceId[referenceId] : null;
      if (!resolution || resolution.status !== 'confident') { blockRef('reference-not-confident', resolution?.status ?? 'missing'); continue; }
      if (resolution.photoId !== selection.assetId) { blockRef('reference-asset-mismatch'); continue; }
      if (resolution.objectKey !== selection.objectKey) { blockRef('reference-object-mismatch'); continue; }
      const supplied = suppliedById.get(referenceId);
      if (!supplied) { blockRef('reference-unknown'); continue; }
      if (!referenceId.startsWith(prefix)) { blockRef('reference-unknown'); continue; }
      const freshReference = freshById.get(referenceId.slice(prefix.length));
      if (!freshReference) { blockRef('reference-evidence-mismatch', 'id'); continue; }
      const mismatch = REFERENCE_EVIDENCE_FIELDS.find((field) => !Object.is(supplied[field] ?? null, freshReference[field] ?? null));
      if (mismatch) { blockRef('reference-evidence-mismatch', mismatch); continue; }
      if (freshReference.objectKey !== selection.objectKey) { blockRef('reference-object-mismatch'); continue; }
      if (freshReference.key !== 'link') { blockRef('reference-not-link'); continue; }
      if (!freshReference.targetValid) {
        blockRef(freshReference.diagnostics.includes('non-image-target') ? 'reference-not-image'
          : freshReference.diagnostics.includes('directory-target') ? 'reference-directory-only' : 'reference-target-invalid');
      }
    }
    if (blockers.length === before) eligible.push(selection);
  }
  base.selections = valid.map((selection) => ({
    selectionKey: selection.selectionKey, sourceFingerprint: selection.sourceFingerprint,
    objectKey: selection.objectKey, assetId: selection.assetId, referenceIds: selection.referenceIds,
  }));

  // Group by cell (object) and compose each new lexeme.
  const byObject = new Map();
  for (const selection of eligible) {
    if (!byObject.has(selection.objectKey)) byObject.set(selection.objectKey, []);
    byObject.get(selection.objectKey).push(selection);
  }
  const cells = [];
  for (const [objectKey, group] of byObject) {
    const object = fresh.objectsByKey[objectKey];
    const blockCell = (code, detail = {}) => { for (const selection of group) blockers.push({ code, selectionKey: selection.selectionKey, ...detail }); };
    const resolved = resolveGmiCell(document, { scope: object.geometryScope, sourceIndex: object.sourceIndex,
      field: GMI_HYPERLINK_FIELD, objectId: object.parserId, guid: object.guid });
    if (!resolved.ok) { blockCell('hyperlink-cell-not-editable', { detail: resolved.code }); continue; }
    const { cell } = resolved;
    if (cell.lexeme !== object.hyperlinkRaw) { blockCell('hyperlink-lexeme-mismatch'); continue; }
    if (proposed && gmiObjectLexemes(proposed.document, cell.scope, cell.sourceIndex)?.[GMI_HYPERLINK_FIELD] !== cell.lexeme) {
      blockCell('hyperlink-changed-by-field-edits'); continue;
    }
    // Re-run the production extractor on the current source lexeme.
    const extracted = extractHyperlinkOccurrences(cell.lexeme);
    const record = extracted.sources[0];
    if (extracted.sources.length !== 1 || !record || !record.validGrammar) { blockCell('invalid-hyperlink-grammar'); continue; }
    const links = extracted.occurrences;
    const removeOrdinals = new Set();
    const removed = [];
    const selectedLinks = new Set();
    let cellBlocked = false;
    for (const selection of group) {
      for (const referenceId of selection.referenceIds) {
        const evidence = freshById.get(referenceId.slice(prefix.length));
        const fail = (code) => { blockers.push({ code, selectionKey: selection.selectionKey, referenceId }); cellBlocked = true; };
        const current = links.find((link) => link.wrapperOrdinal === evidence.wrapperOrdinal && link.memberOrdinal === evidence.memberOrdinal);
        if (!current) { fail('reference-not-in-current-lexeme'); continue; }
        if (current.rawWrapper !== evidence.rawWrapper) { fail('raw-wrapper-mismatch'); continue; }
        if (current.referenceRaw !== evidence.referenceRaw || current.rawMember !== evidence.rawMember) { fail('reference-raw-mismatch'); continue; }
        if (current.rawStart !== evidence.rawStart || current.rawEnd !== evidence.rawEnd
          || current.wrapperStart !== evidence.wrapperStart || current.wrapperEnd !== evidence.wrapperEnd
          || cell.lexeme.slice(current.rawStart, current.rawEnd) !== current.rawMember) { fail('reference-span-mismatch'); continue; }
        if (current.wrapperOrdinal === null) {
          if (links.length !== 1 || record.members.length !== 1 || !bareSinglePath(current.referenceRaw)) { fail('bare-value-not-single-path'); continue; }
        } else {
          if (cell.lexeme.slice(current.wrapperStart, current.wrapperEnd) !== current.rawWrapper) { fail('reference-span-mismatch'); continue; }
          const wrapperLinks = links.filter((link) => link.wrapperOrdinal === current.wrapperOrdinal);
          if (wrapperLinks.length !== 1) { fail('multi-link-wrapper'); continue; }
          if (cell.lexeme.indexOf(current.rawWrapper) !== cell.lexeme.lastIndexOf(current.rawWrapper)) {
            // Identical wrapper text twice in one value is fine only because
            // spans are positional; record it for the report.
            base.warnings.push({ code: 'identical-wrapper-text-in-value', objectKey, selectionKey: selection.selectionKey });
          }
        }
        selectedLinks.add(current);
        removeOrdinals.add(current.wrapperOrdinal);
        removed.push({ selection, evidence, current, referenceId });
      }
    }
    if (cellBlocked) continue;
    // Duplicate ownership: an unselected link in the same value with the same
    // target name must be confidently owned by a different asset.
    const selectedNames = new Set([...selectedLinks].map((link) => link.normalizedKey).filter(Boolean));
    let ambiguous = false;
    for (const link of links) {
      if (selectedLinks.has(link) || !link.normalizedKey || !selectedNames.has(link.normalizedKey)) continue;
      const otherId = `${prefix}${objectKey}:${GMI_HYPERLINK_FIELD}:${link.sourceIndex}:${link.wrapperOrdinal}:${link.memberOrdinal}`;
      const resolution = reverseIndexes.byReferenceId[otherId];
      const owners = group.map((selection) => selection.assetId);
      if (!(resolution?.status === 'confident' && !owners.includes(resolution.photoId))) { ambiguous = true; break; }
    }
    if (ambiguous) { blockCell('ambiguous-duplicate-reference'); continue; }
    const composed = composeCellLexeme(cell.lexeme, record, removeOrdinals, ordinalPolicy);
    if (!composed.ok) { blockCell(composed.code); continue; }
    if (!selfCheckCellLexeme(record, composed, removeOrdinals)) { blockCell('removal-self-check-failed'); continue; }
    const encoded = validateGmiFieldLexeme(composed.lexeme, document.encoding.encodingClass);
    if (!encoded.ok) { blockCell('retained-lexeme-not-encodable', { detail: encoded.code }); continue; }
    const numbers = composed.wrappers ? composed.wrappers.map((wrapper) => wrapper.number) : [];
    if (numbers.length && !numbers.every((number, index) => number === index + 1)) base.warnings.push({ code: 'original-ordinals-not-contiguous', objectKey });
    const retainedReferences = links.filter((link) => !selectedLinks.has(link)).map((link) => ({
      referenceId: `${prefix}${objectKey}:${GMI_HYPERLINK_FIELD}:${link.sourceIndex}:${link.wrapperOrdinal}:${link.memberOrdinal}`,
      wrapperOrdinal: link.wrapperOrdinal, referenceRaw: link.referenceRaw, filename: link.filename,
    }));
    removed.sort((a, b) => (a.current.wrapperOrdinal ?? -1) - (b.current.wrapperOrdinal ?? -1) || a.current.memberOrdinal - b.current.memberOrdinal);
    cells.push({
      key: cell.key, scope: cell.scope, sourceIndex: cell.sourceIndex, objectId: cell.objectId, guid: cell.guid, objectKey,
      field: GMI_HYPERLINK_FIELD, start: cell.start, end: cell.end,
      original: cell.lexeme, proposed: composed.lexeme,
      removedReferences: removed.map(({ selection, evidence, referenceId }) => ({
        referenceId, selectionKey: selection.selectionKey, assetId: selection.assetId,
        wrapperOrdinal: evidence.wrapperOrdinal, wrapperNumber: evidence.wrapperNumber, memberOrdinal: evidence.memberOrdinal,
        referenceRaw: evidence.referenceRaw, rawWrapper: evidence.rawWrapper, rawMember: evidence.rawMember,
        filename: evidence.filename, bare: evidence.wrapperOrdinal === null,
      })),
      retainedReferences,
      removedWrappers: composed.removedWrappers,
      retainedWrappers: composed.retainedWrappers,
      ordinalChanges: composed.ordinalChanges,
    });
  }

  if (blockers.length) return blockedPlan(document, base, blockers);

  cells.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.sourceIndex - b.sourceIndex);
  // Shared photographs: links to the same asset from unselected objects stay.
  const selectedKeys = new Set(eligible.map((selection) => JSON.stringify([photoSource.id, selection.objectKey, selection.assetId])));
  for (const assetId of sortedUnique(eligible.map((selection) => selection.assetId))) {
    const others = (reverseIndexes.byPhotoId?.[assetId] || []).filter((id) => !selectedKeys.has(id));
    if (others.length) {
      base.warnings.push({ code: 'photo-linked-elsewhere', assetId,
        retainedObjectKeys: sortedUnique(others.map((id) => associationsById[id].objectKey)) });
    }
  }
  if (cells.length) base.warnings.push({ code: 'gemini-g4-unverified', ordinalPolicy });
  base.warnings.sort((a, b) => compareStrings(a.code, b.code) || compareStrings(a.objectKey ?? a.assetId ?? '', b.objectKey ?? b.assetId ?? ''));
  const edits = cells.map((cell) => ({
    target: { scope: cell.scope, sourceIndex: cell.sourceIndex, field: GMI_HYPERLINK_FIELD, objectId: cell.objectId, guid: cell.guid },
    expected: cell.original,
    lexeme: cell.proposed,
  }));
  return finalizePlan(document, { ...base, status: cells.length ? GMI_HYPERLINK_REMOVAL_STATUS.READY : GMI_HYPERLINK_REMOVAL_STATUS.EMPTY,
    cells, edits, blockers: [] });
}

/**
 * Independent reference-level proof for a removal (planning §4.1 step 5,
 * T9/T14). Derives FOTO evidence afresh from the original document and from
 * the output document and requires, per object:
 * - the same object keys, scopes and source indexes;
 * - output references = original references minus exactly the planned
 *   removed references, in order, with raw member text and metadata equal;
 * - retained wrappers equal except, in affected cells under 'renumber', the
 *   ordinal digits, which must then be contiguous 1..n;
 * - untouched cells: S_HYPERLINK lexeme identical.
 * Works from the plan's selections, not from its proposed lexemes.
 */
export function verifyGmiHyperlinkRemoval(document, outputDocument, plan) {
  const failures = [];
  const fail = (code, detail = {}) => failures.push({ code, ...detail });
  if (!isGmiHyperlinkRemovalPlan(plan) || plans.get(plan).document !== document) return Object.freeze({ ok: false, failures: Object.freeze([{ code: 'not-a-plan-for-document' }]) });
  if (!isGmiSourceDocument(outputDocument)) return Object.freeze({ ok: false, failures: Object.freeze([{ code: 'invalid-output-document' }]) });
  const before = createGmiPhotoSource(document.parser, document.fingerprint);
  const after = createGmiPhotoSource(outputDocument.parser, null);
  const keysBefore = Object.keys(before.objectsByKey).sort(compareStrings);
  const keysAfter = Object.keys(after.objectsByKey).sort(compareStrings);
  if (!sameList(keysBefore, keysAfter)) fail('object-keys-changed');
  const prefix = plan.basis.photoSourceId == null ? '' : `${plan.basis.photoSourceId}:`;
  const removedIds = new Set(plan.selections.flatMap((selection) => selection.referenceIds)
    .map((id) => (prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id)));
  const affected = new Set(plan.cells.map((cell) => cell.objectKey));
  const group = (source) => {
    const map = new Map();
    for (const reference of source.references) {
      if (!map.has(reference.objectKey)) map.set(reference.objectKey, []);
      map.get(reference.objectKey).push(reference);
    }
    return map;
  };
  const refsBefore = group(before), refsAfter = group(after);
  let removedCount = 0, retainedCount = 0;
  for (const objectKey of keysBefore) {
    const was = before.objectsByKey[objectKey], now = after.objectsByKey[objectKey];
    if (!now) continue;
    if (was.geometryScope !== now.geometryScope || was.sourceIndex !== now.sourceIndex || was.parserId !== now.parserId || was.guid !== now.guid) {
      fail('object-identity-changed', { objectKey }); continue;
    }
    const original = refsBefore.get(objectKey) || [], revised = refsAfter.get(objectKey) || [];
    const expected = original.filter((reference) => !removedIds.has(reference.id));
    removedCount += original.length - expected.length;
    if (!affected.has(objectKey)) {
      if (original.length !== expected.length) fail('reference-removed-outside-plan', { objectKey });
      if (was.hyperlinkRaw !== now.hyperlinkRaw) fail('unaffected-hyperlink-changed', { objectKey });
      retainedCount += revised.length;
      continue;
    }
    if (expected.length !== revised.length) { fail('retained-reference-count-mismatch', { objectKey }); continue; }
    expected.forEach((reference, index) => {
      const next = revised[index];
      if (JSON.stringify(memberView(reference)) !== JSON.stringify(memberView(next))) fail('retained-reference-changed', { objectKey });
      if (reference.targetValid !== next.targetValid || reference.filename !== next.filename) fail('retained-reference-changed', { objectKey });
      if (reference.wrapperOrdinal === null) { if (next.wrapperOrdinal !== null) fail('retained-reference-changed', { objectKey }); return; }
      if (next.wrapperOrdinal === null) { fail('retained-reference-changed', { objectKey }); return; }
      const digitsFree = (raw) => raw.replace(/^(h:)\d+\(/i, '$1#(');
      if (digitsFree(reference.rawWrapper) !== digitsFree(next.rawWrapper)) fail('retained-wrapper-changed', { objectKey });
      if (plan.ordinalPolicy === GMI_HYPERLINK_ORDINAL_POLICIES.PRESERVE && reference.rawWrapper !== next.rawWrapper) fail('ordinal-changed-under-preserve', { objectKey });
    });
    // Ordinals over every output wrapper (including any without a link).
    if (plan.ordinalPolicy === GMI_HYPERLINK_ORDINAL_POLICIES.RENUMBER && now.hyperlinkRaw !== '') {
      const members = extractHyperlinkOccurrences(now.hyperlinkRaw).sources[0]?.members || [];
      const numbers = [...new Map(members.filter((member) => member.wrapperOrdinal !== null)
        .map((member) => [member.wrapperOrdinal, member.wrapperNumber])).values()];
      if (!numbers.every((number, index) => number === index + 1)) fail('ordinals-not-contiguous', { objectKey });
    }
    const removedHere = original.length - expected.length;
    if (!removedHere) fail('affected-cell-without-removal', { objectKey });
    if (!revised.length && now.hyperlinkRaw !== '') fail('cleared-cell-not-empty', { objectKey });
    retainedCount += revised.length;
  }
  if (removedCount !== removedIds.size) fail('removed-reference-count-mismatch');
  if (after.references.length !== before.references.length - removedIds.size) fail('reference-total-mismatch');
  const unique = [...new Map(failures.map((entry) => [JSON.stringify(entry), entry])).values()];
  return Object.freeze({
    ok: unique.length === 0,
    failures: Object.freeze(unique.map((entry) => Object.freeze(entry))),
    summary: Object.freeze({ removedReferences: removedCount, retainedReferences: retainedCount,
      referencesBefore: before.references.length, referencesAfter: after.references.length }),
  });
}

const refused = (stage, rejections) => Object.freeze({ ok: false, stage,
  rejections: Object.freeze(rejections.map((entry) => Object.freeze({ ...entry }))) });

/**
 * Apply a ready plan, composing it with the M2 session's field edits when the
 * plan was made with one. Returns verified bytes only when every check passes:
 *   { ok: true, bytes, document, identical, planKey, counts, verification }
 * otherwise { ok: false, stage, rejections } and no bytes.
 *
 * @param {object} plan from planGmiHyperlinkRemoval
 * @param {object} options
 * @param {object} [options.session] required iff the plan has a session basis
 * @param {{selectionKeys: string[]}} options.authorization M9 attests that the
 *   combined GML was planned for exactly these selections; it must equal the
 *   plan's selection keys. Required for every non-empty plan.
 */
export function applyGmiHyperlinkRemoval(plan, { session = null, authorization = null } = {}) {
  if (!isGmiHyperlinkRemovalPlan(plan)) return refused('authorize', [{ code: 'not-a-removal-plan' }]);
  const { document } = plans.get(plan);
  if (plan.status === GMI_HYPERLINK_REMOVAL_STATUS.BLOCKED) return refused('authorize', [{ code: 'plan-blocked' }]);
  const planned = plan.selections.map((selection) => selection.selectionKey);
  if (planned.length || authorization !== null) {
    const keys = Array.isArray(authorization?.selectionKeys) ? sortedUnique(authorization.selectionKeys) : null;
    if (!keys || keys.length !== authorization.selectionKeys.length) return refused('authorize', [{ code: 'missing-authorization' }]);
    if (!sameList(keys, sortedUnique(planned))) return refused('authorize', [{ code: 'authorization-mismatch' }]);
  }
  if (!gmiSourceIntact(document)) return refused('authorize', [{ code: 'source-bytes-mutated' }]);

  let fieldEdits = [];
  if (plan.basis.session) {
    if (!session || !isGmiEditSession(session) || session.document !== document) return refused('compose', [{ code: 'session-required' }]);
    const compiled = compileGmiEffectiveEdits(session);
    if (!compiled.ok) return refused('compose', [{ code: 'session-not-compilable', detail: compiled.code }]);
    if (compiled.effectiveKey !== plan.basis.session.effectiveKey) return refused('compose', [{ code: 'stale-session-state' }]);
    fieldEdits = compiled.edits;
  } else if (session) {
    return refused('compose', [{ code: 'session-not-in-plan-basis' }]);
  }
  const removalKeys = new Set(plan.edits.map((edit) => gmiCellKey(edit.target)));
  for (const edit of fieldEdits) {
    if (edit.target.field === GMI_HYPERLINK_FIELD || removalKeys.has(gmiCellKey(edit.target))) return refused('compose', [{ code: 'field-edit-overlaps-hyperlink' }]);
  }
  const edits = [...fieldEdits, ...plan.edits];
  if (!edits.length) {
    // P1: nothing to change -> the original bytes, untouched.
    return Object.freeze({ ok: true, kind: 'gmi-hyperlink-removal-result', identical: true, planKey: plan.planKey,
      bytes: getGmiSourceBytes(document), document, counts: plan.counts, fieldEditCount: 0,
      verification: Object.freeze({ field: null, hyperlink: null }) });
  }
  const result = editGmiFields(document, edits);
  if (!result.ok) return refused(result.stage, result.rejections);
  const outputDocument = result.verification.outputDocument;
  const hyperlink = verifyGmiHyperlinkRemoval(document, outputDocument, plan);
  if (!hyperlink.ok) return refused('verify-hyperlinks', hyperlink.failures);
  return Object.freeze({
    ok: true, kind: 'gmi-hyperlink-removal-result', identical: false, planKey: plan.planKey,
    bytes: result.bytes, document: outputDocument, counts: plan.counts, fieldEditCount: fieldEdits.length,
    verification: Object.freeze({ field: result.verification.summary, hyperlink: hyperlink.summary }),
  });
}
