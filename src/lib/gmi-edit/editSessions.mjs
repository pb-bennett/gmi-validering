// Editing-session registry for imported GMI survey layers (M3).
//
// One registry entry per survey layer. An entry binds:
//   layerId                 the survey layer
//   binding                 the loadedGmiSources binding ({layerId, inputId, ...})
//                           of the exact imported File
//   document                the M1 GmiSourceDocument built from that File's
//                           bytes (private copy, SHA-256 fingerprint)
//   session                 the current immutable M2 session value
// Documents, sessions and bytes live only here, outside Zustand and outside
// persistence. A store receives a small frozen status per opened layer through
// `onChange` and nothing else.
//
// This module orchestrates M1/M2; it adds no editing logic. Every transition
// is the M2 function applied to the current session value.
//
// Identity rules:
// - A session is reachable only through the frozen handle `open` returns. A
//   handle names {layerId, sessionId, inputId, fingerprint}; a copy, a handle
//   of a disposed session or one whose source is no longer the imported File
//   is refused. Two layers never share an entry, even with identical bytes or
//   the same filename.
// - Every access re-checks that the layer's source is still live (same layer,
//   same `data` object, same registered File) and that the document's private
//   bytes are intact. A dead source disposes the entry (and its cache entries).
//
// Unsaved-changes semantics (see `isUnsaved`): a session needs attention when
// its effective proposed copy differs from the original delivery AND that exact
// effective state has not been handed out as a download. Staged ChangeSets
// whose effect is nil (all cells reverted) and a pure redo stack do not count.
// "Downloaded" means only that the export service produced the file and the
// caller reported starting the download; the browser cannot confirm the save.
import { getGmiSourceBytes, gmiSourceIntact, isGmiSourceDocument, loadGmiSourceDocument, computeGmiSourceFingerprint } from './sourceDocument.mjs';
import {
  compileGmiEffectiveEdits, createGmiEditSession, discardAllGmiEdits, discardGmiChangeSet, getGmiEditCell,
  listGmiEditCells, redoGmiEdit, stageGmiChangeSet, summarizeGmiEditSession, undoGmiEdit,
} from './session.mjs';
import { defaultGmiProposedCache, getGmiDocumentDataset, getGmiProposedState, revalidateGmiEditSession } from './proposed.mjs';
import { evaluateGmiBatchEligibility } from './eligibility.mjs';
import { diffGmiDatasets } from './diff.mjs';

export const GMI_EDIT_LAYER_STATES = Object.freeze({
  UNSUPPORTED: 'unsupported',   // no such layer, or not a GMI survey layer
  UNAVAILABLE: 'unavailable',   // GMI layer whose original bytes were not retained
  UNLOADED: 'unloaded',         // source retained, no session opened yet
  LOADING: 'loading',
  EDITABLE: 'editable',
  READ_ONLY: 'read-only',       // document opened, M1 refuses edits (reasons given)
  ERROR: 'error',               // opening failed (code given); a new open retries
  INVALIDATED: 'invalidated',   // source replaced under a still-existing layer; session discarded
});

const S = GMI_EDIT_LAYER_STATES;
const fail = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });
function codeOf(error, fallback) {
  const code = (typeof error?.code === 'string' && error.code) || (typeof error?.message === 'string' && /^[a-z0-9-]+$/.test(error.message) ? error.message : fallback);
  return code === 'stale-loaded-gmi' ? 'source-stale' : code;
}

function sameDatasetShape(document, data) {
  // Defense in depth against a File that is not the one the layer was parsed
  // from: same object counts and, per object, the same id and GUID.
  const parser = document.parser;
  if (!parser || !data) return false;
  const pairs = [[parser.points, data.points], [parser.linesParsed, data.lines]];
  for (const [ours, theirs] of pairs) {
    if (!Array.isArray(theirs) || ours.length !== theirs.length) return false;
    for (let i = 0; i < ours.length; i++) {
      if ((ours[i]?.id ?? null) !== (theirs[i]?.id ?? null) || (ours[i]?.guid ?? null) !== (theirs[i]?.guid ?? null)) return false;
    }
  }
  return true;
}

