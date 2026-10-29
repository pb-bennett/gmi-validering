import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
register('./esmJsLoader.mjs', import.meta.url);
const { createGeminiPresentation, getGeminiReferenceBounds, getGeminiReferenceNotice,
  GEMINI_REFERENCE_Z_INDEX, GEMINI_LINE_STYLE, GEMINI_POINT_STYLE } = await import('../src/lib/gemini-wfs/geminiReferencePresentation.mjs');
const { PHOTO_MARKER_Z_INDEX, PHOTO_PLACEMENT_Z_INDEX } = await import('../src/lib/photos/photoMapPanes.mjs');

const result = (lines = [], points = [], owner = {}) => ({
  lines: { display: { type: 'FeatureCollection', features: lines.map((coordinates, index) => ({ id: `line-${index}`, geometry: { type: 'LineString', coordinates } })) } },
  points: { display: { type: 'FeatureCollection', features: points.map((coordinates, index) => ({ id: `point-${index}`, geometry: { type: 'Point', coordinates } })) } },
  counts: { lines: lines.length, points: points.length },
  provenance: { connectionId: 'faerder-va-basis', accountGeneration: 'opaque-a', sourceLayerId: 'a', datasetRevision: 'revision-a', ...owner },
});
function setup() {
  let snapshot = { result: null, status: 'idle', error: null, stale: false };
  const subscribers = new Set();
  const session = { getSnapshot: () => snapshot, subscribe: (listener) => { subscribers.add(listener); return () => subscribers.delete(listener); } };
  const presentation = createGeminiPresentation(session);
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; for (const listener of subscribers) listener(); };
  return { session, presentation, publish };
}
test('default independent visibility, no result no-op, state contains no source data', () => {
  const { presentation, publish, session } = setup();
  presentation.setVisible('lines', false); assert.equal(presentation.getSnapshot().linesVisible, true);
  const pair = result([], [[10, 59]]); const before = JSON.stringify(pair);
  publish({ result: pair }); presentation.setVisible('lines', false);
  assert.equal(presentation.getSnapshot().linesVisible, false); assert.equal(presentation.getSnapshot().pointsVisible, true);
  presentation.setVisible('points', false); assert.equal(presentation.getSnapshot().pointsVisible, false);
  assert.strictEqual(session.getSnapshot().result, pair); assert.equal(JSON.stringify(pair), before);
  assert.deepEqual(Object.keys(presentation.getSnapshot()).sort(), ['linesVisible', 'pointsVisible', 'resultVersion', 'zoomRequest']);
  presentation.dispose();
});
test('ordinary refresh preserves visibility but versions the pair for atomic GeoJSON replacement', () => {
  const { presentation, publish } = setup(); publish({ result: result() });
  presentation.setVisible('lines', false); const version = presentation.getSnapshot().resultVersion;
  publish({ status: 'loading' }); assert.equal(presentation.getSnapshot().resultVersion, version);
  publish({ result: result(), status: 'ready' });
  assert.equal(presentation.getSnapshot().resultVersion, version + 1); assert.equal(presentation.getSnapshot().linesVisible, false);
  presentation.dispose();
});
test('new source, dataset, account or connection resets visibility to both visible', () => {
  for (const owner of [{ sourceLayerId: 'b' }, { datasetRevision: 'b' }, { accountGeneration: 'b' }, { connectionId: 'b' }]) {
    const { presentation, publish } = setup(); publish({ result: result() });
    presentation.setVisible('lines', false); presentation.setVisible('points', false);
    publish({ result: result([], [], owner) });
    assert(presentation.getSnapshot().linesVisible && presentation.getSnapshot().pointsVisible); presentation.dispose();
  }
});
test('clear/reset/disconnect removal resets visibility and discards pending zoom', () => {
  const { presentation, publish } = setup(); publish({ result: result() });
  presentation.setVisible('points', false); presentation.requestZoom(); publish({ result: null });
  assert.equal(presentation.getSnapshot().zoomRequest, null);
  assert(presentation.getSnapshot().linesVisible && presentation.getSnapshot().pointsVisible);
  publish({ result: result() }); assert(presentation.getSnapshot().pointsVisible); presentation.dispose();
});
test('retained good pair is unchanged on loading, failure and staleness', () => {
  const { presentation, publish } = setup(); const pair = result(); publish({ result: pair });
  presentation.setVisible('points', false); const stable = presentation.getSnapshot();
  for (const patch of [{ status: 'loading' }, { status: 'error', error: { code: 'timeout' } }, { stale: true }]) {
    publish(patch); assert.strictEqual(presentation.getSnapshot(), stable);
  }
  presentation.dispose();
});
test('zoom intent is versioned/acknowledged without changing visibility or fetching', () => {
  const { presentation, publish } = setup(); presentation.requestZoom(); assert.equal(presentation.getSnapshot().zoomRequest, null);
  publish({ result: result() }); presentation.setVisible('lines', false);
  presentation.requestZoom(); const first = presentation.getSnapshot().zoomRequest;
  presentation.requestZoom(); const second = presentation.getSnapshot().zoomRequest;
  presentation.acknowledgeZoom(first.id); assert.strictEqual(presentation.getSnapshot().zoomRequest, second);
  presentation.acknowledgeZoom(second.id); assert.equal(presentation.getSnapshot().zoomRequest, null);
  assert.equal(presentation.getSnapshot().linesVisible, false);
  presentation.requestZoom(); publish({ result: result() }); assert.equal(presentation.getSnapshot().zoomRequest, null);
  presentation.dispose();
});
test('bounds include all intermediate display vertices and both sides without mutation or projection', () => {
  const pair = result([[[10, 59], [9.9, 59.3], [10.1, 59.1]]], [[10.4, 59.2]]);
  const before = JSON.stringify(pair);
  assert.deepEqual(getGeminiReferenceBounds(pair), [[59, 9.9], [59.3, 10.4]]);
  assert.equal(JSON.stringify(pair), before);
});
test('zoom bounds support lines only, points only, single point, empty side and wholly empty results', () => {
  assert.deepEqual(getGeminiReferenceBounds(result([[[10, 59], [10.1, 59.2]]])), [[59, 10], [59.2, 10.1]]);
  assert.deepEqual(getGeminiReferenceBounds(result([], [[10, 59], [10.2, 59.1]])), [[59, 10], [59.1, 10.2]]);
  assert.deepEqual(getGeminiReferenceBounds(result([], [[10, 59]])), [[59, 10], [59, 10]]);
  assert.equal(getGeminiReferenceBounds(result()), null); assert.equal(getGeminiReferenceBounds(null), null);
});
test('notices are compact fixed text and do not display error codes or provider content', () => {
  assert.equal(getGeminiReferenceNotice({ result: null }), null);
  assert.equal(getGeminiReferenceNotice({ result: result(), status: 'ready' }), null);
  assert.match(getGeminiReferenceNotice({ result: result(), status: 'loading' }), /viser forrige resultat/);
  assert.match(getGeminiReferenceNotice({ result: result(), error: { message: 'PRIVATE' } }), /Siste henting mislyktes/);
  assert.match(getGeminiReferenceNotice({ result: result(), stale: true }), /Utdatert referanse/);
});
test('pane and restrained shared-token styles remain below existing survey/photo geometry', () => {
  assert.equal(GEMINI_REFERENCE_Z_INDEX, 380);
  assert(GEMINI_REFERENCE_Z_INDEX < 390 && 390 < 400 && 400 < 600 && 600 < PHOTO_MARKER_Z_INDEX && PHOTO_MARKER_Z_INDEX < PHOTO_PLACEMENT_Z_INDEX);
  assert.equal(GEMINI_LINE_STYLE.interactive, false); assert.equal(GEMINI_POINT_STYLE.interactive, false);
  assert.equal(GEMINI_POINT_STYLE.radius, 3);
  assert(GEMINI_LINE_STYLE.weight <= 2 && GEMINI_LINE_STYLE.opacity < 1);
  assert.match(GEMINI_LINE_STYLE.color, /^var\(--gmi-/);
});
test('MapInner/LayerManager mount independent components without modifying survey/WMS/popup pipelines', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const [map, manager, layer, card, presentation] = await Promise.all([
    read('../src/components/MapInner.js'), read('../src/components/LayerManager.js'),
    read('../src/components/gemini-wfs/GeminiReferenceLayer.js'), read('../src/components/gemini-wfs/GeminiReferenceCard.js'),
    read('../src/lib/gemini-wfs/geminiReferencePresentation.mjs'),
  ]);
  assert.match(map, /<GeminiReferenceLayer \/>/); assert.match(manager, /<GeminiReferenceCard onOpenConnection=\{onOpenGemini\}/);
  assert.match(map, /name="layer-highlight-casing" style=\{\{ zIndex: 390/);
  assert.match(map, /<AuthenticatedWmsLayer/); assert.match(manager, /setMapOverlayVisibility\(\s*'geminiWms'/);
  assert.match(layer, /<Fragment key=\{resultVersion\}>/);
  assert.match(layer, /data=\{result.lines.display\}/); assert.match(layer, /data=\{result.points.display\}/);
  assert.match(layer, /pointerEvents: 'none'/); assert.match(layer, /interactive=\{false\}/);
  assert.doesNotMatch(layer, /onEachFeature|bindPopup|Popup|eventHandlers|draggable|normalizeFeature|proj4|parseGeminiGml/);
  for (const source of [layer, presentation]) {
    assert.doesNotMatch(source, /setCredentials|\.fetch\(|\.refresh\(|addLayer|localStorage|sessionStorage|setState|normalizeFeature/);
  }
  // M5 deliberately adds explicit card refresh/disconnect; the rendering and
  // visibility domains still have no network/credential responsibilities.
  assert.match(card, /geminiSession\.refresh\(result\.provenance\.sourceLayerId\)/);
  assert.match(card, /geminiSession\.disconnect\(\)/);
  assert.doesNotMatch(card, /setCredentials|\.fetch\(|addLayer|localStorage|sessionStorage|setState|normalizeFeature/);
  assert.match(card, /if \(!result\) return null/); assert.match(card, /aria-pressed=\{visible\}/);
  assert.match(card, /disabled=\{!bounds\}/); assert.match(card, /gmi-focus-ring/);
  assert.doesNotMatch(card, /LayerTypeBadge|LayerPanel|password|username/);
});
