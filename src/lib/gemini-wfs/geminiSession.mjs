import { getGeminiExtent, isGeminiSurveyLayer, validateGeminiBbox } from './geminiExtent.mjs';
import { GEMINI_COVERAGE_CONCURRENCY, classifyGeminiMapExtent } from './geminiCoveragePolicy.mjs';
import { fetchGeminiPair, validateGeminiCredentials } from './geminiClient.mjs';
import { validateGeminiConnection } from './geminiConnection.mjs';
import { GeminiServiceError, safeGeminiError, waitForGemini } from './geminiErrors.mjs';

export const EMPTY_GEMINI_SNAPSHOT = Object.freeze({
  connection: null, connectionId: null, connectionStatus: 'disconnected', accountGeneration: null,
  status: 'idle', result: null, error: null, coverages: Object.freeze([]), pendingCount: 0,
});
let accountSequence = 0;
const accountToken = () => globalThis.crypto?.randomUUID?.() || `gemini-${Date.now()}-${++accountSequence}`;

// The parser key contains connection, namespace, feature type and provider GML ID.
// Keep original immutable records and corresponding display features by identity.
export function mergeGeminiCoverages(coverages, provenance, fetchedAt) {
  const merged = {}, activeCoverages = [...coverages];
  for (const side of ['lines', 'points']) {
    const records = [], features = [], seen = new Set();
    for (const coverage of activeCoverages) {
      const batch = coverage.result?.[side];
      if (!batch) continue;
      const displays = new Map(batch.display.features.map((feature) => [feature.id, feature]));
      for (const record of batch.source.records) {
        if (seen.has(record.key)) continue;
        seen.add(record.key); records.push(record); features.push(displays.get(record.key));
      }
    }
    merged[side] = Object.freeze({
      source: Object.freeze({ records: Object.freeze(records), counts: Object.freeze({ records: records.length }) }),
      display: Object.freeze({ type: 'FeatureCollection', features: Object.freeze(features) }),
    });
  }
  const counts = Object.freeze({ lines: merged.lines.source.records.length, points: merged.points.source.records.length,
    total: merged.lines.source.records.length + merged.points.source.records.length });
  return Object.freeze({ ...merged, counts, fetchedAt, provenance: Object.freeze(provenance) });
}

