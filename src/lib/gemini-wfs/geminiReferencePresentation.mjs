import { geminiSession } from './geminiSession.mjs';
import { DEFAULT_GEMINI_FILTERS, GEMINI_FILTER_BASES, classifyGeminiResult } from './geminiFilters.mjs';
import { geminiFilterPreferences } from './geminiFilterPreferences.mjs';
import { GEMINI_WFS_HALO, getLayerHighlightStyle } from '../map/layerHighlight.mjs';

export const GEMINI_REFERENCE_PANE = 'gemini-reference';
export const GEMINI_REFERENCE_Z_INDEX = 380;
export const GEMINI_PRESENTATION_SOURCE_ID = 'gemini-wfs-reference';
export const DEFAULT_GEMINI_MARKING = Object.freeze({
  id: GEMINI_PRESENTATION_SOURCE_ID, name: 'Gemini WFS', visible: true,
  highlightAll: false, defaultHighlightColor: GEMINI_WFS_HALO.color,
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
  sourceVisible: true, linesVisible: true, pointsVisible: true, resultVersion: 0, zoomRequest: null, marking: DEFAULT_GEMINI_MARKING,
  filters: DEFAULT_GEMINI_FILTERS, filterSaveFailed: false, openFilterGroups: Object.freeze([]),
});

export function createGeminiPresentation(session, preferences = null) {
  let snapshot = EMPTY_GEMINI_PRESENTATION, currentResult = null, owner = null;
  let version = 0, zoomSequence = 0;
  // Filters belong to the service URL: they survive account, result and visibility resets.
  let feedUrl = null;
  const feedFilters = new Map();
  const listeners = new Set();
  const publish = (patch) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  };
  const storeFilters = (filters, options) => {
    if (feedUrl) feedFilters.set(feedUrl, filters);
    const saved = !feedUrl || !preferences || preferences.save(feedUrl, filters, options);
    publish({ filters, filterSaveFailed: !saved });
  };
  const editGroup = (id, change) => {
    if (!Object.hasOwn(snapshot.filters.groups, id)) return;
    storeFilters(Object.freeze({ ...snapshot.filters, groups: Object.freeze({
      ...snapshot.filters.groups, [id]: Object.freeze(change(snapshot.filters.groups[id])) }) }));
  };
  const sync = () => {
    const { result, connection } = session.getSnapshot();
    const url = connection?.url ?? null;
    if (url !== feedUrl) {
      feedUrl = url;
      const filters = (url && (feedFilters.get(url) ?? preferences?.read(url))) || DEFAULT_GEMINI_FILTERS;
      publish({ filters, filterSaveFailed: false });
    }
    if (result === currentResult) return;
    currentResult = result;
    // Once seen, a feed's status vocabulary stays known; a later extent cannot change the default.
    if (!snapshot.filters.statusRecognised && classifyGeminiResult(result)?.statusKnown) {
      storeFilters(Object.freeze({ ...snapshot.filters, statusRecognised: true }), { keepUnreadable: true });
    }
    const provenance = result?.provenance;
    const nextOwner = result ? JSON.stringify([provenance.connectionId, provenance.accountGeneration]) : null;
    const resetVisibility = nextOwner !== owner || !result;
    owner = nextOwner;
    publish({ resultVersion: ++version, zoomRequest: null,
      ...(resetVisibility ? { sourceVisible: true, linesVisible: true, pointsVisible: true, marking: DEFAULT_GEMINI_MARKING } : {}) });
  };
  const unsubscribe = session.subscribe(sync);
  sync();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setSourceVisible: (visible) => {
      if (typeof visible !== 'boolean' || !currentResult) return;
      publish({ sourceVisible: visible,
        ...(visible && !snapshot.linesVisible && !snapshot.pointsVisible ? { linesVisible: true, pointsVisible: true } : {}) });
    },
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
    setFilterValue: (id, key, checked) => {
      if (typeof key !== 'string' || typeof checked !== 'boolean') return;
      editGroup(id, (group) => ({ ...group, overrides: Object.freeze({ ...group.overrides, [key]: checked }) }));
    },
    setFilterBase: (id, base) => {
      if (GEMINI_FILTER_BASES.includes(base)) editGroup(id, () => ({ base, overrides: Object.freeze({}) }));
    },
    resetFilters: () => storeFilters(Object.freeze({ ...DEFAULT_GEMINI_FILTERS, statusRecognised: snapshot.filters.statusRecognised })),
    setFilterGroupOpen: (id, open) => publish({ openFilterGroups: Object.freeze([
      ...snapshot.openFilterGroups.filter((item) => item !== id), ...(open ? [id] : [])]) }),
    requestZoom: () => {
      if (currentResult) publish({ zoomRequest: Object.freeze({ id: ++zoomSequence, resultVersion: snapshot.resultVersion }) });
    },
    acknowledgeZoom: (id) => { if (snapshot.zoomRequest?.id === id) publish({ zoomRequest: null }); },
    dispose: () => { unsubscribe(); listeners.clear(); },
  });
}

// Visibility, marking, filter choices and a small zoom intent only; no features or credentials.
// Filter choices alone are persisted, by the injected preference owner.
export const geminiPresentation = createGeminiPresentation(geminiSession, geminiFilterPreferences);

// The shared Lagmarkering controls consume actions, not survey-store ownership.
export const geminiMarkingActions = Object.freeze({
  setEnabled: (_id, value) => geminiPresentation.setMarking({ highlightAll: value }),
  setColor: (_id, color) => { if (/^#[0-9a-f]{6}$/i.test(color)) geminiPresentation.setMarking({ highlightStyle: { color: color.toUpperCase() } }); },
  setOpacity: (_id, opacity) => { if (Number.isFinite(opacity)) geminiPresentation.setMarking({ highlightStyle: { opacity } }); },
  setSpread: (_id, spread) => { if (Number.isFinite(spread)) geminiPresentation.setMarking({ highlightStyle: { spread: Math.round(spread) } }); },
  resetStyle: () => geminiPresentation.resetMarking(),
});
