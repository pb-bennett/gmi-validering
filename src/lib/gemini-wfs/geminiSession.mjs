import { getDatasetRevision } from '../validation-v2/datasetRevision.js';
import { getLayerType } from '../layerPresentation.mjs';
import { getGeminiExtent } from './geminiExtent.mjs';
import { fetchGeminiPair, validateGeminiCredentials } from './geminiClient.mjs';
import { validateGeminiConnection } from './geminiConnection.mjs';
import { GeminiServiceError, safeGeminiError, waitForGemini } from './geminiErrors.mjs';

export const EMPTY_GEMINI_SNAPSHOT = Object.freeze({
  connection: null, connectionId: null, connectionStatus: 'disconnected', accountGeneration: null,
  source: null, status: 'idle', request: null, result: null, error: null, stale: false,
});
const SURVEY_TYPES = new Set(['GMI', 'SOSI', 'KOF']);
let accountSequence = 0;
const accountToken = () => globalThis.crypto?.randomUUID?.() || `gemini-${Date.now()}-${++accountSequence}`;

export function createGeminiSession({ getLayer = () => null, requestPair = fetchGeminiPair,
  extent = getGeminiExtent, now = Date.now } = {}) {
  // This slot never enters snapshots, Zustand, keys, logs or persistence.
  let credentials = null;
  let snapshot = EMPTY_GEMINI_SNAPSHOT;
  let active = null, generation = 0, disposed = false;
  const listeners = new Set();

  function publish(patch) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  }
  function invalidate() {
    generation += 1;
    const previous = active; active = null;
    previous?.controller.abort();
  }
  function survey(id) {
    const layer = getLayer(id);
    return layer?.data && SURVEY_TYPES.has(getLayerType(layer)) ? layer : null;
  }
  function sourceDescriptor(id) {
    const layer = survey(id);
    if (!layer) throw new GeminiServiceError('no_survey_source');
    return Object.freeze({ sourceLayerId: id, datasetRevision: getDatasetRevision(layer.data) });
  }
  function matchesSource(result, source) {
    return Boolean(result && source && result.provenance.sourceLayerId === source.sourceLayerId &&
      result.provenance.datasetRevision === source.datasetRevision);
  }
  function reconcileSource() {
    if (disposed) return;
    let source = snapshot.source, result = snapshot.result, changed = false, interrupted = false;
    if (source) {
      const layer = survey(source.sourceLayerId);
      const revision = layer ? getDatasetRevision(layer.data) : null;
      if (revision !== source.datasetRevision) {
        invalidate(); interrupted = true; changed = true;
        source = layer ? Object.freeze({ sourceLayerId: source.sourceLayerId, datasetRevision: revision }) : null;
      }
    }
    // An older retained result can belong to a different selected source.
    if (result && !survey(result.provenance.sourceLayerId)) { result = null; changed = true; }
    const resultLayer = result && survey(result.provenance.sourceLayerId);
    const stale = Boolean(result && (!matchesSource(result, source) ||
      getDatasetRevision(resultLayer.data) !== result.provenance.datasetRevision));
    if (changed || stale !== snapshot.stale) publish({ source, result, stale,
      ...(interrupted ? { request: null, error: null, status: result ? 'outdated' : 'idle' } : {}),
    });
  }
  function selectSource(id) {
    if (disposed) throw new GeminiServiceError('session_disposed');
    const source = sourceDescriptor(id);
    if (snapshot.source?.sourceLayerId === id && snapshot.source.datasetRevision === source.datasetRevision) return;
    invalidate();
    publish({ source, request: null, error: null, status: snapshot.result ? 'outdated' : 'idle',
      stale: Boolean(snapshot.result && !matchesSource(snapshot.result, source)) });
  }
  function fail(error) {
    invalidate();
    const safe = safeGeminiError(error);
    publish({ status: 'error', request: null, error: safe });
    return Promise.resolve(Object.freeze({ ok: false, error: safe }));
  }
  function fetchReference(id = snapshot.source?.sourceLayerId, { refresh = false } = {}) {
    if (disposed) return Promise.resolve(Object.freeze({ ok: false, error: safeGeminiError(new GeminiServiceError('session_disposed')) }));
    let request;
    try {
      reconcileSource();
      selectSource(id);
      if (!snapshot.connection) throw new GeminiServiceError('connection_unavailable');
      if (!credentials) throw new GeminiServiceError('credentials_unavailable');
      const layer = survey(id);
      // Production deliberately passes no buffer override: fixed 100 m.
      const bounds = extent(layer);
      const identity = [id, snapshot.source.datasetRevision, snapshot.connectionId, snapshot.connection.url,
        snapshot.accountGeneration, bounds.bbox, bounds.bufferMetres];
      const key = JSON.stringify(identity);
      if (active?.key === key) return active.promise;
      if (!refresh && !snapshot.stale && snapshot.result?.provenance.requestKey === key) {
        return Promise.resolve(Object.freeze({ ok: true, result: snapshot.result, reused: true }));
      }
      invalidate();
      request = Object.freeze({ sourceLayerId: id, datasetRevision: snapshot.source.datasetRevision,
        connectionId: snapshot.connectionId, connectionUrl: snapshot.connection.url, accountGeneration: snapshot.accountGeneration,
        bbox: Object.freeze([...bounds.bbox]), bufferMetres: bounds.bufferMetres,
        sourceCrs: bounds.sourceCrs, crs: bounds.crs, requestKey: key, generation });
    } catch (error) { return fail(error); }

    const ticket = { key: request.requestKey, generation, controller: new AbortController(), promise: null };
    active = ticket;
    const operationCredentials = credentials;
    const operationConnection = snapshot.connection;
    const work = Promise.resolve().then(() => {
      if (ticket.controller.signal.aborted) throw new GeminiServiceError('request_aborted');
      return requestPair({ connection: operationConnection, bbox: request.bbox, credentials: operationCredentials, signal: ticket.controller.signal });
    });
    ticket.promise = (async () => {
      try {
        const pair = await waitForGemini(work, ticket.controller.signal);
        reconcileSource();
        if (active !== ticket || ticket.generation !== generation) throw new GeminiServiceError('request_aborted');
        const result = Object.freeze({ lines: pair.lines, points: pair.points, counts: pair.counts,
          fetchedAt: now(), provenance: Object.freeze({ ...request, counts: pair.counts }) });
        active = null;
        publish({ result, request: null, error: null, status: 'ready', stale: false });
        return Object.freeze({ ok: true, result, reused: false });
      } catch (error) {
        const current = active === ticket && ticket.generation === generation;
        const safe = safeGeminiError(current ? error : new GeminiServiceError('request_aborted'));
        if (current) {
          active = null;
          if (safe.code === 'authentication_failed') credentials = null;
          publish({ request: null, error: safe, status: safe.code === 'request_aborted' ? 'cancelled' : 'error',
            ...(safe.code === 'authentication_failed' ? { connectionStatus: 'credentials-required' } : {}) });
        }
        return Object.freeze({ ok: false, error: safe });
      }
    })();
    publish({ request, status: 'loading', error: null,
      stale: Boolean(snapshot.result && snapshot.result.provenance.requestKey !== request.requestKey) });
    return ticket.promise;
  }
  function reset() {
    invalidate(); credentials = null;
    publish({ ...EMPTY_GEMINI_SNAPSHOT, connection: snapshot.connection, connectionId: snapshot.connectionId });
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    setConnection: (input) => {
      if (disposed) throw new GeminiServiceError('session_disposed');
      let connection;
      try { connection = validateGeminiConnection(input); }
      catch { throw new GeminiServiceError('invalid_connection'); }
      if (snapshot.connection?.id === connection.id && snapshot.connection.url === connection.url) {
        publish({ connection }); return;
      }
      invalidate(); credentials = null;
      publish({ ...EMPTY_GEMINI_SNAPSHOT, connection, connectionId: connection.id });
    },
    setCredentials: (input) => {
      if (disposed) throw new GeminiServiceError('session_disposed');
      validateGeminiCredentials(input);
      invalidate(); credentials = Object.freeze({ username: input.username, password: input.password });
      publish({ accountGeneration: accountToken(), connectionStatus: 'connected', result: null,
        request: null, error: null, status: 'idle', stale: false });
    },
    selectSource, reconcileSource,
    fetch: (id) => fetchReference(id),
    refresh: (id) => fetchReference(id, { refresh: true }),
    cancel: () => {
      if (!active) return;
      invalidate(); publish({ request: null, status: 'cancelled', error: safeGeminiError(new GeminiServiceError('request_aborted')) });
    },
    clearResult: () => { invalidate(); publish({ request: null, result: null, error: null, status: 'idle', stale: false }); },
    disconnect: reset, reset,
    dispose: () => { reset(); disposed = true; listeners.clear(); },
  });
}

let surveyStore = null, unsubscribeStore = null;
export const geminiSession = createGeminiSession({ getLayer: (id) => surveyStore?.getState().layers[id] });

// One-way binding avoids a store/session import cycle. It observes ownership,
// not visibility or camera state, and can only reconcile/cancel, never fetch.
export function bindGeminiSurveyStore(store) {
  unsubscribeStore?.();
  if (surveyStore && surveyStore !== store) geminiSession.reset();
  surveyStore = store;
  unsubscribeStore = store.subscribe(() => geminiSession.reconcileSource());
  geminiSession.reconcileSource();
}
