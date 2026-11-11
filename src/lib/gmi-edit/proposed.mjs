// Proposed GMI state for field editing (M2).
//
// The proposed copy is always derived from the immutable original document:
//   compileGmiEffectiveEdits(session)   one edit per changed cell, expected =
//                                        the original source lexeme
//   editGmiFields(document, edits)      one M1 plan -> splice -> independent
//                                        verification
//   verification.outputDocument         the verified output as a new frozen
//                                        source document (its parser is the
//                                        proposed dataset)
// Previously patched output is never patched again.
//
// M1 verification costs about 1.3 s on the largest real file, so results are
// memoized per (source document, effective edit list). Two histories that
// reach the same effective state (e.g. undo + redo, or a value reverted to
// its original) share one result. Getters and re-renders never recompute.
// Cache invalidation is explicit (`invalidate`, `clear`); on every hit the
// integrity tokens of the source and the cached output are re-checked, and a
// mismatch evicts the entry and recomputes (which then fails closed in M1).
import { runGmiValidationV2 } from '../validation-v2/validationRunner.js';
import { getDatasetRevision } from '../validation-v2/datasetRevision.js';
import { getGmiSourceBytes, gmiSourceIntact } from './sourceDocument.mjs';
import { editGmiFields } from './patch.mjs';
import { compileGmiEffectiveEdits, isGmiEditSession } from './session.mjs';

const datasets = new WeakMap();   // source document -> dataset

/**
 * The app-shaped dataset (`GMIParser#toObject()` without warningSummary, as
 * the upload path stores it) for a source document's own frozen parser. The
 * same document always yields the same dataset object, so its
 * `datasetRevision` is stable.
 */
export function getGmiDocumentDataset(document) {
  let dataset = datasets.get(document);
  if (!dataset) {
    if (!document?.parser) throw new TypeError('document has no parser result');
    const { warningSummary, ...rest } = document.parser.toObject();
    void warningSummary;
    dataset = Object.freeze(rest);
    datasets.set(document, dataset);
  }
  return dataset;
}

/**
 * Explicit cache for proposed results.
 * @param {{maxEntriesPerDocument?: number}} [options] small LRU per document;
 *   each entry holds one verified output document and its dataset.
 */
export function createGmiProposedCache({ maxEntriesPerDocument = 4 } = {}) {
  if (!Number.isInteger(maxEntriesPerDocument) || maxEntriesPerDocument < 1) throw new TypeError('maxEntriesPerDocument must be a positive integer');
  let byDocument = new WeakMap();
  const stats = { hits: 0, misses: 0, computations: 0, invalidations: 0, integrityEvictions: 0 };
  const entriesOf = (document) => {
    let entries = byDocument.get(document);
    if (!entries) { entries = new Map(); byDocument.set(document, entries); }
    return entries;
  };
  return Object.freeze({
    get(document, key) {
      const entries = byDocument.get(document);
      if (!entries || !entries.has(key)) return undefined;
      const value = entries.get(key);
      entries.delete(key); entries.set(key, value);   // LRU touch
      return value;
    },
    set(document, key, value) {
      const entries = entriesOf(document);
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntriesPerDocument) entries.delete(entries.keys().next().value);
    },
    delete(document, key) { byDocument.get(document)?.delete(key); },
    /** Drop every cached result for one document. */
    invalidate(document) { if (byDocument.delete(document)) stats.invalidations++; },
    /** Drop everything. */
    clear() { byDocument = new WeakMap(); stats.invalidations++; },
    size(document) { return byDocument.get(document)?.size ?? 0; },
    stats() { return Object.freeze({ ...stats }); },
    _stats: stats,
  });
}

/** Process-wide default cache (callers and tests may pass their own). */
export const defaultGmiProposedCache = createGmiProposedCache();

