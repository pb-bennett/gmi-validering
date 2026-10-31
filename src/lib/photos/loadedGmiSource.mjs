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
    return Boolean(input && input.binding.inputId === binding.inputId && layer?.data === input.data && isLoadedGmiSurveyLayer(layer));
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
  });
}
