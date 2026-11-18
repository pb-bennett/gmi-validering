import { getLayerType } from '../layerPresentation.mjs';
import { gmiSourceFingerprint } from './gmiPhotoSource.mjs';
import { getDatasetRevision } from '../validation-v2/datasetRevision.js';

export const isLoadedGmiSurveyLayer = (layer) => Boolean(layer?.data && (!layer.type || layer.type === 'GMI') && getLayerType(layer) === 'GMI');

// Original Files and parser evidence never enter Zustand or persistence.
export function createLoadedGmiSources({ getLayer = () => null } = {}) {
  const inputs = new Map();
  const tickets = new WeakMap();
  let sequence = 0;
  const isLive = (binding) => {
    const input = inputs.get(binding?.layerId), layer = getLayer(binding?.layerId);
    return Boolean(input && input.binding.inputId === binding.inputId && input.binding.datasetRevision === binding.datasetRevision
      && layer?.data === input.data && isLoadedGmiSurveyLayer(layer));
  };
  return {
    register(layerId, data, file, evidence) {
      const binding = Object.freeze({ layerId, datasetRevision: getDatasetRevision(data), inputId: globalThis.crypto?.randomUUID?.() || `gmi-input-${++sequence}`, filename: file.name });
      inputs.set(layerId, { binding, data, file, evidence, pending: null });
      return binding;
    },
    available: (layerId) => isLive(inputs.get(layerId)?.binding),
    isLive,
    begin(layerId) {
      const input = inputs.get(layerId);
      if (!isLive(input?.binding)) return null;
      const ticket = Object.freeze({ binding: input.binding });
      tickets.set(ticket, input);
      return ticket;
    },
    async read(ticket) {
      const input = tickets.get(ticket);
      if (!input || !isLive(ticket.binding)) throw new Error('stale-loaded-gmi');
      // One digest per exact captured File; no second GMI parse or decoding path.
      input.pending ||= gmiSourceFingerprint(input.file).then((fingerprint) => Object.freeze({ ...input.evidence, fingerprint }));
      const source = await input.pending;
      if (!isLive(ticket.binding)) throw new Error('stale-loaded-gmi');
      return source;
    },
    async associate(layerId, session) {
      const ticket = this.begin(layerId);
      if (!ticket || !session.getSnapshot().photoLayers.some((layer) => layer.spatialSources.some((source) =>
        source.kind === 'gmi' && (!source.loadedBinding || !isLive(source.loadedBinding))))) return false;
      const input = tickets.get(ticket);
      // Equal files have equal lengths. Read all live peers of that size before deciding uniqueness.
      const peers = () => [...inputs.values()].filter((entry) => entry.file.size === input.file.size && isLive(entry.binding));
      while (isLive(ticket.binding)) {
        const candidates = peers();
        const evidence = await Promise.allSettled(candidates.map((entry) => this.read(this.begin(entry.binding.layerId))));
        const current = peers();
        if (current.length !== candidates.length || current.some((entry, index) => entry !== candidates[index])) continue;
        if (evidence.some((result) => result.status === 'rejected')) return false;
        const source = evidence[candidates.indexOf(input)]?.value;
        if (!source || evidence.filter((result) => result.value.fingerprint === source.fingerprint).length !== 1) return false;
        return session.associateLoadedGmiSource(source, ticket.binding, isLive);
      }
      return false;
    },
    // The exact imported bytes, for source-preserving GMI editing. Each call reads the captured File again and returns
    // a fresh buffer that nothing else holds, so callers can never reach shared state. Nothing is cached here: the
    // editing document keeps its own private copy, and modified bytes are never written back.
    async readBytes(ticket) {
      const input = tickets.get(ticket);
      if (!input || !isLive(ticket.binding)) throw Object.assign(new Error('stale-loaded-gmi'), { code: 'stale-loaded-gmi' });
      let buffer;
      try { buffer = await input.file.arrayBuffer(); }
      catch { throw Object.assign(new Error('loaded-gmi-unreadable'), { code: 'loaded-gmi-unreadable' }); }
      if (!isLive(ticket.binding)) throw Object.assign(new Error('stale-loaded-gmi'), { code: 'stale-loaded-gmi' });
      return new Uint8Array(buffer);
    },
    reconcile() {
      for (const [id, input] of inputs) if (!isLive(input.binding)) inputs.delete(id);
    },
  };
}

let surveyStore = null;
export const loadedGmiSources = createLoadedGmiSources({ getLayer: (id) => surveyStore?.getState().layers[id] });

export function bindLoadedGmiSurveyStore(store, session) {
  surveyStore = store;
  store.subscribe((state, previous) => {
    if (state.layers === previous.layers) return;
    loadedGmiSources.reconcile();
    session.reconcileLoadedGmiBindings(loadedGmiSources.isLive);
    // Registration precedes publication. Start only once the new dataset is live in the store.
    for (const [id, layer] of Object.entries(state.layers)) {
      if (layer.data !== previous.layers[id]?.data) void loadedGmiSources.associate(id, session);
    }
  });
}
