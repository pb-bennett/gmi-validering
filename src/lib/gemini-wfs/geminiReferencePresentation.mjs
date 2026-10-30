import { geminiSession } from './geminiSession.mjs';
import { GEMINI_WFS_HALO, getLayerHighlightStyle } from '../map/layerHighlight.mjs';

export const GEMINI_REFERENCE_PANE = 'gemini-reference';
export const GEMINI_REFERENCE_Z_INDEX = 380;
export const GEMINI_PRESENTATION_SOURCE_ID = 'gemini-wfs-reference';
export const DEFAULT_GEMINI_MARKING = Object.freeze({
  id: GEMINI_PRESENTATION_SOURCE_ID, name: 'Gemini WFS', visible: true,
  highlightAll: true, defaultHighlightColor: GEMINI_WFS_HALO.color,
  highlightStyle: GEMINI_WFS_HALO,
});

// Already-projected M2 display data only. Include every returned vertex, even
// outside the request BBOX or in a currently hidden reference sublayer.
export function getGeminiReferenceBounds(result) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const side of [result?.lines, result?.points]) {
    for (const feature of side?.display.features || []) {
      const geometry = feature.geometry;
      const tuples = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates;
      for (const [longitude, latitude] of tuples) {
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
        west = Math.min(west, longitude); east = Math.max(east, longitude);
        south = Math.min(south, latitude); north = Math.max(north, latitude);
      }
    }
  }
  return west === Infinity ? null : Object.freeze([Object.freeze([south, west]), Object.freeze([north, east])]);
}

export function getGeminiReferenceNotice(snapshot) {
  if (!snapshot.result) return null;
  if (snapshot.status === 'loading') return 'Oppdaterer · viser forrige resultat';
  if (snapshot.error) return 'Siste henting mislyktes · viser forrige resultat';
  if (snapshot.stale) return 'Utdatert referanse · innmålingsgrunnlaget er endret';
  return null;
}

export const EMPTY_GEMINI_PRESENTATION = Object.freeze({
  linesVisible: true, pointsVisible: true, resultVersion: 0, zoomRequest: null, marking: DEFAULT_GEMINI_MARKING,
});

export function createGeminiPresentation(session) {
  let snapshot = EMPTY_GEMINI_PRESENTATION, currentResult = null, owner = null;
  let version = 0, zoomSequence = 0;
  const listeners = new Set();
  const publish = (patch) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  };
  const sync = () => {
    const result = session.getSnapshot().result;
    if (result === currentResult) return;
    currentResult = result;
    const provenance = result?.provenance;
    const nextOwner = result ? JSON.stringify([provenance.connectionId, provenance.accountGeneration,
      provenance.sourceLayerId, provenance.datasetRevision]) : null;
    const resetVisibility = nextOwner !== owner || !result;
    owner = nextOwner;
    publish({ resultVersion: ++version, zoomRequest: null,
      ...(resetVisibility ? { linesVisible: true, pointsVisible: true, marking: DEFAULT_GEMINI_MARKING } : {}) });
  };
  const unsubscribe = session.subscribe(sync);
  sync();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setVisible: (side, visible) => {
      if (!['lines', 'points'].includes(side) || typeof visible !== 'boolean' || !currentResult) return;
      const key = `${side}Visible`;
      if (snapshot[key] !== visible) publish({ [key]: visible });
    },
    setMarking: (patch) => {
      if (!currentResult) return;
      const source = snapshot.marking;
      const highlightStyle = getLayerHighlightStyle({ highlightStyle: { ...source.highlightStyle, ...patch.highlightStyle } }, source.id);
      publish({ marking: Object.freeze({ ...source, highlightAll: patch.highlightAll ?? source.highlightAll,
        highlightStyle: Object.freeze(highlightStyle) }) });
    },
    resetMarking: () => { if (currentResult) publish({ marking: Object.freeze({ ...DEFAULT_GEMINI_MARKING, highlightAll: snapshot.marking.highlightAll }) }); },
    requestZoom: () => {
      if (currentResult) publish({ zoomRequest: Object.freeze({ id: ++zoomSequence, resultVersion: snapshot.resultVersion }) });
    },
    acknowledgeZoom: (id) => { if (snapshot.zoomRequest?.id === id) publish({ zoomRequest: null }); },
    dispose: () => { unsubscribe(); listeners.clear(); },
  });
}

// Visibility, source marking and a small zoom intent only; no features, credentials or persistence.
export const geminiPresentation = createGeminiPresentation(geminiSession);

// The shared Lagmarkering controls consume actions, not survey-store ownership.
export const geminiMarkingActions = Object.freeze({
  setEnabled: (_id, value) => geminiPresentation.setMarking({ highlightAll: value }),
  setColor: (_id, color) => { if (/^#[0-9a-f]{6}$/i.test(color)) geminiPresentation.setMarking({ highlightStyle: { color: color.toUpperCase() } }); },
  setOpacity: (_id, opacity) => { if (Number.isFinite(opacity)) geminiPresentation.setMarking({ highlightStyle: { opacity } }); },
  setSpread: (_id, spread) => { if (Number.isFinite(spread)) geminiPresentation.setMarking({ highlightStyle: { spread: Math.round(spread) } }); },
  resetStyle: () => geminiPresentation.resetMarking(),
});