/**
 * @param {object} deps
 * @param {{begin(layerId), readBytes(ticket), read?(ticket), isLive(binding)}} deps.sources
 *   loadedGmiSources (or a test double)
 * @param {(layerId: string) => object|null} deps.getLayer current survey layer
 * @param {(layer: object) => boolean} [deps.isGmiLayer]
 * @param {object} [deps.cache] M2 proposed cache (default: defaultGmiProposedCache)
 * @param {(layerId: string, status: object|null) => void} [deps.onChange]
 * @param {(bytes, options) => Promise<object>} [deps.loadDocument] M1 loader
 */
export function createGmiEditSessions({
  sources, getLayer, isGmiLayer = (layer) => Boolean(layer?.data), cache = defaultGmiProposedCache,
  onChange = () => {}, loadDocument = loadGmiSourceDocument,
} = {}) {
  if (!sources || typeof sources.begin !== 'function' || typeof sources.readBytes !== 'function' || typeof sources.isLive !== 'function') {
    throw new TypeError('createGmiEditSessions needs sources with begin, readBytes and isLive');
  }
  if (typeof getLayer !== 'function') throw new TypeError('createGmiEditSessions needs getLayer');

  const entries = new Map();      // layerId -> entry
  const notices = new Map();      // layerId -> invalidation status (layer still present)
  const handles = new WeakMap();  // handle -> entry
  let sequence = 0, revision = 0;

  // ------------------------------------------------------------- status

  const effectiveKeyOf = (entry) => compileGmiEffectiveEdits(entry.session).effectiveKey;

  function isUnsaved(entry) {
    if (entry?.phase !== 'ready') return false;
    const summary = summarizeGmiEditSession(entry.session);
    return summary.changedCells > 0 && effectiveKeyOf(entry) !== entry.downloadedKey;
  }

  function statusOf(entry) {
    const base = { layerId: entry.layerId, sessionId: entry.sessionId, revision: entry.revision, filename: entry.binding.filename ?? null };
    if (entry.phase === 'loading') return Object.freeze({ ...base, state: S.LOADING, fingerprint: null, changeSetCount: 0, redoCount: 0, changedCells: 0, changedObjects: 0, unsaved: false, downloaded: false, reasons: Object.freeze([]), error: null });
    if (entry.phase === 'error') return Object.freeze({ ...base, state: S.ERROR, fingerprint: entry.document?.fingerprint ?? null, changeSetCount: 0, redoCount: 0, changedCells: 0, changedObjects: 0, unsaved: false, downloaded: false, reasons: Object.freeze([]), error: entry.error });
    const summary = summarizeGmiEditSession(entry.session);
    const key = effectiveKeyOf(entry);
    return Object.freeze({
      ...base,
      state: entry.document.editable ? S.EDITABLE : S.READ_ONLY,
      fingerprint: entry.document.fingerprint,
      documentStatus: entry.document.status,
      reasons: entry.document.reasons,
      stateKey: entry.session.stateKey,
      changeSetCount: summary.changeSetCount,
      redoCount: summary.redoCount,
      changedCells: summary.changedCells,
      changedObjects: summary.changedObjects,
      canUndo: summary.canUndo,
      canRedo: summary.canRedo,
      unsaved: summary.changedCells > 0 && key !== entry.downloadedKey,
      downloaded: summary.changedCells > 0 && key === entry.downloadedKey,
      error: null,
    });
  }

  function publish(entry) {
    entry.revision = ++revision;
    onChange(entry.layerId, statusOf(entry));
  }

  function remove(entry, notice = null) {
    if (entries.get(entry.layerId) !== entry) return;
    entries.delete(entry.layerId);
    entry.disposed = true;
    if (entry.document) cache.invalidate(entry.document);
    if (notice) {
      notices.set(entry.layerId, notice);
      onChange(entry.layerId, notice);
    } else {
      notices.delete(entry.layerId);
      onChange(entry.layerId, null);
    }
  }

  // Invalidate an entry whose source is gone. The layer may still exist (its
  // data/File was replaced): then a notice records what was discarded.
  function invalidate(entry, reason) {
    const layer = getLayer(entry.layerId);
    const changeSets = entry.phase === 'ready' ? entry.session.changeSets.length : 0;
    const unsaved = isUnsaved(entry);
    const notice = layer ? Object.freeze({
      layerId: entry.layerId, sessionId: entry.sessionId, revision: ++revision, filename: entry.binding.filename ?? null,
      state: S.INVALIDATED, reason, discardedChangeSets: changeSets, discardedUnsaved: unsaved,
      fingerprint: entry.document?.fingerprint ?? null, changeSetCount: 0, redoCount: 0, changedCells: 0, changedObjects: 0,
      unsaved: false, downloaded: false, reasons: Object.freeze([]), error: null,
    }) : null;
    remove(entry, notice);
    return Object.freeze({ layerId: entry.layerId, reason, discardedChangeSets: changeSets, discardedUnsaved: unsaved });
  }

  /** Lightweight state of any layer, opened or not. Never reads bytes. */
  function describe(layerId) {
    const entry = entries.get(layerId);
    if (entry) {
      if (!sources.isLive(entry.binding)) { invalidate(entry, 'source-stale'); return describe(layerId); }
      return statusOf(entry);
    }
    const layer = getLayer(layerId);
    if (!layer || !isGmiLayer(layer)) return Object.freeze({ layerId, state: S.UNSUPPORTED });
    if (notices.has(layerId)) return notices.get(layerId);
    const ticket = sources.begin(layerId);
    return Object.freeze({ layerId, state: ticket ? S.UNLOADED : S.UNAVAILABLE });
  }

  // ------------------------------------------------------------- opening

  function makeHandle(entry) {
    const handle = Object.freeze({
      kind: 'gmi-edit-handle', layerId: entry.layerId, sessionId: entry.sessionId,
      inputId: entry.binding.inputId, fingerprint: entry.document.fingerprint, filename: entry.binding.filename ?? null,
    });
    handles.set(handle, entry);
    return handle;
  }

  const opened = (entry, expected) => {
    if (expected.fingerprint !== undefined && expected.fingerprint !== entry.document.fingerprint) return fail('fingerprint-mismatch', { layerId: entry.layerId });
    if (expected.inputId !== undefined && expected.inputId !== entry.binding.inputId) return fail('source-identity-mismatch', { layerId: entry.layerId });
    return Object.freeze({ ok: true, handle: entry.handle, status: statusOf(entry) });
  };

  async function load(entry, ticket) {
    let bytes;
    try { bytes = await sources.readBytes(ticket); }
    catch (error) { return fail(codeOf(error, 'source-unreadable')); }
    if (entries.get(entry.layerId) !== entry || !sources.isLive(entry.binding)) return fail('source-stale');
    const document = await loadDocument(bytes, { filename: entry.binding.filename ?? null });
    bytes.fill(0);   // our transient copy; the document holds its own
    if (!isGmiSourceDocument(document) || !document.fingerprint) return fail('source-unreadable');
    // Shared identity with FOTO: the fingerprint of the registered File (one
    // digest per File, cached by loadedGmiSources). Skipped above the FOTO
    // size limit; such documents are read-only anyway.
    if (typeof sources.read === 'function' && document.status !== 'too-large') {
      let evidence;
      try { evidence = await sources.read(ticket); }
      catch (error) { return fail(codeOf(error, 'source-unreadable')); }
      if (evidence?.fingerprint && evidence.fingerprint !== document.fingerprint) return fail('source-fingerprint-mismatch');
    }
    if (entries.get(entry.layerId) !== entry || !sources.isLive(entry.binding)) return fail('source-stale');
    const layer = getLayer(entry.layerId);
    if (document.parser && !document.parser.errors?.length && !sameDatasetShape(document, layer?.data)) return fail('layer-data-mismatch');
    return Object.freeze({ ok: true, document });
  }

  /**
   * Open (or reuse) the session of one survey layer.
   * @param {string} layerId
   * @param {{fingerprint?: string, inputId?: string}} [expected] identity the
   *   caller expects (refused on mismatch, never re-bound)
   * @returns {Promise<{ok: true, handle, status} | {ok: false, code}>}
   */
  async function open(layerId, expected = {}) {
    const existing = entries.get(layerId);
    if (existing) {
      if (!sources.isLive(existing.binding)) invalidate(existing, 'source-stale');
      else if (existing.phase === 'ready') return opened(existing, expected);
      else if (existing.phase === 'loading') {
        const result = await existing.promise;
        return result.ok ? opened(existing, expected) : result;
      } else remove(existing);   // error: retry
    }
    const layer = getLayer(layerId);
    if (!layer || !isGmiLayer(layer)) return fail('unsupported-layer', { layerId });
    const ticket = sources.begin(layerId);
    if (!ticket) return fail('source-unavailable', { layerId });
    notices.delete(layerId);
    const entry = { layerId, sessionId: `gmi-edit-${++sequence}`, binding: ticket.binding, phase: 'loading', document: null, session: null, handle: null, downloadedKey: null, error: null, revision: 0, disposed: false };
    entries.set(layerId, entry);
    entry.promise = (async () => {
      let result;
      try { result = await load(entry, ticket); }
      catch (error) { result = fail(codeOf(error, 'source-unreadable')); }
      if (entries.get(layerId) !== entry) return fail('source-stale');
      if (!result.ok) {
        if (result.code === 'source-stale') { invalidate(entry, 'source-stale'); return result; }
        entry.phase = 'error'; entry.error = result.code; publish(entry);
        return result;
      }
      entry.document = result.document;
      entry.session = createGmiEditSession(result.document, { layerId });
      entry.phase = 'ready';
      entry.handle = makeHandle(entry);
      publish(entry);
      return Object.freeze({ ok: true });
    })();
    publish(entry);
    const result = await entry.promise;
    return result.ok ? opened(entry, expected) : result;
  }

  // ------------------------------------------------------------- access

  /** Resolve a handle to its live entry, or a refusal with a code. */
  function resolve(handle) {
    const entry = handle && typeof handle === 'object' ? handles.get(handle) : undefined;
    if (!entry) return fail('invalid-handle');
    const current = entries.get(handle.layerId);
    if (!current) return fail('session-disposed', { layerId: handle.layerId });
    if (current !== entry || current.sessionId !== handle.sessionId) return fail('stale-session', { layerId: handle.layerId });
    if (entry.disposed) return fail('session-disposed', { layerId: handle.layerId });
    if (entry.binding.inputId !== handle.inputId) return fail('source-identity-mismatch', { layerId: handle.layerId });
    if (entry.document.fingerprint !== handle.fingerprint) return fail('fingerprint-mismatch', { layerId: handle.layerId });
    if (!sources.isLive(entry.binding)) { invalidate(entry, 'source-stale'); return fail('source-stale', { layerId: handle.layerId }); }
    if (!gmiSourceIntact(entry.document)) { invalidate(entry, 'source-bytes-mutated'); return fail('source-bytes-mutated', { layerId: handle.layerId }); }
    return Object.freeze({ ok: true, entry });
  }

  /** The handle of an opened session (null if none or not live). */
  function getHandle(layerId) {
    const entry = entries.get(layerId);
    if (!entry || entry.phase !== 'ready') return null;
    return resolve(entry.handle).ok ? entry.handle : null;
  }

  /** The current immutable M2 session value (build ChangeSets against it). */
  function getSession(handle) {
    const resolved = resolve(handle);
    if (!resolved.ok) return resolved;
    return Object.freeze({ ok: true, session: resolved.entry.session, status: statusOf(resolved.entry) });
  }

  function transition(handle, apply) {
    const resolved = resolve(handle);
    if (!resolved.ok) return resolved;
    const { entry } = resolved;
    const result = apply(entry.session);
    if (!result.ok) return result;
    if (result.session !== entry.session) { entry.session = result.session; publish(entry); }
    return Object.freeze({ ...result, status: statusOf(entry) });
  }

  // ------------------------------------------------------------- disposal

  /**
   * Dispose one layer's session. Refuses (`unsaved-changes`) when the session
   * has unsaved changes, unless `discardUnsaved` is set explicitly.
   */
  function dispose(layerId, { discardUnsaved = false } = {}) {
    const entry = entries.get(layerId);
    if (!entry) {
      if (notices.has(layerId)) { notices.delete(layerId); onChange(layerId, null); }
      return Object.freeze({ ok: true, disposed: false });
    }
    if (isUnsaved(entry) && !discardUnsaved && sources.isLive(entry.binding)) return fail('unsaved-changes', { layerId, changeSetCount: entry.session.changeSets.length });
    const changeSets = entry.phase === 'ready' ? entry.session.changeSets.length : 0;
    remove(entry);
    return Object.freeze({ ok: true, disposed: true, discardedChangeSets: changeSets });
  }

  /** Drop entries whose source is no longer live, and notices for removed layers. */
  function reconcile() {
    const invalidated = [];
    for (const entry of [...entries.values()]) if (!sources.isLive(entry.binding)) invalidated.push(invalidate(entry, 'source-stale'));
    for (const layerId of [...notices.keys()]) {
      const layer = getLayer(layerId);
      if (!layer || !isGmiLayer(layer)) { notices.delete(layerId); onChange(layerId, null); }
    }
    return Object.freeze(invalidated);
  }

  /** Dispose everything (workspace reset). Unconditional; check unsaved first. */
  function clear() {
    for (const entry of [...entries.values()]) remove(entry);
    for (const layerId of [...notices.keys()]) { notices.delete(layerId); onChange(layerId, null); }
  }

  /** Layers (all, or the given ids) whose sessions have unsaved changes. */
  function unsavedLayers(layerIds = null) {
    const wanted = layerIds ? new Set(layerIds) : null;
    const out = [];
    for (const entry of entries.values()) {
      if (wanted && !wanted.has(entry.layerId)) continue;
      if (!sources.isLive(entry.binding) || !isUnsaved(entry)) continue;
      const summary = summarizeGmiEditSession(entry.session);
      out.push(Object.freeze({ layerId: entry.layerId, filename: entry.binding.filename ?? null, changeSetCount: summary.changeSetCount, changedCells: summary.changedCells }));
    }
    return Object.freeze(out);
  }

  // ------------------------------------------------------------- downloads

  /**
   * Record that the export of `effectiveKey` was handed to the browser for
   * download (called by exportGmi's recordGmiExportDownload). Refused when
   * the session has moved on since that export.
   */
  function markDownloaded(handle, effectiveKey) {
    const resolved = resolve(handle);
    if (!resolved.ok) return resolved;
    const { entry } = resolved;
    if (effectiveKeyOf(entry) !== effectiveKey) return fail('export-stale');
    if (entry.downloadedKey !== effectiveKey) { entry.downloadedKey = effectiveKey; publish(entry); }
    return Object.freeze({ ok: true, status: statusOf(entry) });
  }

  /**
   * Re-read the registered File and compare its SHA-256 with the session's
   * fingerprint. Async; re-checks liveness afterwards.
   */
  async function verifySource(handle) {
    const resolved = resolve(handle);
    if (!resolved.ok) return resolved;
    const { entry } = resolved;
    const ticket = sources.begin(entry.layerId);
    if (!ticket || ticket.binding.inputId !== entry.binding.inputId) { invalidate(entry, 'source-stale'); return fail('source-stale'); }
    let bytes;
    try { bytes = await sources.readBytes(ticket); }
    catch (error) { return fail(codeOf(error, 'source-unreadable')); }
    const fingerprint = await computeGmiSourceFingerprint(bytes);
    bytes.fill(0);
    const again = resolve(handle);
    if (!again.ok) return again;
    if (fingerprint !== entry.document.fingerprint) return fail('source-fingerprint-mismatch');
    return Object.freeze({ ok: true, fingerprint });
  }

  // ------------------------------------------------------------- M2 views

  const withSession = (handle, read) => {
    const resolved = resolve(handle);
    return resolved.ok ? read(resolved.entry) : resolved;
  };

  return Object.freeze({
    describe,
    open,
    getHandle,
    getSession,
    resolve: (handle) => { const r = resolve(handle); return r.ok ? Object.freeze({ ok: true, layerId: r.entry.layerId, session: r.entry.session, document: r.entry.document, status: statusOf(r.entry) }) : r; },
    stage: (handle, changeSet) => transition(handle, (session) => stageGmiChangeSet(session, changeSet)),
    undo: (handle) => transition(handle, undoGmiEdit),
    redo: (handle) => transition(handle, redoGmiEdit),
    discard: (handle, changeSetId) => transition(handle, (session) => discardGmiChangeSet(session, changeSetId)),
    discardAll: (handle) => transition(handle, discardAllGmiEdits),
    /** Change list, counts and changed/reverted cells. */
    inspect: (handle) => withSession(handle, (entry) => Object.freeze({
      ok: true, status: statusOf(entry), summary: summarizeGmiEditSession(entry.session),
      changeSets: entry.session.changeSets, cells: listGmiEditCells(entry.session),
    })),
    /** Original versus proposed for one cell. */
    cell: (handle, target) => withSession(handle, (entry) => getGmiEditCell(entry.session, target)),
    /** The verified M2 proposed state (cached). */
    proposed: (handle) => withSession(handle, (entry) => getGmiProposedState(entry.session, { cache })),
    /** Exact field diff between the original and the verified proposed copy. */
    diff: (handle) => withSession(handle, (entry) => {
      const proposed = getGmiProposedState(entry.session, { cache });
      if (!proposed.ok) return fail('verification-failed', { stage: proposed.stage, rejections: proposed.rejections });
      return Object.freeze({ ok: true, proposed, diff: diffGmiDatasets(getGmiDocumentDataset(entry.document), proposed.dataset) });
    }),
    /** Batch eligibility on the current proposed dataset. */
    eligibility: (handle, options) => withSession(handle, (entry) => evaluateGmiBatchEligibility(entry.session, { ...options, cache })),
    /** Explicit full revalidation (never automatic). */
    revalidate: (handle, { referenceDate } = {}) => withSession(handle, (entry) => revalidateGmiEditSession(entry.session, { referenceDate, cache })),
    /** A fresh copy of the original imported bytes. */
    originalBytes: (handle) => withSession(handle, (entry) => Object.freeze({ ok: true, bytes: getGmiSourceBytes(entry.document) })),
    verifySource,
    markDownloaded,
    effectiveKey: (handle) => withSession(handle, (entry) => Object.freeze({ ok: true, effectiveKey: effectiveKeyOf(entry) })),
    dispose,
    reconcile,
    clear,
    unsavedLayers,
    hasUnsavedChanges: (layerIds = null) => unsavedLayers(layerIds).length > 0,
    /** Opened layer ids (diagnostics and tests). */
    layerIds: () => Object.freeze([...entries.keys()]),
  });
}