function computeProposed(session, compiled) {
  const { document } = session;
  if (!compiled.edits.length) {
    // P1: no effective change -> the proposed copy is the original source,
    // byte-identical, with no decode or encode at all.
    return Object.freeze({
      ok: true, kind: 'gmi-proposed-state', effectiveKey: compiled.effectiveKey,
      identical: true, editCount: 0, edits: compiled.edits,
      document, dataset: getGmiDocumentDataset(document), verification: null,
    });
  }
  const result = editGmiFields(document, compiled.edits);
  if (!result.ok) {
    return Object.freeze({ ok: false, kind: 'gmi-proposed-state', effectiveKey: compiled.effectiveKey, stage: result.stage, rejections: result.rejections });
  }
  const output = result.verification.outputDocument;
  return Object.freeze({
    ok: true, kind: 'gmi-proposed-state', effectiveKey: compiled.effectiveKey,
    identical: false, editCount: compiled.edits.length, edits: compiled.edits,
    document: output, dataset: getGmiDocumentDataset(output),
    verification: Object.freeze({ ok: true, summary: result.verification.summary ?? null }),
  });
}

/**
 * The verified proposed state for the session's current effective edits.
 * `{ ok: true, effectiveKey, identical, editCount, edits, document, dataset,
 *    verification }` or `{ ok: false, stage, rejections }` (no bytes).
 * `document` is a frozen source document of the proposed bytes; use
 * getGmiProposedBytes for a copy of them.
 */
export function getGmiProposedState(session, { cache = defaultGmiProposedCache } = {}) {
  if (!isGmiEditSession(session)) throw new TypeError('getGmiProposedState expects a GMI edit session');
  const compiled = compileGmiEffectiveEdits(session);
  if (!compiled.ok) return Object.freeze({ ok: false, kind: 'gmi-proposed-state', stage: 'compile', rejections: Object.freeze([Object.freeze({ code: compiled.code })]) });
  const { document } = session;
  const cached = cache.get(document, compiled.effectiveKey);
  if (cached) {
    const intact = gmiSourceIntact(document) && (cached.ok ? gmiSourceIntact(cached.document) : true);
    if (intact) { cache._stats.hits++; return cached; }
    cache._stats.integrityEvictions++;
    cache.delete(document, compiled.effectiveKey);
  }
  cache._stats.misses++;
  cache._stats.computations++;
  const proposed = computeProposed(session, compiled);
  cache.set(document, compiled.effectiveKey, proposed);
  return proposed;
}

/** A fresh copy of the proposed bytes (the original bytes when identical). */
export function getGmiProposedBytes(proposed) {
  if (!proposed?.ok) throw new TypeError('no verified proposed state');
  return getGmiSourceBytes(proposed.document);
}

const validationRuns = new WeakMap();   // dataset -> Map(key -> run)

export function gmiValidationReferenceDate(referenceDate) {
  if (referenceDate === undefined || referenceDate === null) return new Date().toISOString().slice(0, 10);
  if (typeof referenceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new TypeError('referenceDate must be YYYY-MM-DD');
  return referenceDate;
}

/**
 * runGmiValidationV2 on one dataset, memoized per (dataset, layerId,
 * referenceDate). The dataset's own datasetRevision is used.
 */
export function validateGmiDataset(dataset, { layerId, referenceDate } = {}) {
  if (typeof layerId !== 'string' || !layerId.trim()) throw new TypeError('layerId must be a non-empty string');
  const date = gmiValidationReferenceDate(referenceDate);
  let runs = validationRuns.get(dataset);
  if (!runs) { runs = new Map(); validationRuns.set(dataset, runs); }
  const key = `${layerId}|${date}`;
  if (!runs.has(key)) {
    runs.set(key, runGmiValidationV2({ layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: date }));
  }
  return runs.get(key);
}

/**
 * Validate the original and the verified proposed dataset with the unchanged
 * Validator 2.0 pathway. Both runs are memoized.
 */
export function revalidateGmiEditSession(session, { layerId = session.layerId, referenceDate, cache } = {}) {
  const proposed = getGmiProposedState(session, cache ? { cache } : undefined);
  if (!proposed.ok) return Object.freeze({ ok: false, proposed });
  const date = gmiValidationReferenceDate(referenceDate);
  const original = validateGmiDataset(getGmiDocumentDataset(session.document), { layerId, referenceDate: date });
  const revised = validateGmiDataset(proposed.dataset, { layerId, referenceDate: date });
  return Object.freeze({
    ok: true,
    proposed,
    original,
    revised,
    summary: Object.freeze({
      original: original.summary,
      proposed: revised.summary,
      failDelta: revised.summary.failFindingCount - original.summary.failFindingCount,
      checkDelta: revised.summary.checkFindingCount - original.summary.checkFindingCount,
    }),
  });
}