export function createGeminiSession({ getLayers = () => ({}), requestPair = fetchGeminiPair,
  extent = getGeminiExtent, now = Date.now } = {}) {
  // Private slots never enter Zustand, persistence, logs, snapshots or request keys.
  let credentials = null, disposed = false, generation = 0, running = 0;
  let snapshot = EMPTY_GEMINI_SNAPSHOT;
  const units = new Map(), knownLayers = new Set(), listeners = new Set(), queue = [];
  function publish(patch = {}, merge = false) {
    const coverages = Object.freeze([...units.values()].map((unit) => Object.freeze({ ...unit.descriptor,
      result: unit.result, error: unit.error })));
    const pendingCount = [...units.values()].filter((unit) => unit.task).length;
    snapshot = Object.freeze({ ...snapshot, ...patch, coverages, pendingCount,
      ...(merge ? { result: mergeGeminiCoverages(units.values(), {
        connectionId: snapshot.connectionId, accountGeneration: snapshot.accountGeneration,
      }, now()) } : {}) });
    for (const listener of listeners) listener();
  }
  const failure = (error) => Object.freeze({ ok: false, error: safeGeminiError(error) });
  function checkAccess() {
    if (disposed) throw new GeminiServiceError('session_disposed');
    if (!snapshot.connection) throw new GeminiServiceError('connection_unavailable');
    if (!credentials) throw new GeminiServiceError('credentials_unavailable');
  }
  function finishStatus() {
    const error = [...units.values()].find((unit) => unit.error)?.error ?? null;
    publish({ status: [...units.values()].some((unit) => unit.task) ? 'loading' : error ? 'error' : 'ready', error });
  }
  function abortUnit(unit) { unit.task?.controller.abort(); unit.task = null; }
  function invalidate() {
    generation += 1;
    for (const unit of units.values()) abortUnit(unit);
    for (const task of queue.splice(0)) task.resolve(failure(new GeminiServiceError('request_aborted')));
  }
  function clearSession() {
    invalidate(); credentials = null; units.clear(); knownLayers.clear();
    publish({ ...EMPTY_GEMINI_SNAPSHOT, connection: snapshot.connection, connectionId: snapshot.connectionId });
  }
  function pump() {
    while (running < GEMINI_COVERAGE_CONCURRENCY && queue.length) {
      const task = queue.shift(), { unit } = task;
      if (unit.task !== task || task.controller.signal.aborted) {
        task.resolve(failure(new GeminiServiceError('request_aborted'))); continue;
      }
      running += 1;
      const operationCredentials = credentials, operationConnection = snapshot.connection;
      void (async () => {
        const current = () => !disposed && task.generation === generation && units.get(unit.descriptor.key) === unit && unit.task === task;
        try {
          checkAccess();
          const work = Promise.resolve().then(() => {
            if (task.controller.signal.aborted) throw new GeminiServiceError('request_aborted');
            return requestPair({ connection: operationConnection, bbox: task.descriptor.bbox,
              credentials: operationCredentials, signal: task.controller.signal });
          });
          const pair = await waitForGemini(work, task.controller.signal);
          if (!current()) throw new GeminiServiceError('request_aborted');
          if (task.descriptor.sourceLayerId && !getLayers()[task.descriptor.sourceLayerId]) throw new GeminiServiceError('request_aborted');
          unit.descriptor = task.descriptor;
          unit.result = Object.freeze({ ...pair, fetchedAt: now() }); unit.error = null; unit.task = null;
          publish({}, true);
          task.resolve(Object.freeze({ ok: true, result: snapshot.result, reused: false }));
        } catch (error) {
          const outcome = failure(current() ? error : new GeminiServiceError('request_aborted'));
          if (current()) {
            unit.task = null; unit.error = outcome.error;
            if (outcome.error.code === 'authentication_failed') {
              credentials = null; publish({ connectionStatus: 'credentials-required' });
            }
          }
          task.resolve(outcome);
        } finally {
          running -= 1;
          if (task.generation === generation) finishStatus();
          pump();
        }
      })();
    }
  }
  function enqueue(unit, descriptor, refresh = false) {
    if (unit.task) return unit.task.promise;
    if (!refresh && unit.result) return Promise.resolve(Object.freeze({ ok: true, result: snapshot.result, reused: true }));
    if (!unit.result) unit.descriptor = descriptor;
    const task = { unit, descriptor, generation, controller: new AbortController() };
    task.promise = new Promise((resolve) => { task.resolve = resolve; });
    unit.task = task; unit.error = null;
    queue.push(task); publish({ status: 'loading', error: null }); pump();
    return task.promise;
  }
  function automaticDescriptor(id, layer) {
    const bounds = extent(layer); // Always the fixed 100 m survey buffer.
    return Object.freeze({ key: `survey:${id}`, kind: 'survey', sourceLayerId: id, ...bounds });
  }
  function addAutomatic(id, layer, refresh = false) {
    const key = `survey:${id}`;
    let unit = units.get(key);
    if (!unit) { unit = { descriptor: Object.freeze({ key, kind: 'survey', sourceLayerId: id }), result: null, error: null, task: null }; units.set(key, unit); }
    try { return enqueue(unit, automaticDescriptor(id, layer), refresh); }
    catch (error) { const outcome = failure(error); unit.error = outcome.error; finishStatus(); return Promise.resolve(outcome); }
  }
  function reconcileSources() {
    if (disposed || !snapshot.accountGeneration) return [];
    const layers = getLayers(), added = [];
    let removed = false;
    for (const id of knownLayers) {
      if (!layers[id]) {
        knownLayers.delete(id);
        const unit = units.get(`survey:${id}`);
        if (unit) { abortUnit(unit); units.delete(`survey:${id}`); removed = true; }
      }
    }
    // Inspect geometry only on first appearance. Ordinary edits never enqueue.
    for (const [id, layer] of Object.entries(layers)) {
      if (knownLayers.has(id)) continue;
      knownLayers.add(id);
      if (snapshot.connectionStatus === 'connected' && isGeminiSurveyLayer(layer)) added.push(addAutomatic(id, layer));
    }
    if (removed) { publish({}, true); finishStatus(); }
    return added;
  }
  async function collect(promises) {
    const ticketGeneration = generation;
    const outcomes = await Promise.all(promises);
    if (ticketGeneration !== generation) return failure(new GeminiServiceError('request_aborted'));
    if (snapshot.status !== 'cancelled') finishStatus();
    const failed = outcomes.find((outcome) => !outcome.ok);
    return failed ?? Object.freeze({ ok: true, result: snapshot.result, reused: outcomes.length > 0 && outcomes.every((outcome) => outcome.reused) });
  }
  function fetchAll({ refresh = false } = {}) {
    try {
      checkAccess();
      const work = [...reconcileSources()];
      for (const unit of units.values()) {
        if (unit.task) { work.push(unit.task.promise); continue; }
        if (unit.descriptor.kind === 'survey') {
          const id = unit.descriptor.sourceLayerId, layer = getLayers()[id];
          if (layer) work.push(addAutomatic(id, layer, refresh));
        } else work.push(enqueue(unit, unit.descriptor, refresh));
      }
      return collect(work);
    } catch (error) { const outcome = failure(error); publish({ error: outcome.error, status: 'error' }); return Promise.resolve(outcome); }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    setConnection: (input) => {
      if (disposed) throw new GeminiServiceError('session_disposed');
      let connection;
      try { connection = validateGeminiConnection(input); }
      catch { throw new GeminiServiceError('invalid_connection'); }
      if (snapshot.connection?.id !== connection.id || snapshot.connection.url !== connection.url) clearSession();
      publish({ connection, connectionId: connection.id });
    },
    setCredentials: (input) => {
      if (disposed) throw new GeminiServiceError('session_disposed');
      validateGeminiCredentials(input); clearSession();
      credentials = Object.freeze({ username: input.username, password: input.password });
      publish({ accountGeneration: accountToken(), connectionStatus: 'connected' });
    },
    reconcileSources,
    fetch: () => fetchAll(),
    refresh: () => fetchAll({ refresh: true }),
    fetchMap: (bbox, { confirmed = false } = {}) => {
      try {
        checkAccess();
        const { level } = classifyGeminiMapExtent(bbox);
        if (level === 'blocked') throw new GeminiServiceError('map_extent_too_large');
        validateGeminiBbox(bbox);
        if (level === 'confirm' && !confirmed) return Promise.resolve(Object.freeze({ ok: false, confirmationRequired: true }));
        // Metre-level equivalence avoids accumulating tiny viewport jitter entries.
        const key = `map:${bbox.map(Math.round).join(',')}`;
        const descriptor = Object.freeze({ key, kind: 'map', bbox: Object.freeze([...bbox]), crs: 'EPSG:25832', bufferMetres: 0 });
        let unit = units.get(key);
        if (!unit) { unit = { descriptor, result: null, error: null, task: null }; units.set(key, unit); }
        return collect([enqueue(unit, descriptor, true)]);
      } catch (error) { const outcome = failure(error); publish({ error: outcome.error }); return Promise.resolve(outcome); }
    },
    cancel: () => {
      invalidate(); publish({ status: 'cancelled', error: safeGeminiError(new GeminiServiceError('request_aborted')) });
    },
    clearResult: () => { invalidate(); units.clear(); knownLayers.clear(); publish({ result: null, error: null, status: 'idle' }); },
    disconnect: clearSession, reset: clearSession,
    dispose: () => { clearSession(); disposed = true; listeners.clear(); },
  });
}

let surveyStore = null, unsubscribeStore = null;
export const geminiSession = createGeminiSession({ getLayers: () => surveyStore?.getState().layers ?? {} });

export function bindGeminiSurveyStore(store) {
  unsubscribeStore?.();
  if (surveyStore && surveyStore !== store) geminiSession.reset();
  surveyStore = store;
  // Cheap ownership observation: no feature/revision hashing and no camera/style watcher.
  unsubscribeStore = store.subscribe((state, previous) => {
    if (state.layers !== previous.layers) geminiSession.reconcileSources();
  });
  geminiSession.reconcileSources();
}
